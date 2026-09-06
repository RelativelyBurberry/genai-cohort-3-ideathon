import { getAdminDb } from '../firebaseAdmin.js';
import {
  withBackendPersistenceCapability,
  withBackendReadCapability,
  BackendPersistenceUnavailableError,
  BackendReadUnavailableError,
} from './privilegedPersistence.js';

/**
 * Server-side persistence service for PatternShift.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. The analysis route (POST /api/patternshift/analyze) performs ZERO
 *    Firestore reads — analysis inputs come exclusively from the
 *    validated client-supplied `analysisPayload`.
 * 2. Generated insights are stored under `/users/{verifiedUid}/insights/{insightId}`
 *    using privileged Admin SDK authority ONLY. The Firebase ID token is
 *    NEVER forwarded to the Google Cloud Firestore REST API — Firebase
 *    Auth ID tokens are not Google OAuth2 access tokens and Firestore
 *    REST rejects them (401 UNAUTHENTICATED / ACCESS_TOKEN_TYPE_UNSUPPORTED).
 * 3. Never queries across multiple users.
 * 4. Where the runtime lacks Firestore IAM, writes throw
 *    `BackendPersistenceUnavailableError` and the route returns the
 *    successfully generated insight ephemerally with explicit persistence
 *    metadata — a successful analysis never depends on backend IAM.
 */

/**
 * Persist a generated PatternShift insight.
 *
 * BACKEND-OWNED WRITE. Privileged Admin SDK authority only.
 *
 * SECURITY: This function deliberately accepts ONLY (uid, insight) — there
 * is NO token parameter, making it impossible for a caller to accidentally
 * forward a Firebase ID token to Firestore.
 *
 * If the runtime lacks Firestore write IAM, throws
 * `BackendPersistenceUnavailableError`.
 */
export async function persistPatternShiftInsight(uid: string, insight: any): Promise<void> {
  await withBackendPersistenceCapability('persistPatternShiftInsight', async () => {
    const db = getAdminDb();
    const insightRef = db.collection('users').doc(uid).collection('insights').doc(insight.id);

    await insightRef.set({
      id: insight.id,
      generatedAt: insight.generatedAt,
      timeRange: insight.timeRange,
      itemCount: insight.itemCount,
      metrics: insight.metrics,
      observations: insight.observations,
      suggestedInquiries: insight.suggestedInquiries,
      intelligence: insight.intelligence || null,
      type: insight.type || 'patternshift',
    });
  });
}

/**
 * Fetch the latest PatternShift insight for a user.
 *
 * BACKEND-OWNED READ. Privileged Admin SDK authority only (used by the
 * GET /api/patternshift/latest FALLBACK endpoint; the frontend normally
 * reads its own insights via the Firebase Client SDK).
 *
 * The user's Firebase ID token is deliberately NOT accepted (see the
 * module-level invariants).
 *
 * If the runtime lacks Firestore read IAM (AI Studio preview sandbox),
 * throws `BackendReadUnavailableError`.
 */
export async function fetchLatestPatternShiftInsight(uid: string): Promise<any | null> {
  return withBackendReadCapability('fetchLatestPatternShiftInsight', async () => {
    const db = getAdminDb();
    const insightsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('insights')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (insightsSnap.empty) {
      return null;
    }

    const doc = insightsSnap.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      generatedAt: data.generatedAt || null,
      timeRange: data.timeRange || { start: '', end: '' },
      itemCount: data.itemCount || { entries: 0, completedConversations: 0, total: 0 },
      metrics: data.metrics || null,
      observations: data.observations || [],
      suggestedInquiries: data.suggestedInquiries || [],
      intelligence: data.intelligence || null,
      type: data.type || 'patternshift',
    };
  });
}

// Re-export for callers that need to detect the capability errors
export { BackendPersistenceUnavailableError, BackendReadUnavailableError };