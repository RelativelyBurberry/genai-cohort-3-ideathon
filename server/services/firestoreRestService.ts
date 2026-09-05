import fs from 'fs';
import path from 'path';

export interface RestConversation {
  id: string;
  title: string;
  summary: string | null;
  status: 'active' | 'completed';
  createdAt: string | null;
  updatedAt: string | null;
  summaryUpdatedAt: string | null;
}

export interface RestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
}

let cachedProjectId: string | null = null;
let cachedDatabaseId: string | null = null;

function getProjectAndDatabaseId() {
  if (cachedProjectId && cachedDatabaseId) {
    return { projectId: cachedProjectId, databaseId: cachedDatabaseId };
  }

  let projectId = process.env.FIREBASE_PROJECT_ID;
  let databaseId = process.env.FIRESTORE_DATABASE_ID;

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!projectId && config.projectId) {
        projectId = config.projectId;
      }
      if (!databaseId && config.firestoreDatabaseId) {
        databaseId = config.firestoreDatabaseId;
      }
    } catch (e) {
      console.error('[FirestoreRest] Failed to parse firebase-applet-config.json:', e);
    }
  }

  cachedProjectId = projectId || 'industrious-edge-9xhgq';
  cachedDatabaseId = databaseId || 'ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2';

  return { projectId: cachedProjectId, databaseId: cachedDatabaseId };
}

function getBaseUrl() {
  const { projectId, databaseId } = getProjectAndDatabaseId();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

// REST conversion utilities
export function getTimestampMillis(ts: any): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === 'number') {
    return ts < 10000000000 ? Math.floor(ts * 1000) : Math.floor(ts);
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  if (typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  if (typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof ts._seconds === 'number') {
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1000000);
  }
  if (ts.seconds !== undefined) {
    const sec = Number(ts.seconds) || 0;
    const nanos = Number(ts.nanoseconds || ts.nanos) || 0;
    return sec * 1000 + Math.floor(nanos / 1000000);
  }
  if (typeof ts.timestampValue === 'string') {
    const parsed = Date.parse(ts.timestampValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function sortMessagesChronologically<T extends { createdAt?: any; id?: string }>(
  messages: T[]
): T[] {
  return [...messages].sort((a, b) => {
    const timeA = getTimestampMillis(a.createdAt);
    const timeB = getTimestampMillis(b.createdAt);
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    const idA = String(a.id || '');
    const idB = String(b.id || '');
    return idA.localeCompare(idB);
  });
}

export function fromFirestoreValue(value: any): any {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    return fromFirestoreFields(fields);
  }
  return value;
}

export function fromFirestoreFields(fields: any): any {
  const result: any = {};
  if (!fields) return result;
  for (const key of Object.keys(fields)) {
    result[key] = fromFirestoreValue(fields[key]);
  }
  return result;
}

export function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue),
      },
    };
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return { timestampValue: value.toISOString() };
    }
    return {
      mapValue: {
        fields: toFirestoreFields(value),
      },
    };
  }
  return { stringValue: String(value) };
}

export function toFirestoreFields(obj: any): any {
  const fields: any = {};
  for (const key of Object.keys(obj)) {
    fields[key] = toFirestoreValue(obj[key]);
  }
  return fields;
}

/**
 * Loads conversation metadata using the user's token via the REST API.
 */
export async function getConversationRest(
  token: string,
  uid: string,
  conversationId: string
): Promise<RestConversation | null> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/conversations/${conversationId}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Firestore REST error: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    const fields = fromFirestoreFields(data.fields || {});

    return {
      id: conversationId,
      title: fields.title || 'Untitled Reflection',
      summary: fields.summary || null,
      status: fields.status || 'active',
      createdAt: fields.createdAt || null,
      updatedAt: fields.updatedAt || null,
      summaryUpdatedAt: fields.summaryUpdatedAt || null,
    };
  } catch (err: any) {
    console.error('[FirestoreRest] getConversationRest failed:', err.message);
    throw err;
  }
}

