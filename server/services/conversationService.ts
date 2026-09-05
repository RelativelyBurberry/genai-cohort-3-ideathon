import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';
import type { ReflectionTurn } from './geminiService.js';
import {
  getConversationRest,
  getAuthoritativeMessagesRest,
  persistAssistantMessageRest,
  completeAndSummarizeConversationRest,
  deleteConversationRest,
  sortMessagesChronologically,
  getTimestampMillis,
} from './firestoreRestService.js';

/**
 * Server-side conversation persistence service.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Operates strictly via Firebase Admin SDK, scoped under `/users/{verifiedUid}/conversations/{conversationId}`.
 * 2. Client never provides authoritative history; server reads directly from Firestore.
 * 3. Assistant messages can ONLY be created by the backend.
 * 4. Summaries and status transitions to 'completed' are strictly backend-managed.
 * 5. Context budget strategy: Max 20 recent messages in chronological order, bounding token cost & prompt size.
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
 * Retrieves the authoritative chronological message history from Firestore for a conversation.
 * Applies a context budget of the most recent MAX_CONTEXT_MESSAGES.
 */
export async function getAuthoritativeMessages(
  uid: string,
  conversationId: string,
  maxCount: number = MAX_CONTEXT_MESSAGES,
  token?: string
): Promise<AuthoritativeMessage[]> {
  let rawMessages: AuthoritativeMessage[] = [];

  if (token) {
    // Note: getAuthoritativeMessagesRest returns messages sorted and budget-capped,
    // but we retrieve up to maxCount and re-verify chronological sorting here.
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
 * Persists an assistant-role response message and updates conversation timestamp.
 */
export async function persistAssistantMessage(
  uid: string,
  conversationId: string,
  content: string,
  token?: string
): Promise<AuthoritativeMessage> {
  if (token) {
    const restMsg = await persistAssistantMessageRest(token, uid, conversationId, content);
    return {
      id: restMsg.id,
      role: restMsg.role,
      content: restMsg.content,
      createdAt: restMsg.createdAt ? Timestamp.fromDate(new Date(restMsg.createdAt)) : null,
    };
  }

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
}

/**
 * Atomically writes the generated summary, transitions conversation status to 'completed',
 * and updates summaryUpdatedAt timestamp.
 */
export async function completeAndSummarizeConversation(
  uid: string,
  conversationId: string,
  summary: string,
  token?: string
): Promise<void> {
  if (token) {
    await completeAndSummarizeConversationRest(token, uid, conversationId, summary);
    return;
  }

  const db = getAdminDb();
  const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);

  await convRef.update({
    summary,
    status: 'completed',
    summaryUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Server-authoritative cascade deletion of a conversation and all its nested messages.
 * In AI Studio preview mode (when token is provided), delegates to deleteConversationRest.
 * Otherwise, deletes subcollection documents in chunked batches via Admin SDK, then deletes the parent conversation document.
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

