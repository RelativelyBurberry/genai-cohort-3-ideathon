import crypto from 'crypto';
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { checkAndIncrementRateLimit } from '../services/rateLimiter.js';
import { computePatternShiftMetrics } from '../services/patternShiftEngine.js';
import { generatePatternShiftInsights } from '../services/geminiService.js';
import {
  fetchUserEntriesForPatternShift,
  fetchUserConversationsForPatternShift,
  persistPatternShiftInsight,
  fetchLatestPatternShiftInsight,
  BackendPersistenceUnavailableError,
} from '../services/patternShiftPersistence.js';
import { toBackendPersistenceApiResponse } from '../services/privilegedPersistence.js';

export const patternShiftRouter = Router();

/**
 * POST /api/patternshift/analyze
 *
 * Runs deterministic pattern extraction and conditional Gemini interpretation
 * across the authenticated user's historical journal entries and completed
 * reflections.
 *
 * Authority matrix:
 * - USER-AUTHORIZED READS (entries, conversations): may use the user's
 *   ID token over REST for AI Studio compatibility.
 * - BACKEND-OWNED WRITE (insight persistence): privileged Admin SDK only.
 *   NEVER uses the user token. If the runtime lacks Firestore IAM, the
 *   write fails closed with BACKEND_PERSISTENCE_UNAVAILABLE.
 */
patternShiftRouter.post(
  '/api/patternshift/analyze',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;
    const token = req.token;
    // USER-AUTHORIZED READS only; never a write authority.
    const readToken = token;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    try {
      // 1. Rate Limiting Check (10 req/60s per user)
      const rateLimit = await checkAndIncrementRateLimit(uid, {
        maxRequests: 10,
        windowSeconds: 60,
      });

      if (!rateLimit.allowed) {
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: `Too many pattern analysis requests. Please retry in ${rateLimit.retryAfterSeconds} seconds.`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      // 2. Fetch User's Historical Data (USER-AUTHORIZED READS)
      const [entries, conversations] = await Promise.all([
        fetchUserEntriesForPatternShift(uid, readToken),
        fetchUserConversationsForPatternShift(uid, readToken),
      ]);

      // 3. Deterministic Preprocessing Engine
      const engineResult = computePatternShiftMetrics(entries, conversations);

      // 4. Insufficient Data Guard (< 3 meaningful items)
      if (!engineResult.hasSufficientData || !engineResult.metrics) {
        res.status(200).json({
          status: 'insufficient_data',
          required: engineResult.requiredCount,
          available: engineResult.availableCount,
          message:
            'At least 3 journal entries or completed guided reflections are required to identify longitudinal patterns.',
        });
        return;
      }

      // 5. Gemini Interpretation Layer (Receives ONLY bounded metrics)
      const aiInsights = await generatePatternShiftInsights(engineResult.metrics);

      // 6. Construct and Persist Insight Document
      //    (BACKEND-OWNED WRITE — privileged Admin SDK only, no user token)
      const insightId = crypto.randomUUID();
      const newInsight = {
        id: insightId,
        generatedAt: new Date().toISOString(),
        timeRange: engineResult.metrics.timeRange,
        itemCount: {
          entries: engineResult.metrics.entryCount,
          completedConversations: engineResult.metrics.completedConversationCount,
          total: engineResult.metrics.totalItems,
        },
        metrics: engineResult.metrics,
        observations: aiInsights.observations,
        suggestedInquiries: aiInsights.suggestedInquiries,
        intelligence: engineResult.intelligence || null,
        type: 'patternshift' as const,
      };

      await persistPatternShiftInsight(uid, newInsight);

      res.status(200).json({
        status: 'success',
        insight: newInsight,
      });
    } catch (err: any) {
      // Capability error: privileged persistence unavailable in this
      // runtime. Fail closed; do NOT return a successful insight
      // payload that was never persisted.
      if (err instanceof BackendPersistenceUnavailableError) {
        const apiResp = toBackendPersistenceApiResponse(err, 'persistPatternShiftInsight');
        console.error('[PATTERNSHIFT_ANALYZE_ERROR] capability unavailable:', err.operation);
        res.status(apiResp.status).json({
          error: apiResp.body.error,
          message: apiResp.body.message,
        });
        return;
      }

      // Configuration error: the AI interpretation layer cannot start
      // because its secret is unavailable in this runtime. Surface an
      // honest, actionable 503 (mirroring the reflection route) instead
      // of a misleading generic 500. NEVER fall back to fake insights.
      const isGeminiConfigError =
        typeof err?.message === 'string' && err.message.includes('GEMINI_CONFIGURATION_ERROR');
      if (isGeminiConfigError) {
        console.error('[PATTERNSHIFT_ANALYZE_ERROR] AI configuration error (secret unavailable).');
        res.status(503).json({
          error: 'service_unavailable',
          message:
            'PatternShift analysis is temporarily unavailable because the AI configuration is incomplete. Please try again later.',
        });
        return;
      }

      console.error('[PATTERNSHIFT_ANALYZE_ERROR]', err);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to complete pattern analysis. Please try again later.',
      });
    }
  }
);

/**
 * GET /api/patternshift/latest
 *
 * Retrieves the latest persisted PatternShift insight for the authenticated user.
 * USER-AUTHORIZED READ.
 */
patternShiftRouter.get(
  '/api/patternshift/latest',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;
    const token = req.token;
    // USER-AUTHORIZED READ only; never a write authority.
    const readToken = token;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    try {
      const latestInsight = await fetchLatestPatternShiftInsight(uid, readToken);

      res.status(200).json({
        status: 'success',
        insight: latestInsight,
      });
    } catch (err: any) {
      console.error('[PATTERNSHIFT_LATEST_ERROR]', err);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to retrieve latest pattern insights.',
      });
    }
  }
);
