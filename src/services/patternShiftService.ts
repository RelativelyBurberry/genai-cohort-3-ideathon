import { getJournalEntries } from '../services/journalService';
import { getConversations } from '../services/reflectionService';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import type {
  PatternShiftInsight,
  PatternShiftPersistenceStatus,
  PatternShiftResponse,
} from '../types/patternshift';

/**
 * PatternShift Client Service — CLIENT-READ PRIMARY ARCHITECTURE.
 *
 * In the Google AI Studio / preview runtime the authenticated Firebase
 * CLIENT can read the user's permitted Firestore data via the Firebase
 * Client SDK / firestore.rules, while the backend runtime cannot be
 * relied upon to have Firebase Admin / Cloud Datastore IAM permissions.
 *
 * Therefore the PRIMARY and DIRECT request flow is:
 *
 *   1. Frontend reads the user's journal entries (client SDK).
 *   2. Frontend reads the user's completed conversations (client SDK).
 *   3. Frontend builds a minimal, bounded, sanitized analysis payload
 *      (coordinates NEVER leave the device).
 *   4. Frontend sends ONE POST /api/patternshift/analyze request carrying
 *      the payload plus the Firebase ID token in the Authorization header.
 *   5. Backend verifies the token (requireAuth), derives identity ONLY
 *      from the verified token, validates the payload strictly, computes
 *      deterministic intelligence, invokes Gemini, and returns ONE
 *      canonical response contract.
 *
 * There is NO backend Firestore read in the analysis flow and NO
 * IAM-failure / retry roundtrip.
 */

// -------------------------------------------------------------------------
// Client-side minimal payload builder (primary data source)
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

export interface AnalysisPayload {
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
 * Build the minimal, schema-conformant analysis payload from the client's
 * OWN authenticated Firestore reads.
 *
 * PRIVACY: Location coordinates are NEVER included in the payload —
 * only the user-provided label is sent; coordinates stay local.
 * No raw message content from conversation subcollections is included —
 * only completed conversation SUMMARIES.
 */
export async function buildAnalysisPayload(uid: string): Promise<AnalysisPayload> {
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
    location: e.location?.label ? { label: e.location.label } : undefined,
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
// Canonical response parser — MUST match the backend contract exactly.
// -------------------------------------------------------------------------

/**
 * Parse the backend response against the CANONICAL PatternShift contract.
 *
 * - { status: 'success', insight, persistence }
 * - { status: 'insufficient_data', required, available, message }
 * - non-2xx: { error, message } → status: 'error'
 *
 * Anything else is rejected as `unexpected_response` with the exact
 * server payload preserved in the message for diagnostics.
 */
export function parsePatternShiftApiResponse(
  response: Response,
  json: any
): PatternShiftResponse {
  // Rate limit: stable typed error with retry hint.
  if (response.status === 429) {
    return {
      status: 'error',
      error: 'rate_limit_exceeded',
      message: json?.message || 'Analysis limit reached. Please wait a moment before re-analyzing.',
      retryAfterSeconds: typeof json?.retryAfterSeconds === 'number' ? json.retryAfterSeconds : undefined,
    };
  }

  if (!response.ok) {
    return {
      status: 'error',
      error: json?.error || 'server_error',
      message: json?.message || `Analysis failed with HTTP ${response.status}.`,
    };
  }

  if (json?.status === 'insufficient_data') {
    return {
      status: 'insufficient_data',
      required: typeof json.required === 'number' ? json.required : 3,
      available: typeof json.available === 'number' ? json.available : 0,
      message: json.message || 'At least 3 meaningful reflections are required.',
    };
  }

  if (json?.status === 'success' && json.insight && typeof json.insight === 'object') {
    const persistence: PatternShiftPersistenceStatus =
      json.persistence && typeof json.persistence.persisted === 'boolean'
        ? json.persistence
        : { persisted: false, reason: 'unspecified' };
    return {
      status: 'success',
      insight: json.insight as PatternShiftInsight,
      persistence,
    };
  }

  return {
    status: 'error',
    error: 'unexpected_response',
    message: 'Received unexpected response format from server.',
  };
}

// -------------------------------------------------------------------------
// Existing persisted insight (CLIENT-READ PRIMARY, backend fallback)
// -------------------------------------------------------------------------

/**
 * Load the user's most recently persisted PatternShift insight.
 *
 * Primary: client SDK read of /users/{uid}/insights (firestore.rules allow
 * owner reads). Fallback: GET /api/patternshift/latest (backend Admin-SDK
 * read) for environments where the insight was written server-side but the
 * client read is unavailable.
 */
export async function fetchLatestInsight(
  getIdToken: () => Promise<string | null>,
  uid?: string
): Promise<PatternShiftInsight | null> {
  // Primary path — client SDK read (works with the authenticated client
  // in the AI Studio preview runtime).
  if (uid) {
    try {
      const insightsCol = collection(db, 'users', uid, 'insights');
      const insightsQuery = query(insightsCol, orderBy('generatedAt', 'desc'), limit(1));
      const snapshot = await getDocs(insightsQuery);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          generatedAt: data.generatedAt || '',
          timeRange: data.timeRange || { start: '', end: '' },
          itemCount: data.itemCount || { entries: 0, completedConversations: 0, total: 0 },
          metrics: data.metrics || null,
          observations: data.observations || [],
          suggestedInquiries: data.suggestedInquiries || [],
          intelligence: data.intelligence || null,
          type: data.type || 'patternshift',
        } as PatternShiftInsight;
      }
    } catch (err: any) {
      console.warn('[PatternShiftService] Client read of insights unavailable; falling back to backend:', err.message);
    }
  }

  // Fallback path — backend GET /api/patternshift/latest.
  const token = await getIdToken();
  if (!token) {
    return null;
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

// -------------------------------------------------------------------------
// Analysis trigger — ONE direct request carrying the client-built payload
// -------------------------------------------------------------------------

/**
 * Run a PatternShift longitudinal analysis.
 *
 * CLIENT-READ PRIMARY: the client reads its own authorized data, builds a
 * minimal validated `analysisPayload`, and sends it in the FIRST AND ONLY
 * request. No IAM-failure / retry roundtrip exists in the normal flow.
 */
export async function triggerPatternAnalysis(
  getIdToken: () => Promise<string | null>,
  uid?: string
): Promise<PatternShiftResponse> {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    return {
      status: 'error',
      error: 'authentication_required',
      message: 'Please sign in to run PatternShift analysis.',
    };
  }

  const token = await getIdToken();
  if (!token) {
    return {
      status: 'error',
      error: 'authentication_required',
      message: 'Authentication required: Unable to acquire session token.',
    };
  }

  // Build the payload from the client's own authenticated reads.
  let analysisPayload: AnalysisPayload;
  try {
    analysisPayload = await buildAnalysisPayload(uid);
  } catch (payloadErr: any) {
    console.warn('[PatternShiftService] Client-side data read failed:', payloadErr.message);
    return {
      status: 'error',
      error: 'client_data_unavailable',
      message:
        'Unable to read your journal entries and reflections. ' +
        'Please try again later.',
    };
  }

  let response: Response;
  try {
    response = await fetch('/api/patternshift/analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ analysisPayload }),
    });
  } catch (networkErr: any) {
    return {
      status: 'error',
      error: 'network_error',
      message: 'Could not reach PatternShift analysis. Please try again later.',
    };
  }

  const json = await response.json().catch(() => ({}));
  return parsePatternShiftApiResponse(response, json);
}