import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';
import type { ReflectionTurn } from './geminiService.js';
import {
  getConversationRest,
  getAuthoritativeMessagesRest,
  deleteConversationRest,
  sortMessagesChronologically,
  getTimestampMillis,
} from './firestoreRestService.js';
import {
  withBackendPersistenceCapability,
  BackendPersistenceUnavailableError,
} from './privilegedPersistence.js';

/**
 * Server-side conversation persistence service.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Backend-owned writes (assistant messages, lifecycle transitions)
 *    execute strictly via Firebase Admin SDK privileged authority.
 *    They are NEVER authorized via a user Firebase ID token, because
 *    Firestore security rules intentionally deny client-derived writes
 *    to these surfaces.
 * 2. User-authorized reads and deletes (owner-scoped) may use the
 *    user's ID token over the REST API for AI Studio preview
 *    compatibility, falling back to the Admin SDK when the runtime
 *    identity is privileged.
 * 3. Client never provides authoritative history; server reads
 *    directly from Firestore.
 * 4. Assistant messages can ONLY be created by the backend.
 * 5. Summaries and status transitions to 'completed' are strictly
 *    backend-managed.
 * 6. Context budget strategy: Max 20 recent messages in chronological
 *    order, bounding token cost & prompt size.
 */

export interface AuthoritativeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp | null;
}

export interface ConversationDoc {
  id: string;
  title: string;
  summary: string | null;
  status: 'active' | 'completed';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  summaryUpdatedAt: Timestamp | null;
}

const MAX_CONTEXT_MESSAGES = 20;

/**
 * Loads conversation metadata for the verified user.
 *
 * This is a USER-AUTHORIZED READ. It may use the user's ID token
 * over REST for AI Studio compatibility.
 */
export async function getConversation(
  uid: string,
  conversationId: string,
  token?: string
): Promise<ConversationDoc | null> {
  if (token) {
    const restConv = await getConversationRest(token, uid, conversationId);
    if (!restConv) return null;
    return {
      id: restConv.id,
      title: restConv.title,
      summary: restConv.summary,
      status: restConv.status,
      createdAt: restConv.createdAt ? (Timestamp.fromDate(new Date(restConv.createdAt)) as any) : null,
      updatedAt: restConv.updatedAt ? (Timestamp.fromDate(new Date(restConv.updatedAt)) as any) : null,
      summaryUpdatedAt: restConv.summaryUpdatedAt ? (Timestamp.fromDate(new Date(restConv.summaryUpdatedAt)) as any) : null,
    };
  }

  const db = getAdminDb();
  const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);
  const snap = await convRef.get();

  if (!snap.exists) {
    return null;
  }

  const data = snap.data()!;
  return {
    id: snap.id,
    title: data.title || 'Untitled Reflection',
    summary: data.summary || null,
    status: data.status || 'active',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    summaryUpdatedAt: data.summaryUpdatedAt || null,
  };
}

/**
 * Retrieves the authoritative chronological message history from
 * Firestore for a conversation. Applies a context budget of the most
 * recent MAX_CONTEXT_MESSAGES.
 *
 * This is a USER-AUTHORIZED READ. It may use the user's ID token
 * over REST for AI Studio compatibility.
 */
export async function getAuthoritativeMessages(
  uid: string,
  conversationId: string,
  maxCount: number = MAX_CONTEXT_MESSAGES,
  token?: string
): Promise<AuthoritativeMessage[]> {
  let rawMessages: AuthoritativeMessage[] = [];

  if (token) {
    // Note: getAuthoritativeMessagesRest returns messages sorted and
    // budget-capped, but we retrieve up to maxCount and re-verify
    // chronological sorting here.
    const restMsgs = await getAuthoritativeMessagesRest(token, uid, conversationId, maxCount);
    rawMessages = restMsgs.map((m) => {
      let ts: Timestamp | null = null;
      if (m.createdAt) {
        const millis = getTimestampMillis(m.createdAt);
        if (millis > 0) {
          ts = Timestamp.fromMillis(millis);
        }
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: ts,
      };
    });
  } else {
    const db = getAdminDb();
    const messagesCol = db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .collection('messages');

    const snapshot = await messagesCol.get();

    rawMessages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        role: data.role as 'user' | 'assistant',
        content: data.content || '',
        createdAt: data.createdAt || null,
      };
    });
  }

  // Explicit deterministic chronological sort
  const sorted = sortMessagesChronologically(rawMessages);

  // Apply context budget: retain the most recent N messages
  if (sorted.length > maxCount) {
    return sorted.slice(-maxCount);
  }

  return sorted;
}

