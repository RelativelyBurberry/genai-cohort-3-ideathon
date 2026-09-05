/**
 * Reflection Frequency & Rhythm (deterministic).
 *
 * Analyzes the cadence of reflections from the gaps between consecutive
 * timestamps. Distinguishes increasing/decreasing activity, a consistent
 * rhythm, and irregular rhythm with pauses. NEVER gamifies — there is no
 * concept of a "streak" or "missed day" here; only the observable spacing
 * of reflections is described.
 */

import { toMillis, sortByTime, validTimedItems, formatPeriodDate } from './time';
import { createEvidence } from './evidence';
import { round2 } from './types';
import type { AnalysisStatus, PatternEvidence } from './types';

export type ReflectionCadence =
  | 'increasing'
  | 'decreasing'
  | 'consistent'
  | 'irregular'
  | 'insufficient_data';

export interface ReflectionFrequencyResult {
  status: AnalysisStatus;
  cadence: ReflectionCadence;
  avgGapDays: number | null;
  earlyAvgGapDays: number | null;
  recentAvgGapDays: number | null;
  maxGapDays: number | null;
  gapCv: number | null;
  sampleSize: number;
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum number of timestamped reflections required (>=3 gaps). */
export const REFLECTION_FREQUENCY_MIN_ITEMS = 4;

/** Coefficient-of-variation threshold above which rhythm is irregular. */
export const IRREGULAR_GAP_CV = 1.0;

/** Recent/early average-gap ratio at or below which activity is increasing. */
export const INCREASING_GAP_RATIO = 0.55;

/** Absolute gap difference (days) required alongside the ratio test. */
export const INCREASING_GAP_MIN_DELTA_DAYS = 0.5;

/** Recent/early average-gap ratio at or above which activity is decreasing. */
export const DECREASING_GAP_RATIO = 1.8;

const DAY_MS = 86_400_000;

export function analyzeReflectionFrequency(
  items: Array<{ createdAt?: any; id?: string }>
): ReflectionFrequencyResult {
  const timed = sortByTime(validTimedItems(items));

  if (timed.length < REFLECTION_FREQUENCY_MIN_ITEMS) {
    return {
      status: 'insufficient_data',
      cadence: 'insufficient_data',
      avgGapDays: null,
      earlyAvgGapDays: null,
      recentAvgGapDays: null,
      maxGapDays: null,
      gapCv: null,
      sampleSize: timed.length,
      observation: null,
      evidence: null,
    };
  }

  const gapsDays: number[] = [];
  for (let i = 1; i < timed.length; i++) {
    gapsDays.push((toMillis(timed[i].createdAt) - toMillis(timed[i - 1].createdAt)) / DAY_MS);
  }

  const mean =
    gapsDays.reduce((acc, val) => acc + val, 0) / gapsDays.length;
  const sd =
    gapsDays.length > 1
      ? Math.sqrt(
          gapsDays.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
            (gapsDays.length - 1)
        )
      : 0;
  const cv = mean > 0 ? sd / mean : 0;
  const maxGap = Math.max(...gapsDays);

  const midpoint = Math.floor(gapsDays.length / 2);
  const earlyGaps = gapsDays.slice(0, midpoint);
  const recentGaps = gapsDays.slice(midpoint);
  const earlyAvg = earlyGaps.length
    ? earlyGaps.reduce((a, b) => a + b, 0) / earlyGaps.length
    : null;
  const recentAvg = recentGaps.length
    ? recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length
    : null;

  let cadence: ReflectionCadence;
  if (cv > IRREGULAR_GAP_CV) {
    cadence = 'irregular';
  } else if (earlyAvg !== null && recentAvg !== null && earlyAvg > 0) {
    const ratio = recentAvg / earlyAvg;
    if (ratio <= INCREASING_GAP_RATIO && earlyAvg - recentAvg >= INCREASING_GAP_MIN_DELTA_DAYS) {
      cadence = 'increasing';
    } else if (ratio >= DECREASING_GAP_RATIO) {
      cadence = 'decreasing';
    } else {
      cadence = 'consistent';
    }
  } else {
    cadence = 'consistent';
  }

  const periodStart = toMillis(timed[0].createdAt);
  const periodEnd = toMillis(timed[timed.length - 1].createdAt);

  const observation = cadenceObservation(cadence);

  const evidence = createEvidence({
    sampleSize: timed.length,
    explanation:
      'The time between consecutive reflections was compared between the earlier and later portions of the period, and the variation of gaps was measured.',
    breakdown: {
      averageGapDays: round2(mean),
      earlyAverageGapDays: earlyAvg !== null ? round2(earlyAvg) : 0,
      recentAverageGapDays: recentAvg !== null ? round2(recentAvg) : 0,
      longestPauseDays: round2(maxGap),
    },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    cadence,
    avgGapDays: round2(mean),
    earlyAvgGapDays: earlyAvg !== null ? round2(earlyAvg) : null,
    recentAvgGapDays: recentAvg !== null ? round2(recentAvg) : null,
    maxGapDays: round2(maxGap),
    gapCv: round2(cv),
    sampleSize: timed.length,
    observation,
    evidence,
  };
}

function cadenceObservation(cadence: ReflectionCadence): string | null {
  switch (cadence) {
    case 'increasing':
      return 'Your reflections have recently appeared in closer clusters, with longer pauses earlier in the period.';
    case 'decreasing':
      return 'Reflections have been spaced further apart recently than earlier in the period.';
    case 'consistent':
      return 'Your reflections have appeared at a fairly steady rhythm across the period.';
    case 'irregular':
      return 'Reflections appear irregularly — often clustered, with pauses between.';
    default:
      return null;
  }
}