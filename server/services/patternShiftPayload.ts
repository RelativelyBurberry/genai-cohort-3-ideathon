/**
 * PatternShift — Client-Provided Analysis Payload Validation
 *
 * Narrow, strictly validated fallback for runtimes where backend
 * Firestore READ capability is unavailable due to infrastructure IAM
 * limitations (AI Studio preview sandbox).
 *
 * SECURITY INVARIANTS (deliberately enforced here):
 * 1. The payload schema is MINIMAL: only the fields required by
 *    PatternShift analysis (id/title/content/moodRating/tags/
 *    createdAt/updatedAt/location for entries; id/title/summary/
 *    createdAt/updatedAt/summaryUpdatedAt for completed conversations).
 *    It is NOT a generic "upload all Firestore data" endpoint.
 * 2. A `uid` is NOT part of the schema. Identity always comes
 *    exclusively from `requireAuth`; unknown fields are rejected.
 * 3. No raw message history. Only completed conversation SUMMARIES
 *    (never subcollection messages) are accepted.
 * 4. Field types, bounds, and array lengths are strictly enforced so
 *    the engine can never be fed malformed data from the wire.
 *
 * The validated result maps directly to the engine's `RawEntry` and
 * `RawConversation` shapes (`./patternShiftEngine.js`).
 */

import type { RawEntry, RawConversation } from './patternShiftEngine.js';

/** Bounds applied to client-provided analysis data. */
export const PATTERN_ANALYSIS_PAYLOAD_LIMITS = {
  maxEntries: 200,
  maxConversations: 200,
  maxIdLength: 128,
  maxTitleLength: 500,
  maxContentLength: 20000,
  maxSummaryLength: 20000,
  maxTagLength: 50,
  maxTagsPerEntry: 20,
  maxLabelLength: 200,
} as const;