/**
 * Retrieves authoritative messages using the user's token via the REST API.
 */
export async function getAuthoritativeMessagesRest(
  token: string,
  uid: string,
  conversationId: string,
  maxCount: number = 20
): Promise<RestMessage[]> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/conversations/${conversationId}:runQuery`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [
            {
              collectionId: 'messages',
            },
          ],
          orderBy: [
            {
              field: {
                fieldPath: 'createdAt',
              },
              direction: 'ASCENDING',
            },
          ],
        },
      }),
    });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Firestore REST error: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    const results = Array.isArray(data) ? data : [];

    const messages: RestMessage[] = results
      .filter((item: any) => item && item.document)
      .map((item: any) => {
        const d = item.document;
        const fields = fromFirestoreFields(d.fields || {});
        const parts = d.name.split('/');
        const id = parts[parts.length - 1];
        return {
          id,
          role: fields.role as 'user' | 'assistant',
          content: fields.content || '',
          createdAt: fields.createdAt || null,
        };
      })
      .filter((m) => m.role === 'user' || m.role === 'assistant');

    // Perform explicit deterministic server-side chronological sorting
    const sorted = sortMessagesChronologically(messages);

    if (sorted.length > maxCount) {
      return sorted.slice(-maxCount);
    }

    return sorted;
  } catch (err: any) {
    console.error('[FirestoreRest] getAuthoritativeMessagesRest failed:', err.message);
    throw err;
  }
}

/**
 * Persists an assistant-role response message via the REST API.
 *
 * LEGACY / UNUSED BY THE PRIVILEGED WRITE PATH:
 * Under firestore.rules, user-level authorization forbids assistant role
 * creation. Backend-owned writes MUST use the Admin SDK privileged path
 * (server/services/privilegedPersistence.ts). This function is retained
 * only for reference and MUST NOT be called by the persistence services.
 * It is guaranteed to fail with PERMISSION_DENIED when invoked with a
 * user token.
 */
export async function persistAssistantMessageRest(
  token: string,
  uid: string,
  conversationId: string,
  content: string
): Promise<RestMessage> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/conversations/${conversationId}/messages`;

  const payload = {
    fields: toFirestoreFields({
      role: 'assistant',
      content,
      createdAt: new Date(),
    }),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const err = new Error(`Firestore REST error: ${res.status} ${errorText}`);
    (err as any).statusCode = res.status;
    throw err;
  }

  const data = await res.json();
  const fields = fromFirestoreFields(data.fields || {});
  const parts = data.name.split('/');
  const id = parts[parts.length - 1];

  // Attempt to touch conversation updatedAt (may fail if blocked by rules)
  try {
    const convUrl = `${baseUrl}/users/${uid}/conversations/${conversationId}?updateMask.fieldPaths=updatedAt`;
    await fetch(convUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
  } catch (e) {
    // Non-fatal
  }

  return {
    id,
    role: 'assistant',
    content,
    createdAt: fields.createdAt || null,
  };
}

/**
 * Completes and summarizes a conversation via the REST API.
 *
 * LEGACY / UNUSED BY THE PRIVILEGED WRITE PATH:
 * Under firestore.rules, user-level authorization forbids modifying the
 * status/summary fields. Backend-owned writes MUST use the Admin SDK
 * privileged path (server/services/privilegedPersistence.ts). This
 * function is retained only for reference and MUST NOT be called by the
 * persistence services. It is guaranteed to fail with PERMISSION_DENIED
 * when invoked with a user token.
 */
