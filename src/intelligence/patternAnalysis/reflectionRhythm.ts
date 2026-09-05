/**
 * Reflection Timing Rhythm (deterministic).
 *
 * Groups reflection timestamps into four calendar time-of-day buckets and
 * detects the dominant writing period. Purely observational: it describes
 * WHEN the user tends to write, and never why.
 */

import { toMillis, getTimeBucket, validTimedItems, formatPeriodDate } from './time';
import { createEvidence } from './evidence';
import type { AnalysisStatus, PatternEvidence, TimeBucket } from './types';

export interface ReflectionRhythmResult {
  status: AnalysisStatus;
  buckets: Record<TimeBucket, number>;
  total: number;
  dominantBucket: TimeBucket | null;
  dominantCount: number;
  dominantShare: number;
  balanced: boolean;
  sampleSize: number;
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum number of timestamped reflections required. */
export const REFLECTION_RHYTHM_MIN_ITEMS = 4;

/** Friendly display labels per bucket (used in observations & UI). */
export const TIME_BUCKET_DISPLAY: Record<TimeBucket, string> = {
  night: 'late night',
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
};

const BUCKET_ORDER: TimeBucket[] = ['night', 'morning', 'afternoon', 'evening'];

export function emptyBuckets(): Record<TimeBucket, number> {
  return { night: 0, morning: 0, afternoon: 0, evening: 0 };
}

export function analyzeReflectionRhythm(
  items: Array<{ createdAt?: any; id?: string }>
): ReflectionRhythmResult {
  const timed = validTimedItems(items);

  if (timed.length < REFLECTION_RHYTHM_MIN_ITEMS) {
    return {
      status: 'insufficient_data',
      buckets: emptyBuckets(),
      total: timed.length,
      dominantBucket: null,
      dominantCount: 0,
      dominantShare: 0,
      balanced: false,
      sampleSize: timed.length,
      observation: null,
      evidence: null,
    };
  }

  const buckets = emptyBuckets();
  for (const item of timed) {
    const bucket = getTimeBucket(toMillis(item.createdAt));
    if (bucket) buckets[bucket] += 1;
  }

  const total = timed.length;
  let dominantBucket: TimeBucket | null = null;
  let dominantCount = 0;
  for (const bucket of BUCKET_ORDER) {
    if (buckets[bucket] > dominantCount) {
      dominantCount = buckets[bucket];
      dominantBucket = bucket;
    }
  }
  const dominantShare = dominantCount / total;
  const nonzeroBuckets = BUCKET_ORDER.filter((b) => buckets[b] > 0).length;
  const balanced = dominantShare < 0.5 && nonzeroBuckets >= 3;

  const periodStart = toMillis(timed[0].createdAt);
  const periodEnd = toMillis(timed[timed.length - 1].createdAt);

  let observation: string | null;
  if (balanced) {
    observation = 'Your reflections are spread fairly evenly across the day.';
  } else if (dominantBucket) {
    observation = `You tend to return to reflection most often during the ${TIME_BUCKET_DISPLAY[dominantBucket]}.`;
  } else {
    observation = null;
  }

  const evidence = createEvidence({
    sampleSize: total,
    explanation:
      'Each reflection was grouped into a time-of-day bucket based on the hour recorded on its timestamp.',
    breakdown: { ...buckets },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    buckets,
    total,
    dominantBucket,
    dominantCount,
    dominantShare,
    balanced,
    sampleSize: total,
    observation,
    evidence,
  };
}