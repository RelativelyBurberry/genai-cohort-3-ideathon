import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
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
 * Robust fetch response parser.
 *
 * Infrastructure proxies (e.g. AI Studio preview Nginx) can intercept
 * 502/503/504 responses and replace them with an HTML "Starting
 * Server..." stub served as HTTP 200. A blind `response.json()` call
 * then throws `Unexpected token '<'`. This helper detects that case
 * and surfaces a clean, user-facing message instead of a raw
 * SyntaxError.
 *
 * Behavior:
 *   - If content-type is JSON, parse the text safely. Malformed JSON
 *     produces a friendly error, never a raw SyntaxError.
 *   - If the body looks like HTML (e.g. `<!doctype html>`), throw a
 *     friendly "service unavailable" error.
 *   - If content-type is not JSON and body is not parseable, throw a
 *     friendly error.
 *
 * On non-2xx responses, structured JSON error bodies from the backend
 * are preserved and re-thrown as Error objects with statusCode etc.
 */
export async function parseReflectionResponse(response: Response): Promise<any> {
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const trimmed = rawBody.trim();

  // Detect HTML responses (proxy interception stubs, error pages).
  const looksLikeHtml =
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html/i.test(trimmed) ||
    (contentType.includes('text/html') && trimmed.length > 0);

  if (looksLikeHtml) {
    if (!response.ok) {
      throw new Error('The reflection service is temporarily unavailable. Please tap Retry.');
    }
    // Even a 200 with an HTML body is not a valid reflection response.
    throw new Error('The reflection service is temporarily unavailable. Please tap Retry.');
  }

  let data: any = null;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      // Malformed JSON in a JSON-typed response. Surface a friendly
      // error; never expose the raw SyntaxError to the UI.
      throw new Error('The reflection service is temporarily unavailable. Please tap Retry.');
    }
  } else {
    // Content-type is not JSON. Attempt to parse, but if it fails,
    // treat as an unparseable proxy response.
    try {
      data = JSON.parse(rawBody);
    } catch {
      if (!response.ok) {
        throw new Error('The reflection service is temporarily unavailable. Please tap Retry.');
      }
      throw new Error('The reflection service is temporarily unavailable. Please tap Retry.');
    }
  }

  return data;
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
 * One-time fetch of all conversations for the authenticated user.
 * Used by the PatternShift client fallback to build the minimal,
 * validated analysis payload when the backend cannot read Firestore.
 * Owner-scoped via Firestore security rules.
 */
export async function getConversations(uid: string): Promise<Conversation[]> {
  assertValidUid(uid);

  const colRef = collection(db, 'users', uid, 'conversations');
  const q = query(colRef, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
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
 * Client-side fallback persistence of a Gemini-generated assistant
 * message.
 *
 * This is ONLY invoked when the backend returns a successful Gemini
 * response with `persistence.fallbackRequired = true` (preview sandbox
 * where Admin SDK persistence lacks IAM). Firestore rules allow the
 * owner to create assistant messages under the fallback policy. The
 * message is written under the authenticated user's own conversation
 * subcollection, preserving full ownership scoping.
 *
 * Production backend persistence via Admin SDK always remains
 * preferred; this is a narrow capability fallback.
 */
export async function addAssistantMessage(
  uid: string,
  conversationId: string,
  content: string
): Promise<string> {
  assertValidUid(uid);

  const cleanContent = content.trim();
  if (!cleanContent) {
    throw new Error('Assistant reflection message cannot be empty.');
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
    role: 'assistant',
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
 * Triggers server-side crisis screening, rate-limiting, Gemini invocation,
 * and assistant message persistence.
 *
 * Client-side fallback:
 *   When the backend successfully generates a Gemini response but cannot
 *   persist it (Admin SDK unavailable in the preview sandbox), it returns
 *   the generated assistant message with `persistence.fallbackRequired`.
 *   In that case, this function persists the assistant message using the
 *   Firebase Client SDK (addAssistantMessage) under existing ownership
 *   rules, then normalizes the response to the production shape.
 */
export async function requestAssistantReflection(
  token: string,
  conversationId: string,
  uid: string
): Promise<ReflectApiResponse> {
  const response = await fetch('/api/reflect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId }),
  });

  const data = await parseReflectionResponse(response);

  if (!response.ok) {
    const err = new Error(data.message || `Reflection failed (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    (err as any).retryAfterSeconds = data.retryAfterSeconds;
    (err as any).diagnostics = data.diagnostics || null;
    throw err;
  }

  // Crisis support early-exit: no message to persist.
  if (data.crisisSupportRequired) {
    return data as ReflectApiResponse;
  }

  // Client fallback: backend generated the response but could not
  // persist it (preview sandbox). Persist via Client SDK.
  if (data.persistence?.fallbackRequired && data.message?.content) {
    try {
      const persistedId = await addAssistantMessage(uid, conversationId, data.message.content);
      return {
        ...data,
        message: {
          ...data.message,
          id: persistedId,
        },
        persistence: {
          persisted: true,
          fallbackRequired: false,
          reason: 'client_fallback_completed',
        },
      };
    } catch (fallbackErr: any) {
      // If client fallback fails, throw so the UI can surface the
      // error honestly. The Gemini response was generated but not
      // persisted — do not fake success.
      const err = new Error(
        fallbackErr?.message ||
        'Reflection was generated but could not be saved. Please tap Retry.'
      );
      (err as any).statusCode = 503;
      throw err;
    }
  }

  return data as ReflectApiResponse;
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

  const data = await parseReflectionResponse(response);

  if (!response.ok) {
    const err = new Error(data.message || `Summarization failed (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    (err as any).retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }

  return data as SummarizeApiResponse;
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

  const data = await parseReflectionResponse(response).catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || `Failed to delete reflection (HTTP ${response.status})`);
    (err as any).statusCode = response.status;
    throw err;
  }

  return data;
}