/**
 * Converts AuthoritativeMessage array to ReflectionTurn format for Gemini.
 */
export function formatTurnsForGemini(messages: AuthoritativeMessage[]): ReflectionTurn[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Persists an assistant-role response message and updates the
 * conversation timestamp.
 *
 * BACKEND-OWNED WRITE. Privileged Admin SDK authority only.
 * The token parameter is ignored for security - NEVER falls back to
 * user-token REST. If the runtime lacks Firestore IAM, throws
 * BackendPersistenceUnavailableError.
 */
export async function persistAssistantMessage(
  uid: string,
  conversationId: string,
  content: string,
  token?: string
): Promise<AuthoritativeMessage> {
  // SECURITY: Ignore token parameter. Backend-owned writes MUST use
  // privileged Admin SDK authority only. The token is only for
  // user-authorized operations (reads/deletes) to maintain AI Studio
  // compatibility.
  return withBackendPersistenceCapability('persistAssistantMessage', async () => {
    const db = getAdminDb();
    const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);
    const messagesCol = convRef.collection('messages');

    const newDocRef = messagesCol.doc();
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.set(newDocRef, {
      role: 'assistant',
      content,
      createdAt: now,
    });
    batch.update(convRef, {
      updatedAt: now,
    });

    await batch.commit();

    return {
      id: newDocRef.id,
      role: 'assistant',
      content,
      createdAt: null,
    };
  });
}

/**
 * Atomically writes the generated summary, transitions conversation
 * status to 'completed', and updates summaryUpdatedAt.
 *
 * BACKEND-OWNED WRITE. Privileged Admin SDK authority only.
 * The token parameter is ignored for security - NEVER falls back to
 * user-token REST. If the runtime lacks Firestore IAM, throws
 * BackendPersistenceUnavailableError.
 */
export async function completeAndSummarizeConversation(
  uid: string,
  conversationId: string,
  summary: string,
  token?: string
): Promise<void> {
  // SECURITY: Ignore token parameter. Backend-owned writes MUST use
  // privileged Admin SDK authority only. The token is only for
  // user-authorized operations (reads/deletes) to maintain AI Studio
  // compatibility.
  await withBackendPersistenceCapability('completeAndSummarizeConversation', async () => {
    const db = getAdminDb();
    const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);

    await convRef.update({
      summary,
      status: 'completed',
      summaryUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Server-authoritative cascade deletion of a conversation and all its
 * nested messages.
 *
 * This is a USER-AUTHORIZED DELETE (rules allow owner delete of
 * conversation + subcollection messages). It may use the user's ID
 * token over REST for AI Studio compatibility, falling back to the
 * Admin SDK when the runtime identity is privileged.
 */
export async function deleteConversationServer(
  uid: string,
  conversationId: string,
  token?: string
): Promise<any> {
  if (!uid || typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Unauthorized: User ID must be provided.');
  }
  if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
    throw new Error('Invalid request: Conversation ID must be provided.');
  }

  if (token) {
    return await deleteConversationRest(token, uid, conversationId);
  }

  const db = getAdminDb();
  const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);
  const messagesCol = convRef.collection('messages');

  // Query all subcollection messages for this conversation
  const snapshot = await messagesCol.get();

  if (!snapshot.empty) {
    // Firestore batch writes max out at 500 operations per batch
    const BATCH_SIZE = 400;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const docSnap of chunk) {
        batch.delete(docSnap.ref);
      }
      await batch.commit();
    }
  }

  // Delete the parent conversation document
  await convRef.delete();
}

// Re-export for callers that need to detect the capability error
// without importing the privilegedPersistence module directly.
export { BackendPersistenceUnavailableError };
