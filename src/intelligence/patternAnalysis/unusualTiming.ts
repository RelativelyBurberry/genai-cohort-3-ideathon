/**
 * Unusual Timing Detection (deterministic).
 *
 * Flags recent reflections that fall outside the user's established
 * writing-time window. It ONLY describes the observable timing pattern
 * ("a few recent reflections occurred outside your usual rhythm") and
 * never infers causes such as anxiety, insomnia, or distress.
 */

import {
  toMillis,
  getTimeBucket,
  sortByTime,
  validTimedItems,
  formatPeriodDate,
} from './time';
import { createEvidence } from './evidence';
import { emptyBuckets, TIME_BUCKET_DISPLAY } from './reflectionRhythm';
import type { AnalysisStatus, PatternEvidence, TimeBucket } from './types';

export interface UnusualTimingResult {
  status: AnalysisStatus;
  typicalBucket: TimeBucket | null;
  typicalShare: number;
  flaggedCount: number;
  flaggedHours: number[];
  sampleSize: number;
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum baseline reflections required to establish a "usual" window. */
export const UNUSUAL_TIMING_MIN_BASELINE = 5;

/** Minimum share of the dominant bucket before a "usual" window is claimed. */
export const UNUSUAL_TIMING_MIN_DOMINANT_SHARE = 0.5;

/** Fraction of the most recent reflections scanned for anomalies. */
export const RECENT_WINDOW_FRACTION = 0.4;

const BUCKET_ORDER: TimeBucket[] = ['night', 'morning', 'afternoon', 'evening'];

export function analyzeUnusualTiming(
  items: Array<{ createdAt?: any; id?: string }>
): UnusualTimingResult {
  const timed = sortByTime(validTimedItems(items));

  if (timed.length < UNUSUAL_TIMING_MIN_BASELINE) {
    return {
      status: 'insufficient_data',
      typicalBucket: null,
      typicalShare: 0,
      flaggedCount: 0,
      flaggedHours: [],
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

  let typicalBucket: TimeBucket | null = null;
  let typicalCount = 0;
  for (const bucket of BUCKET_ORDER) {
    if (buckets[bucket] > typicalCount) {
      typicalCount = buckets[bucket];
      typicalBucket = bucket;
    }
  }
  const typicalShare = typicalCount / timed.length;

  // The baseline must be established before anything can be "unusual".
  if (!typicalBucket || typicalShare < UNUSUAL_TIMING_MIN_DOMINANT_SHARE) {
    return {
      status: 'insufficient_data',
      typicalBucket,
      typicalShare,
      flaggedCount: 0,
      flaggedHours: [],
      sampleSize: timed.length,
      observation: null,
      evidence: null,
    };
  }

  const windowSize = Math.max(1, Math.ceil(timed.length * RECENT_WINDOW_FRACTION));
  const recentItems = timed.slice(-windowSize);
  const flaggedHours: number[] = [];

  for (const item of recentItems) {
    const ms = toMillis(item.createdAt);
    const bucket = getTimeBucket(ms);
    if (bucket && bucket !== typicalBucket) {
      flaggedHours.push(new Date(ms).getHours());
    }
  }

  if (flaggedHours.length === 0) {
    return {
      status: 'insufficient_data',
      typicalBucket,
      typicalShare,
      flaggedCount: 0,
      flaggedHours: [],
      sampleSize: timed.length,
      observation: null,
      evidence: null,
    };
  }

  const periodStart = toMillis(timed[0].createdAt);
  const periodEnd = toMillis(timed[timed.length - 1].createdAt);

  const evidence = createEvidence({
    sampleSize: timed.length,
    explanation: `Your typical writing time is the ${TIME_BUCKET_DISPLAY[typicalBucket]}, so recent reflections outside that window stand out as unusual.`,
    breakdown: {
      typicalOccurrences: typicalCount,
      flaggedRecent: flaggedHours.length,
    },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    typicalBucket,
    typicalShare,
    flaggedCount: flaggedHours.length,
    flaggedHours: [...flaggedHours].sort((a, b) => a - b),
    sampleSize: timed.length,
    observation: 'A few recent reflections occurred outside your usual writing rhythm.',
    evidence,
  };
}