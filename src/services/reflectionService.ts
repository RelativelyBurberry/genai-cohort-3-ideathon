import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  Conversation,
  ReflectionMessage,
  ReflectApiResponse,
  SummarizeApiResponse,
} from '../types/reflection';

function assertValidUid(uid: string): void {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    throw new Error('Unauthorized: User ID must be provided from active authenticated session.');
  }
}

/**
 * Creates an active conversation document under `/users/{uid}/conversations/{conversationId}`.
 * Client initializes status to 'active' with null summary fields.
 */
export async function createConversation(
  uid: string,
  title: string = 'Untitled Reflection'
): Promise<string> {
  assertValidUid(uid);

  const cleanTitle = title.trim().slice(0, 100) || 'Untitled Reflection';
  const conversationsCol = collection(db, 'users', uid, 'conversations');

  const docRef = await addDoc(conversationsCol, {
    title: cleanTitle,
    status: 'active',
    summary: null,
    summaryUpdatedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Subscribes in real-time to all conversations for the authenticated user.
 */
export function subscribeToConversations(
  uid: string,
  onUpdate: (conversations: Conversation[], metadata?: { docIds: string[]; changes: { type: string; id: string }[] }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  assertValidUid(uid);

  console.log(`[DIAG_SYNC_TRACE] stage: listener_subscription_path | uid: ${uid}`);
  const colRef = collection(db, 'users', uid, 'conversations');
  const q = query(colRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const docIds = snapshot.docs.map((docSnap) => docSnap.id);
      const changes = snapshot.docChanges().map((change) => ({
        type: change.type,
        id: change.doc.id,
      }));

      console.log(`[DIAG_SYNC_TRACE] stage: snapshot_callback_invocation | docCount: ${snapshot.docs.length} | docIds:`, docIds, `| changes:`, changes);

      const convs: Conversation[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || 'Untitled Reflection',
          summary: data.summary || null,
          status: data.status || 'active',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          summaryUpdatedAt: data.summaryUpdatedAt || null,
        };
      });
      onUpdate(convs, { docIds, changes });
    },
    (err) => {
      console.error(`[DIAG_SYNC_TRACE] stage: snapshot_error | error:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribes in real-time to the messages of a single conversation.
 */
export function subscribeToMessages(
  uid: string,
  conversationId: string,
  onUpdate: (messages: ReflectionMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  assertValidUid(uid);

  const messagesCol = collection(
    db,
    'users',
    uid,
    'conversations',
    conversationId,
    'messages'
  );
  const q = query(messagesCol, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: ReflectionMessage[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          role: data.role as 'user' | 'assistant',
          content: data.content || '',
          createdAt: data.createdAt || null,
        };
      });
      onUpdate(msgs);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Writes a user-authored reflection message to Firestore via client SDK.
 * Firestore rules strictly enforce role == 'user' and immutability.
 */
export async function addUserMessage(
  uid: string,
  conversationId: string,
  content: string
): Promise<string> {
  assertValidUid(uid);

  const cleanContent = content.trim();
  if (!cleanContent) {
    throw new Error('Reflection message cannot be empty.');
  }

  const messagesCol = collection(
    db,
    'users',
    uid,
    'conversations',
    conversationId,
    'messages'
  );

  const docRef = await addDoc(messagesCol, {
    role: 'user',
    content: cleanContent,
    createdAt: serverTimestamp(),
  });

  // Touch conversation updatedAt for chronological sorting
  try {
    const convRef = doc(db, 'users', uid, 'conversations', conversationId);
    await updateDoc(convRef, {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal if timestamp update fails
  }

  return docRef.id;
}

/**
 * Calls backend POST /api/reflect with Firebase ID token.
 * Triggers server-side crisis screening, rate-limiting, Gemini invocation, and assistant message persistence.
 */
export async function requestAssistantReflection(
  token: string,
  conversationId: string
): Promise<ReflectApiResponse> {
  const response = await fetch('/api/reflect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId }),
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.message || `Reflection failed (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    (err as any).retryAfterSeconds = data.retryAfterSeconds;
    (err as any).diagnostics = data.diagnostics || null;
    throw err;
  }

  return data;
}

/**
 * Calls backend POST /api/conversations/:id/summarize with Firebase ID token.
 * Triggers server-side summarization, atomic transition to 'completed', and summary persistence.
 */
export async function requestSummarize(
  token: string,
  conversationId: string
): Promise<SummarizeApiResponse> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/summarize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.message || `Summarization failed (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    (err as any).retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }

  return data;
}

/**
 * Calls backend DELETE /api/conversations/:id with Firebase ID token.
 * Triggers server-side cascade deletion of all nested messages and parent conversation document.
 */
export async function deleteConversation(
  token: string,
  conversationId: string
): Promise<any> {
  console.log(`[DIAG_DELETE_STAGE] stage: delete_api_request_sent | conversationId: ${conversationId}`);
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || `Failed to delete reflection (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    throw err;
  }

  return data;
}

