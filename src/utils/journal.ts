import { Timestamp } from 'firebase/firestore';

/**
 * Deterministically calculates word count from text content.
 * Handles multiple whitespace, empty strings, tabs, and newlines correctly.
 */
export function calculateWordCount(content: string): number {
  if (!content) return 0;
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Normalizes an array of tags or a comma-separated string of tags:
 * - Trims whitespace
 * - Strips leading '#' symbol if present
 * - Filters out empty strings
 * - Deduplicates tags (case-insensitive deduplication, preserving lowercase)
 */
export function normalizeTags(rawTags: string[] | string | undefined | null): string[] {
  if (!rawTags) return [];

  const tagList = Array.isArray(rawTags)
    ? rawTags
    : rawTags.split(',').map((t) => t.trim());

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tagList) {
    if (typeof tag !== 'string') continue;
    const clean = tag.trim().replace(/^#+/, '').trim().toLowerCase();
    if (clean.length > 0 && !seen.has(clean)) {
      seen.add(clean);
      normalized.push(clean);
    }
  }

  return normalized;
}

/**
 * Validates journal entry input prior to Firestore persistence.
 * Enforces non-empty content after trimming, and valid mood rating [1..5].
 */
export function validateJournalEntryInput(input: {
  content?: string | null;
  moodRating?: number | null;
}): { valid: boolean; error?: string } {
  if (!input.content || typeof input.content !== 'string' || input.content.trim().length === 0) {
    return {
      valid: false,
      error: 'Reflection content cannot be empty. Please express your thoughts before saving.',
    };
  }

  if (
    input.moodRating === undefined ||
    input.moodRating === null ||
    typeof input.moodRating !== 'number' ||
    !Number.isInteger(input.moodRating) ||
    input.moodRating < 1 ||
    input.moodRating > 5
  ) {
    return {
      valid: false,
      error: 'Please select a mood rating between 1 and 5.',
    };
  }

  return { valid: true };
}

/**
 * Formats a Firestore Timestamp or Date object into a calm, readable string.
 */
export function formatEntryDate(timestamp: Timestamp | Date | null | undefined): string {
  if (!timestamp) return 'Just now';

  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Canonical numeric mood ratings (1 to 5) and their mapped vocabulary:
 * 1 -> Heavy
 * 2 -> Low
 * 3 -> Grounded
 * 4 -> Uplifted
 * 5 -> Radiant
 */
export const CANONICAL_MOOD_RATINGS = [1, 2, 3, 4, 5] as const;
export type CanonicalMoodRating = (typeof CANONICAL_MOOD_RATINGS)[number];

/**
 * Returns a human-friendly mood descriptor and color class.
 */
export function getMoodDescriptor(mood: number): {
  label: string;
  description: string;
  badgeClass: string;
  bgClass: string;
  textClass: string;
  dotColor: string;
} {
  switch (mood) {
    case 1:
      return {
        label: 'Heavy',
        description: 'Exhausted, overwhelmed, or deep strain',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        bgClass: 'bg-rose-100',
        textClass: 'text-rose-700',
        dotColor: 'bg-rose-500',
      };
    case 2:
      return {
        label: 'Low',
        description: 'Uneasy, drained, or carrying friction',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        bgClass: 'bg-amber-100',
        textClass: 'text-amber-700',
        dotColor: 'bg-amber-500',
      };
    case 3:
      return {
        label: 'Grounded',
        description: 'Steady, contemplative, or neutral',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        bgClass: 'bg-slate-200',
        textClass: 'text-slate-700',
        dotColor: 'bg-slate-500',
      };
    case 4:
      return {
        label: 'Uplifted',
        description: 'Clear, constructive, or peaceful',
        badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
        bgClass: 'bg-teal-100',
        textClass: 'text-teal-700',
        dotColor: 'bg-teal-500',
      };
    case 5:
      return {
        label: 'Radiant',
        description: 'Energized, inspired, or deeply grateful',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        bgClass: 'bg-emerald-100',
        textClass: 'text-emerald-700',
        dotColor: 'bg-emerald-500',
      };
    default:
      return {
        label: 'Neutral',
        description: 'Unspecified state',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        bgClass: 'bg-slate-200',
        textClass: 'text-slate-700',
        dotColor: 'bg-slate-400',
      };
  }
}
