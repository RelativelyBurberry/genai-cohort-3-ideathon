import crypto from 'crypto';
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { checkAndIncrementRateLimit } from '../services/rateLimiter.js';
import { computePatternShiftMetrics } from '../services/patternShiftEngine.js';
import { generatePatternShiftInsights } from '../services/geminiService.js';
import {
  persistPatternShiftInsight,
  fetchLatestPatternShiftInsight,
  BackendPersistenceUnavailableError,
  BackendReadUnavailableError,
} from '../services/patternShiftPersistence.js';
import {
  validatePatternShiftAnalysisPayload,
  PATTERN_ANALYSIS_PAYLOAD_LIMITS,
} from '../services/patternShiftPayload.js';

export const patternShiftRouter = Router();

/**
 * POST /api/patternshift/analyze
 *
 * CLIENT-READ PRIMARY ARCHITECTURE.
 *
 * The authenticated frontend reads the user's journal entries and completed
 * reflections through the Firebase Client SDK, builds a minimal, validated
 * `analysisPayload`, and sends it in the FIRST AND ONLY request.
 *
 * This endpoint:
 * - verifies the Firebase ID token via requireAuth;
 * - derives identity EXCLUSIVELY from the verified token (body uid fields
 *   are never read);
 * - validates `analysisPayload` strictly (unknown keys rejected, bounds
 *   enforced);
 * - performs ZERO Firestore reads for the analysis request;
 * - computes deterministic PatternShift intelligence and invokes Gemini
 *   with bounded metrics only;
 * - persists the generated insight via the privileged Admin SDK WHEN the
 *   runtime has IAM authority; otherwise returns the successful insight
 *   ephemerally with `persistence: { persisted: false }`. A successful
 *   analysis NEVER depends on backend Firestore write/read IAM.
 * - returns exactly ONE canonical response contract.
 *
 * SECURITY: The Firebase ID token is NEVER forwarded to the Google Cloud
 * Firestore REST API (Firebase Auth ID tokens are not Google OAuth2 access
 * tokens and would return 401 UNAUTHENTICATED). All backend reads/writes
 * use the privileged Admin SDK only.
 */
