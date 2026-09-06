import { getJournalEntries } from '../services/journalService';
import { getConversations } from '../services/reflectionService';
import type {
  PatternShiftInsight,
  PatternShiftResponse,
  PatternShiftPersistenceStatus,
} from '../types/patternshift';

/**
 * Client service for PatternShift Longitudinal Insights.
 * Communicates exclusively through authenticated backend API endpoints.
 *
 * Remediation: Where the backend cannot read Firestore (AI Studio sandbox
 * IAM limitation), the client builds a minimal, validated analysis payload
 * from its OWN authenticated Firestore reads and includes it in the retry.
 * Identity always comes from the backend's requireAuth middleware — the
 * payload schema does NOT include a uid field.
 */

// -------------------------------------------------------------------------
// Client-side minimal payload builder
// -------------------------------------------------------------------------

interface AnalysisEntry {
  id: string;
  title?: string;
  content: string;
  moodRating?: number;
  tags?: string[];
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  location?: {
    latitude?: number;
    longitude?: number;
    label?: string;
  } | null;
}

interface AnalysisConversation {
  id: string;
  title?: string;
  summary: string;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  summaryUpdatedAt?: string | number | null;
}

interface AnalysisPayload {
  entries: AnalysisEntry[];
  completedConversations: AnalysisConversation[];
}

function toISOStringOrNull(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof ts === 'number') {
    return new Date(ts < 10000000000 ? ts * 1000 : ts).toISOString();
  }
  return null;
}

/**
 * Build a minimal, schema-conformant analysis payload from the client's
 * own authenticated Firestore reads. Only the fields required by
 * PatternShift analysis are included — no message content, no raw
 * subcollection messages. Only completed conversation summaries.
 *
 * PRIVACY: Location coordinates are NEVER included in the payload.
 * Only the user-provided label is sent; coordinates stay local.
 */
async function buildAnalysisPayload(uid: string): Promise<AnalysisPayload> {
  const [journalEntries, allConversations] = await Promise.all([
    getJournalEntries(uid),
    getConversations(uid),
  ]);

  const entries: AnalysisEntry[] = journalEntries.map((e) => ({
    id: e.id,
    title: e.title || undefined,
    content: e.content,
    moodRating: typeof e.moodRating === 'number' ? e.moodRating : undefined,
    tags: Array.isArray(e.tags) ? e.tags : undefined,
    createdAt: toISOStringOrNull(e.createdAt),
    updatedAt: toISOStringOrNull(e.updatedAt),
    location: e.location?.label
      ? { label: e.location.label }
      : undefined,
  }));

  const completedConversations: AnalysisConversation[] = allConversations
    .filter(
      (c) =>
        c.status === 'completed' &&
        typeof c.summary === 'string' &&
        c.summary.trim().length > 0
    )
    .map((c) => ({
      id: c.id,
      title: c.title || undefined,
      summary: c.summary!,
      createdAt: toISOStringOrNull(c.createdAt),
      updatedAt: toISOStringOrNull(c.updatedAt),
      summaryUpdatedAt: toISOStringOrNull(c.summaryUpdatedAt),
    }));

  return { entries, completedConversations };
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export async function fetchLatestInsight(
  getIdToken: () => Promise<string | null>
): Promise<PatternShiftInsight | null> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Authentication required: Unable to acquire session token.');
  }

  const response = await fetch('/api/patternshift/latest', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson.message || errorJson.error || `HTTP ${response.status} failed to load latest insight`
    );
  }

  const json = await response.json();
  return json.insight || null;
}

export async function triggerPatternAnalysis(
  getIdToken: () => Promise<string | null>,
  uid?: string
): Promise<PatternShiftResponse> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Authentication required: Unable to acquire session token.');
  }

  // Step 1: Normal server-side analysis attempt (no client payload).
  const firstResponse = await fetch('/api/patternshift/analyze', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const firstJson = await firstResponse.json().catch(() => ({}));

  if (firstResponse.status === 429) {
    return {
      status: 'error',
      error: 'rate_limit_exceeded',
      message: firstJson.message || 'Analysis limit reached. Please wait a moment before re-analyzing.',
    };
  }

  // Step 2: If backend signals "client_data_required" and we have a uid,
  // build the minimal analysis payload from the client's own Firestore
  // reads and retry.
  if (firstJson.status === 'client_data_required' && uid) {
    try {
      const analysisPayload = await buildAnalysisPayload(uid);

      const retryResponse = await fetch('/api/patternshift/analyze', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ analysisPayload }),
      });

      const retryJson = await retryResponse.json().catch(() => ({}));

      if (retryResponse.status === 429) {
        return {
          status: 'error',
          error: 'rate_limit_exceeded',
          message: retryJson.message || 'Analysis limit reached.',
        };
      }

      return parseAnalysisResponse(retryResponse, retryJson);
    } catch (payloadErr: any) {
      // If client-side reads also fail, surface the original
      // "client_data_required" message rather than a confusing error.
      return {
        status: 'error',
        error: 'client_data_unavailable',
        message:
          'The server and client could not read your reflection data. ' +
          'Please try again later.',
      };
    }
  }

  return parseAnalysisResponse(firstResponse, firstJson);
}

function parseAnalysisResponse(response: Response, json: any): PatternShiftResponse {
  if (!response.ok) {
    return {
      status: 'error',
      error: json.error || 'server_error',
      message: json.message || `Analysis failed with HTTP ${response.status}`,
    };
  }

  if (json.status === 'insufficient_data') {
    return {
      status: 'insufficient_data',
      required: json.required || 3,
      available: json.available || 0,
      message: json.message || 'More reflection history required.',
    };
  }

  if (json.status === 'client_data_required') {
    return {
      status: 'client_data_required',
      message: json.message || 'Provide records and retry.',
    };
  }

  if (json.status === 'success' && json.insight) {
    return {
      status: 'success',
      insight: json.insight,
      persistence: json.persistence || undefined,
    };
  }

  return {
    status: 'error',
    error: 'unexpected_response',
    message: 'Received unexpected response format from server.',
  };
}