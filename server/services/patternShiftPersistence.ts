import { getAdminDb } from '../firebaseAdmin.js';
import {
  getUserEntriesRest,
  getUserConversationsRest,
  getLatestInsightRest,
} from './firestoreRestService.js';
import {
  withBackendPersistenceCapability,
  BackendPersistenceUnavailableError,
} from './privilegedPersistence.js';
import type { RawEntry, RawConversation } from './patternShiftEngine.js';

/**
 * Server-side unified persistence and retrieval service for PatternShift.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. All data lookups strictly scoped to `/users/{verifiedUid}/...`.
 * 2. Generated insights stored under `/users/{verifiedUid}/insights/{insightId}`.
 * 3. Never queries across multiple users.
 * 4. Backend-owned writes (insight persistence) use privileged Admin SDK
 *    authority only. NEVER user-token REST.
 */

/**
 * Fetch user's journal entries for PatternShift analysis.
 *
 * USER-AUTHORIZED READ. May use user ID token over REST for AI Studio
 * compatibility.
 */
export async function fetchUserEntriesForPatternShift(
  uid: string,
  token?: string
): Promise<RawEntry[]> {
  if (token) {
    return await getUserEntriesRest(token, uid);
  }

  const db = getAdminDb();
  const entriesSnap = await db.collection('users').doc(uid).collection('entries').get();

  return entriesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title || '',
      content: data.content || '',
      moodRating: typeof data.moodRating === 'number' ? data.moodRating : undefined,
      tags: Array.isArray(data.tags) ? data.tags : [],
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    };
  });
}

/**
 * Fetch user's conversations for PatternShift analysis.
 *
 * USER-AUTHORIZED READ. May use user ID token over REST for AI Studio
 * compatibility.
 */
export async function fetchUserConversationsForPatternShift(
  uid: string,
  token?: string
): Promise<RawConversation[]> {
  if (token) {
    return await getUserConversationsRest(token, uid);
  }

  const db = getAdminDb();
  const convsSnap = await db.collection('users').doc(uid).collection('conversations').get();

  return convsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title || '',
      summary: data.summary || null,
      status: data.status || 'active',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      summaryUpdatedAt: data.summaryUpdatedAt || null,
    };
  });
}

/**
 * Persist a generated PatternShift insight.
 *
 * BACKEND-OWNED WRITE. Privileged Admin SDK authority only.
 * The token parameter is ignored for security - NEVER falls back to
 * user-token REST. If the runtime lacks Firestore IAM, throws
 * BackendPersistenceUnavailableError.
 */
export async function persistPatternShiftInsight(
  uid: string,
  insight: any,
  token?: string
): Promise<void> {
  // SECURITY: Ignore token parameter. Backend-owned writes MUST use
  // privileged Admin SDK authority only. The token is only for
  // user-authorized operations (reads/deletes) to maintain AI Studio
  // compatibility.
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
      type: insight.type || 'patternshift',
    });
  });
}

/**
 * Fetch the latest PatternShift insight for a user.
 *
 * USER-AUTHORIZED READ. May use user ID token over REST for AI Studio
 * compatibility.
 */
export async function fetchLatestPatternShiftInsight(
  uid: string,
  token?: string
): Promise<any | null> {
  if (token) {
    return await getLatestInsightRest(token, uid);
  }

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
    type: data.type || 'patternshift',
  };
}

// Re-export for callers that need to detect the capability error
export { BackendPersistenceUnavailableError };