type ValidationResult =
  | { valid: true; entries: RawEntry[]; completedConversations: RawConversation[] }
  | { valid: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  subject: string
): { ok: true } | { ok: false; error: string } {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        error: `${subject} contains unsupported field '${key}'.`,
      };
    }
  }
  return { ok: true };
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} must be a string.` };
  }
  if (value.length > maxLength) {
    return { ok: false, error: `${fieldName} exceeds ${maxLength} characters.` };
  }
  return { ok: true, value };
}

function parseRequiredNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = parseOptionalString(value, fieldName, maxLength);
  if (!parsed.ok) return parsed;
  if (parsed.value === undefined || parsed.value.trim().length === 0) {
    return { ok: false, error: `${fieldName} must be a non-empty string.` };
  }
  return { ok: true, value: parsed.value };
}

function parseOptionalNumber(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: `${fieldName} must be a number between ${min} and ${max}.` };
  }
  return { ok: true, value };
}

function parseTimestamp(
  value: unknown,
  fieldName: string
): { ok: true; value: string | number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string') {
    return { ok: true, value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: `${fieldName} must be an ISO date string or a numeric timestamp.`,
  };
}

function parseTags(
  value: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'tags must be an array.' };
  if (value.length > PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTagsPerEntry) {
    return {
      ok: false,
      error: `tags exceeds limit of ${PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTagsPerEntry} tags.`,
    };
  }
  const tags: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const tag = value[i];
    if (typeof tag !== 'string') {
      return { ok: false, error: `tags[${i}] must be a string.` };
    }
    const normalized = tag.trim();
    if (normalized.length === 0) continue;
    if (normalized.length > PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTagLength) {
      return {
        ok: false,
        error: `tags[${i}] exceeds ${PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTagLength} characters.`,
      };
    }
    tags.push(normalized);
  }
  return { ok: true, value: tags };
}

function parseLocation(
  value: unknown
): { ok: true; value: RawEntry['location'] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!isPlainObject(value)) return { ok: false, error: 'location must be an object.' };

  const allowedLocationKeys = new Set(['latitude', 'longitude', 'label']);
  const keyCheck = rejectUnknownKeys(value, allowedLocationKeys, 'location');
  if (!keyCheck.ok) return keyCheck;

  const location: { latitude?: number; longitude?: number; label?: string } = {};

  const latitude = parseOptionalNumber(value.latitude, 'location.latitude', -90, 90);
  if (!latitude.ok) return latitude;
  if (latitude.value !== undefined) location.latitude = latitude.value;

  const longitude = parseOptionalNumber(value.longitude, 'location.longitude', -180, 180);
  if (!longitude.ok) return longitude;
  if (longitude.value !== undefined) location.longitude = longitude.value;

  const label = parseOptionalString(
    value.label,
    'location.label',
    PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxLabelLength
  );
  if (!label.ok) return label;
  if (label.value !== undefined) location.label = label.value;

  // An empty location object carries no analysis value.
  return { ok: true, value: Object.keys(location).length > 0 ? location : null };
}

function parseClientEntry(
  value: unknown
): { ok: true; entry: RawEntry } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'entry must be an object.' };

  const allowedEntryKeys = new Set([
    'id',
    'title',
    'content',
    'moodRating',
    'tags',
    'createdAt',
    'updatedAt',
    'location',
  ]);
  const keyCheck = rejectUnknownKeys(value, allowedEntryKeys, 'entry');
  if (!keyCheck.ok) return keyCheck;

  const id = parseOptionalString(value.id, 'id', PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxIdLength);
  if (!id.ok) return id;

  const title = parseOptionalString(
    value.title,
    'title',
    PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTitleLength
  );
  if (!title.ok) return title;

  const content = parseRequiredNonEmptyString(
    value.content,
    'content',
    PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxContentLength
  );
  if (!content.ok) return content;

  const moodRating = parseOptionalNumber(value.moodRating, 'moodRating', 1, 5);
  if (!moodRating.ok) return moodRating;

  const tags = parseTags(value.tags);
  if (!tags.ok) return tags;

  const createdAt = parseTimestamp(value.createdAt, 'createdAt');
  if (!createdAt.ok) return createdAt;

  const updatedAt = parseTimestamp(value.updatedAt, 'updatedAt');
  if (!updatedAt.ok) return updatedAt;

  const location = parseLocation(value.location);
  if (!location.ok) return location;

  return {
    ok: true,
    entry: {
      id: id.value ?? '',
      title: title.value,
      content: content.value,
      moodRating: moodRating.value,
      tags: tags.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      location: location.value,
    },
  };
}

function parseClientConversation(
  value: unknown
): { ok: true; conversation: RawConversation } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: 'conversation must be an object.' };

  const allowedConversationKeys = new Set([
    'id',
    'title',
    'summary',
    'createdAt',
    'updatedAt',
    'summaryUpdatedAt',
  ]);
  const keyCheck = rejectUnknownKeys(value, allowedConversationKeys, 'conversation');
  if (!keyCheck.ok) return keyCheck;

  const id = parseOptionalString(value.id, 'id', PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxIdLength);
  if (!id.ok) return id;

  const title = parseOptionalString(
    value.title,
    'title',
    PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxTitleLength
  );
  if (!title.ok) return title;

  const summary = parseRequiredNonEmptyString(
    value.summary,
    'summary',
    PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxSummaryLength
  );
  if (!summary.ok) return summary;

  const createdAt = parseTimestamp(value.createdAt, 'createdAt');
  if (!createdAt.ok) return createdAt;

  const updatedAt = parseTimestamp(value.updatedAt, 'updatedAt');
  if (!updatedAt.ok) return updatedAt;

  const summaryUpdatedAt = parseTimestamp(value.summaryUpdatedAt, 'summaryUpdatedAt');
  if (!summaryUpdatedAt.ok) return summaryUpdatedAt;

  return {
    ok: true,
    conversation: {
      id: id.value ?? '',
      title: title.value,
      summary: summary.value,
      // Completed conversations are the only ones accepted here.
      status: 'completed',
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      summaryUpdatedAt: summaryUpdatedAt.value,
    },
  };
}

/**
 * Validate an optional client-provided PatternShift analysis payload.
 *
 * @param input Raw `body.analysisPayload` value from the wire.
 * @returns A discriminated validation result. `entries` /
 *          `completedConversations` are freshly constructed plain
 *          objects — unknown fields are never copied through.
 */
export function validatePatternShiftAnalysisPayload(input: unknown): ValidationResult {
  // Absent payload is valid-but-empty (the server simply has no client
  // data to fall back to; the route decides what that means).
  if (input === undefined || input === null) {
    return { valid: true, entries: [], completedConversations: [] };
  }
  if (!isPlainObject(input)) {
    return { valid: false, error: 'analysisPayload must be an object.' };
  }

  const allowedPayloadKeys = new Set(['entries', 'completedConversations']);
  const keyCheck = rejectUnknownKeys(input, allowedPayloadKeys, 'analysisPayload');
  if (!keyCheck.ok) {
    return { valid: false, error: keyCheck.error };
  }

  const rawEntries = input.entries === undefined ? [] : input.entries;
  const rawConversations =
    input.completedConversations === undefined ? [] : input.completedConversations;

  if (!Array.isArray(rawEntries)) {
    return { valid: false, error: 'analysisPayload.entries must be an array.' };
  }
  if (!Array.isArray(rawConversations)) {
    return { valid: false, error: 'analysisPayload.completedConversations must be an array.' };
  }
  if (rawEntries.length > PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxEntries) {
    return {
      valid: false,
      error: `analysisPayload.entries exceeds limit of ${PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxEntries}.`,
    };
  }
  if (rawConversations.length > PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxConversations) {
    return {
      valid: false,
      error: `analysisPayload.completedConversations exceeds limit of ${PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxConversations}.`,
    };
  }

  const entries: RawEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const parsed = parseClientEntry(rawEntries[i]);
    if (!parsed.ok) {
      return { valid: false, error: `analysisPayload.entries[${i}]: ${parsed.error}` };
    }
    entries.push(parsed.entry);
  }

  const completedConversations: RawConversation[] = [];
  for (let i = 0; i < rawConversations.length; i++) {
    const parsed = parseClientConversation(rawConversations[i]);
    if (!parsed.ok) {
      return {
        valid: false,
        error: `analysisPayload.completedConversations[${i}]: ${parsed.error}`,
      };
    }
    completedConversations.push(parsed.conversation);
  }

  return { valid: true, entries, completedConversations };
}

/**
 * True when the client actually supplied any analysis records. Used by
 * the route to decide between "use the payload" and "ask the client to
 * provide its minimal records".
 */
export function hasAnalysisRecords(
  validation: { entries: RawEntry[]; completedConversations: RawConversation[] } | null
): boolean {
  return Boolean(validation && (validation.entries.length > 0 || validation.completedConversations.length > 0));
}