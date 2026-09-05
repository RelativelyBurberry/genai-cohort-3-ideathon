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
} from '../services/patternShiftPersistence.js';

export const patternShiftRouter = Router();

/**
 * POST /api/patternshift/analyze
 *
 * Runs deterministic pattern extraction and conditional Gemini interpretation across
 * the authenticated user's historical journal entries and completed reflections.
 */
patternShiftRouter.post(
  '/api/patternshift/analyze',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;
    const token = req.token;
    const isTesting = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const passToken = isTesting ? undefined : token;

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

      // 2. Fetch User's Historical Data (Strictly isolated by verified UID)
      const [entries, conversations] = await Promise.all([
        fetchUserEntriesForPatternShift(uid, passToken),
        fetchUserConversationsForPatternShift(uid, passToken),
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
        type: 'patternshift' as const,
      };

      await persistPatternShiftInsight(uid, newInsight, passToken);

      res.status(200).json({
        status: 'success',
        insight: newInsight,
      });
    } catch (err: any) {
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
 */
patternShiftRouter.get(
  '/api/patternshift/latest',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;
    const token = req.token;
    const isTesting = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const passToken = isTesting ? undefined : token;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    try {
      const latestInsight = await fetchLatestPatternShiftInsight(uid, passToken);

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