export async function completeAndSummarizeConversationRest(
  token: string,
  uid: string,
  conversationId: string,
  summary: string
): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/conversations/${conversationId}?updateMask.fieldPaths=summary&updateMask.fieldPaths=status&updateMask.fieldPaths=summaryUpdatedAt&updateMask.fieldPaths=updatedAt`;

  const payload = {
    fields: {
      summary: { stringValue: summary },
      status: { stringValue: 'completed' },
      summaryUpdatedAt: { timestampValue: new Date().toISOString() },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const err = new Error(`Firestore REST error: ${res.status} ${errorText}`);
    (err as any).statusCode = res.status;
    throw err;
  }
}

/**
 * Deletes a conversation and all its subcollection messages using the user's token via REST API.
 * Performs cascade deletion: retrieves all messages, deletes each message document via REST,
 * then deletes the parent conversation document via REST.
 * Explicitly performs a post-deletion GET check to verify document non-existence (404).
 */
export async function deleteConversationRest(
  token: string,
  uid: string,
  conversationId: string
): Promise<{
  messagesFound: number;
  messagesDeleted: number;
  parentDeleteStatus: number;
  parentDeleteBody: string;
  postDeleteCheckStatus: number;
  verifiedDeleted: boolean;
}> {
  const baseUrl = getBaseUrl();

  // 1. Fetch all messages in the conversation
  console.log(`[DIAG_DELETE_STAGE] stage: delete_messages_lookup | conversationId: ${conversationId}`);
  const messages = await getAuthoritativeMessagesRest(token, uid, conversationId, 100);
  console.log(`[DIAG_DELETE_STAGE] stage: delete_messages_lookup | conversationId: ${conversationId} | count: ${messages.length}`);

  // 2. Delete each subcollection message document via REST
  let messagesDeleted = 0;
  for (const msg of messages) {
    const msgUrl = `${baseUrl}/users/${uid}/conversations/${conversationId}/messages/${msg.id}`;
    const res = await fetch(msgUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await res.text().catch(() => '');
    console.log(`[DIAG_DELETE_STAGE] stage: delete_each_message | messageId: ${msg.id} | httpStatus: ${res.status} | body: ${text.slice(0, 100)}`);
    if (res.ok || res.status === 404) {
      messagesDeleted++;
    } else {
      throw new Error(`Failed to delete message ${msg.id}: HTTP ${res.status} ${text}`);
    }
  }

  // 3. Delete parent conversation document via REST
  const convUrl = `${baseUrl}/users/${uid}/conversations/${conversationId}`;
  console.log(`[DIAG_DELETE_STAGE] stage: delete_parent_conversation | conversationId: ${conversationId} | url: ${convUrl}`);
  const parentRes = await fetch(convUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const parentBody = await parentRes.text().catch(() => '');
  console.log(`[DIAG_DELETE_STAGE] stage: delete_parent_conversation | conversationId: ${conversationId} | httpStatus: ${parentRes.status} | body: ${parentBody.slice(0, 200)}`);

  if (!parentRes.ok && parentRes.status !== 404) {
    throw new Error(`Firestore REST parent deletion error: HTTP ${parentRes.status} ${parentBody}`);
  }

  // 4. Verification step: Perform explicit REST GET for parent conversation to confirm non-existence
  const checkRes = await fetch(convUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const checkBody = await checkRes.text().catch(() => '');
  const verifiedDeleted = checkRes.status === 404;
  console.log(`[DIAG_DELETE_STAGE] stage: delete_firestore_verified | conversationId: ${conversationId} | httpStatus: ${checkRes.status} | verifiedDeleted: ${verifiedDeleted} | body: ${checkBody.slice(0, 150)}`);

  if (!verifiedDeleted) {
    throw new Error(`Verification failed: Conversation document ${conversationId} still exists in Firestore after deletion attempt (HTTP ${checkRes.status}).`);
  }

  return {
    messagesFound: messages.length,
    messagesDeleted,
    parentDeleteStatus: parentRes.status,
    parentDeleteBody: parentBody,
    postDeleteCheckStatus: checkRes.status,
    verifiedDeleted,
  };
}

/**
 * Retrieves all journal entries for a user using REST API.
 */
export async function getUserEntriesRest(token: string, uid: string): Promise<any[]> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/entries?pageSize=100`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Firestore REST error getting entries: ${res.status} ${text}`);
    }

    const data = await res.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];

    return docs.map((d: any) => {
      const fields = fromFirestoreFields(d.fields || {});
      const parts = d.name.split('/');
      const id = parts[parts.length - 1];
      return {
        id,
        title: fields.title || '',
        content: fields.content || '',
        moodRating: typeof fields.moodRating === 'number' ? fields.moodRating : undefined,
        tags: Array.isArray(fields.tags) ? fields.tags : [],
        createdAt: fields.createdAt || d.createTime || null,
        updatedAt: fields.updatedAt || d.updateTime || null,
      };
    });
  } catch (err: any) {
    console.error('[FirestoreRest] getUserEntriesRest failed:', err.message);
    throw err;
  }
}

/**
 * Retrieves all conversations for a user using REST API.
 */
export async function getUserConversationsRest(token: string, uid: string): Promise<any[]> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/conversations?pageSize=100`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Firestore REST error getting conversations: ${res.status} ${text}`);
    }

    const data = await res.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];

    return docs.map((d: any) => {
      const fields = fromFirestoreFields(d.fields || {});
      const parts = d.name.split('/');
      const id = parts[parts.length - 1];
      return {
        id,
        title: fields.title || '',
        summary: fields.summary || null,
        status: fields.status || 'active',
        createdAt: fields.createdAt || d.createTime || null,
        updatedAt: fields.updatedAt || d.updateTime || null,
        summaryUpdatedAt: fields.summaryUpdatedAt || null,
      };
    });
  } catch (err: any) {
    console.error('[FirestoreRest] getUserConversationsRest failed:', err.message);
    throw err;
  }
}

/**
 * Persists a generated PatternShift insight using REST API.
 *
 * LEGACY / UNUSED BY THE PRIVILEGED WRITE PATH:
 * Under firestore.rules, /users/{uid}/insights is read-only for clients
 * (`allow write: if false`). Backend-owned writes MUST use the Admin SDK
 * privileged path (server/services/privilegedPersistence.ts). This
 * function is retained only for reference and MUST NOT be called by the
 * persistence services. It is guaranteed to fail with PERMISSION_DENIED
 * when invoked with a user token.
 */
export async function persistInsightRest(token: string, uid: string, insight: any): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/insights/${insight.id}`;

  const payload = {
    fields: toFirestoreFields({
      id: insight.id,
      generatedAt: insight.generatedAt,
      timeRange: insight.timeRange,
      itemCount: insight.itemCount,
      metrics: insight.metrics,
      observations: insight.observations,
      suggestedInquiries: insight.suggestedInquiries,
      type: insight.type || 'patternshift',
    }),
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore REST error persisting insight: ${res.status} ${text}`);
  }
}

/**
 * Retrieves the latest PatternShift insight for a user using REST API.
 */
export async function getLatestInsightRest(token: string, uid: string): Promise<any | null> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/users/${uid}/insights?pageSize=50`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Firestore REST error getting insights: ${res.status} ${text}`);
    }

    const data = await res.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];
    if (docs.length === 0) return null;

    const insights = docs.map((d: any) => {
      const fields = fromFirestoreFields(d.fields || {});
      const parts = d.name.split('/');
      const id = parts[parts.length - 1];
      return {
        id,
        generatedAt: fields.generatedAt || d.createTime || null,
        timeRange: fields.timeRange || { start: '', end: '' },
        itemCount: fields.itemCount || { entries: 0, completedConversations: 0, total: 0 },
        metrics: fields.metrics || null,
        observations: fields.observations || [],
        suggestedInquiries: fields.suggestedInquiries || [],
        type: fields.type || 'patternshift',
      };
    });

    // Sort descending by generatedAt
    insights.sort((a, b) => {
      const timeA = a.generatedAt ? Date.parse(a.generatedAt) : 0;
      const timeB = b.generatedAt ? Date.parse(b.generatedAt) : 0;
      return timeB - timeA;
    });

    return insights[0] || null;
  } catch (err: any) {
    console.error('[FirestoreRest] getLatestInsightRest failed:', err.message);
    throw err;
  }
}


