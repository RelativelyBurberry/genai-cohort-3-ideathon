import crypto from 'crypto';
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { checkAndIncrementRateLimit } from '../services/rateLimiter.js';
import { computePatternShiftMetrics } from '../services/patternShiftEngine.js';
import type { RawEntry, RawConversation } from '../services/patternShiftEngine.js';
import { generatePatternShiftInsights } from '../services/geminiService.js';
import {
  fetchUserEntriesForPatternShift,
  fetchUserConversationsForPatternShift,
  persistPatternShiftInsight,
  fetchLatestPatternShiftInsight,
  BackendPersistenceUnavailableError,
  BackendReadUnavailableError,
} from '../services/patternShiftPersistence.js';
import { toBackendPersistenceApiResponse } from '../services/privilegedPersistence.js';
import {
  validatePatternShiftAnalysisPayload,
  PATTERN_ANALYSIS_PAYLOAD_LIMITS,
} from '../services/patternShiftPayload.js';

export const patternShiftRouter = Router();

/**
 * POST /api/patternshift/analyze
 *
 * Runs deterministic pattern extraction and conditional Gemini interpretation
 * across the authenticated user's historical journal entries and completed
 * reflections.
 *
 * Authority matrix (remediation):
 * - BACKEND-OWNED READS (entries, conversations): privileged Admin SDK only.
 *   The Firebase ID token is NEVER forwarded to the Google Cloud Firestore
 *   REST API (Firebase Auth ID tokens are not Google OAuth2 access tokens and
 *   return 401 UNAUTHENTICATED / ACCESS_TOKEN_TYPE_UNSUPPORTED).
 *   If the runtime lacks Firestore read IAM (AI Studio preview sandbox), the
 *   reads fail with BackendReadUnavailableError. In that verified capability
 *   case ONLY, a validated, minimally scoped client-supplied payload
 *   (`analysisPayload`, built from the authenticated client's own Firestore
 *   reads) may be used. The request `uid` is never trusted — identity always
 *   comes exclusively from requireAuth.
 * - BACKEND-OWNED WRITE (insight persistence): privileged Admin SDK only.
 *   NEVER uses the user token. If the runtime lacks Firestore IAM, the
 *   successfully generated insight is still returned to the authenticated
 *   caller with explicit `persistence` metadata (persisted: false) — the user
 *   never loses a successful analysis merely because the sandbox cannot write.
 */
patternShiftRouter.post(
  '/api/patternshift/analyze',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    // Optional, narrowly scoped client payload. Identity is ONLY derived
    // from the verified token; a `uid` field is not part of the schema and
    // is never read.
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payloadValidation = validatePatternShiftAnalysisPayload(body.analysisPayload);
    if (!payloadValidation.valid) {
      res.status(400).json({
        error: 'invalid_analysis_payload',
        message: payloadValidation.error,
      });
      return;
    }
    // True when the client explicitly supplied an analysis payload (even an
    // empty one — e.g. a user with genuinely no records).
    const clientProvidedPayload =
      body.analysisPayload !== undefined && body.analysisPayload !== null;

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

      // 2. Fetch User's Historical Data (BACKEND-OWNED READS — Admin SDK)
      //
      //    If the runtime lacks Firestore READ IAM (verified infra
      //    capability failure only), fall back to the validated client
      //    payload. Any OTHER read failure propagates as a normal error.
      let entries: RawEntry[] = [];
      let conversations: RawConversation[] = [];
      let backendReadUnavailable: BackendReadUnavailableError | null = null;

      try {
        [entries, conversations] = await Promise.all([
          fetchUserEntriesForPatternShift(uid),
          fetchUserConversationsForPatternShift(uid),
        ]);
      } catch (readErr: any) {
        if (readErr instanceof BackendReadUnavailableError) {
          backendReadUnavailable = readErr;
        } else {
          throw readErr;
        }
      }

      if (backendReadUnavailable) {
        if (clientProvidedPayload) {
          entries = payloadValidation.entries;
          conversations = payloadValidation.completedConversations;
          console.warn(
            `[PATTERNSHIFT_ANALYZE] backend Firestore reads unavailable (${backendReadUnavailable.operation}); using validated client payload for user ${uid}.`
          );
        } else {
          // No server-side read capability AND no client records: the
          // client must supply its minimal records from its own
          // authenticated reads and retry.
          res.status(200).json({
            status: 'client_data_required',
            message:
              'The backend cannot access Firestore in this environment. Re-run analysis from the app so your local records can be included.',
          });
          return;
        }
      }

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

      // 7. Persist Insight Document (BACKEND-OWNED WRITE — Admin SDK only)
      //
      //    Infrastructure capability failure ONLY: the generated insight is
      //    returned to the authenticated caller with explicit persistence
      //    metadata. Unexpected persistence errors still fail normally.
      try {
        await persistPatternShiftInsight(uid, newInsight);
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
      // Defensive: BackendPersistenceUnavailableError reaching this handler
      // from an unexpected path still maps to the stable capability response.
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
 * BACKEND-OWNED READ (Admin SDK only — never user-token Firestore REST).
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