patternShiftRouter.post(
  '/api/patternshift/analyze',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    console.log('[PATTERNSHIFT ROUTE HIT]', {
      timestamp: new Date().toISOString(),
      uid,
      hasAuth: Boolean(req.headers.authorization),
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : null,
      entriesCount: Array.isArray(req.body?.analysisPayload?.entries)
        ? req.body.analysisPayload.entries.length
        : undefined,
      conversationsCount: Array.isArray(req.body?.analysisPayload?.completedConversations)
        ? req.body.analysisPayload.completedConversations.length
        : undefined,
    });

    if (!uid) {
      console.log('[PATTERNSHIFT RESPONSE SHAPE] 401 unauthorized');
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    // Strict payload validation. `analysisPayload` is REQUIRED: the
    // client-read primary flow always supplies it.
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.analysisPayload === undefined || body.analysisPayload === null) {
      console.log('[PATTERNSHIFT RESPONSE SHAPE] 400 invalid_analysis_payload (missing analysisPayload)');
      res.status(400).json({
        error: 'invalid_analysis_payload',
        message: 'analysisPayload is required. The frontend must supply its authenticated records for analysis.',
      });
      return;
    }

    const payloadValidation = validatePatternShiftAnalysisPayload(body.analysisPayload);
    if (!payloadValidation.valid) {
      console.log('[PATTERNSHIFT RESPONSE SHAPE] 400 invalid_analysis_payload:', payloadValidation.error);
      res.status(400).json({
        error: 'invalid_analysis_payload',
        message: payloadValidation.error,
      });
      return;
    }

    try {
      // 1. Rate Limiting Check (10 req/60s per user)
      const rateLimit = await checkAndIncrementRateLimit(uid, {
        maxRequests: 10,
        windowSeconds: 60,
      });

      if (!rateLimit.allowed) {
        console.log('[PATTERNSHIFT RESPONSE SHAPE] 429 rate_limit_exceeded');
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: `Too many pattern analysis requests. Please retry in ${rateLimit.retryAfterSeconds} seconds.`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      // 2. Analysis inputs come EXCLUSIVELY from the validated client
      //    payload. This route performs ZERO Firestore reads.
      const entries = payloadValidation.entries;
      const conversations = payloadValidation.completedConversations;

      // 3. Deterministic Preprocessing Engine
      const engineResult = computePatternShiftMetrics(entries, conversations);

      // 4. Insufficient Data Guard (< 3 meaningful items)
      if (!engineResult.hasSufficientData || !engineResult.metrics) {
        console.log('[PATTERNSHIFT RESPONSE SHAPE] 200 insufficient_data', {
          required: engineResult.requiredCount,
          available: engineResult.availableCount,
        });
        res.status(200).json({
          status: 'insufficient_data',
          required: engineResult.requiredCount,
          available: engineResult.availableCount,
          message:
            'At least 3 journal entries or completed guided reflections are required to identify longitudinal patterns.',
        });
        return;
      }

      // 5. Gemini Interpretation Layer (Receives ONLY bounded metrics —
      //    never raw content, never location coordinates)
      const aiInsights = await generatePatternShiftInsights(engineResult.metrics);

      // 6. Construct Insight Document
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

      // 7. Persist Insight Document (privileged Admin SDK write ONLY —
      //    never a user token). A verified infrastructure capability
      //    failure MUST NOT break a successful analysis: the insight is
      //    returned ephemerally with explicit persistence metadata.
      try {
        await persistPatternShiftInsight(uid, newInsight);
        console.log('[PATTERNSHIFT RESPONSE SHAPE] 200 success (persisted: true)', {
          insightId: newInsight.id,
        });
        res.status(200).json({
          status: 'success',
          insight: newInsight,
          persistence: { persisted: true },
        });
        return;
      } catch (persistErr: any) {
        if (persistErr instanceof BackendPersistenceUnavailableError) {
          console.warn(
            `[PATTERNSHIFT_ANALYZE] insight generated but NOT persisted for user ${uid} (backend Firestore IAM unavailable). Returning insight with persistence metadata.`
          );
          console.log('[PATTERNSHIFT RESPONSE SHAPE] 200 success (persisted: false)', {
            insightId: newInsight.id,
            reason: 'backend_persistence_unavailable',
          });
          res.status(200).json({
            status: 'success',
            insight: newInsight,
            persistence: { persisted: false, reason: 'backend_persistence_unavailable' },
          });
          return;
        }
        // Unexpected persistence error: do NOT claim success.
        throw persistErr;
      }
    } catch (err: any) {
      // Configuration error: the AI interpretation layer cannot start
      // because its secret is unavailable in this runtime. Surface an
      // honest, actionable 503 (mirroring the reflection route) instead
      // of a misleading generic 500. NEVER fall back to fake insights.
      const isGeminiConfigError =
        typeof err?.message === 'string' && err.message.includes('GEMINI_CONFIGURATION_ERROR');
      if (isGeminiConfigError) {
        console.error('[PATTERNSHIFT_ANALYZE_ERROR] AI configuration error (secret unavailable).');
        console.log('[PATTERNSHIFT RESPONSE SHAPE] 503 service_unavailable');
        res.status(503).json({
          error: 'service_unavailable',
          message:
            'PatternShift analysis is temporarily unavailable because the AI configuration is incomplete. Please try again later.',
        });
        return;
      }

      console.error('[PATTERNSHIFT_ANALYZE_ERROR]', err);
      console.log('[PATTERNSHIFT RESPONSE SHAPE] 500 internal_error');
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
 * Fallback read of the most recently persisted PatternShift insight.
 *
 * The frontend normally reads its own insights directly via the Firebase
 * Client SDK (firestore.rules allow owner reads). This endpoint remains as
 * a backend fallback. It performs a privileged Admin SDK read ONLY — the
 * Firebase ID token is never forwarded to Firestore REST.
 *
 * If the runtime lacks backend Firestore read IAM (AI Studio preview
 * sandbox), it gracefully returns `insight: null` so the frontend shows
 * the empty state without a false error.
 */
patternShiftRouter.get(
  '/api/patternshift/latest',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    try {
      const latestInsight = await fetchLatestPatternShiftInsight(uid);

      res.status(200).json({
        status: 'success',
        insight: latestInsight,
      });
    } catch (err: any) {
      // Verified infrastructure capability failure only: in a sandbox
      // without backend Firestore read IAM there is no accessible persisted
      // insight. Treat as "none" rather than failing the whole request.
      if (err instanceof BackendReadUnavailableError) {
        console.warn(
          `[PATTERNSHIFT_LATEST] backend Firestore read unavailable (${err.operation}); no persisted insight accessible.`
        );
        res.status(200).json({
          status: 'success',
          insight: null,
        });
        return;
      }

      console.error('[PATTERNSHIFT_LATEST_ERROR]', err);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to retrieve latest pattern insights.',
      });
    }
  }
);

// Re-export limits for tests/diagnostics without a second import source.
export { PATTERN_ANALYSIS_PAYLOAD_LIMITS };