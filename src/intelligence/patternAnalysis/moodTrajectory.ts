/**
 * Longitudinal Mood Trajectory (deterministic).
 *
 * Classifies how mood ratings have moved across time using:
 *  - early-half vs recent-half average comparison (never first vs last)
 *  - standard deviation as a variability guard
 *
 * Output is strictly observational and non-clinical. It answers
 * "did my ratings tend to sit higher/lower recently?" — never
 * "how is my mental health evolving?".
 */

import { toMillis, sortByTime, formatPeriodDate } from './time';
import { createEvidence } from './evidence';
import { round2 } from './types';
import type { AnalyzableEntry, AnalysisStatus, PatternEvidence } from './types';

export type MoodTrajectory =
  | 'upward'
  | 'downward'
  | 'stable'
  | 'high_variability'
  | 'insufficient_data';

export interface MoodTrajectoryResult {
  status: AnalysisStatus;
  trajectory: MoodTrajectory;
  averageMood: number | null;
  earlyAverageMood: number | null;
  recentAverageMood: number | null;
  standardDeviation: number | null;
  highVariability: boolean;
  sampleSize: number;
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum number of mood-rated entries required for a trajectory claim. */
export const MOOD_TRAJECTORY_MIN_ENTRIES = 4;

/** Std-dev threshold (on the 1–5 scale) above which variability dominates. */
export const HIGH_VARIABILITY_STDDEV = 1.2;

/** Minimum early-vs-recent average gap (on the 1–5 scale) to claim a trend. */
export const TREND_DELTA = 0.5;

export function analyzeMoodTrajectory(entries: AnalyzableEntry[]): MoodTrajectoryResult {
  const rated = sortByTime(
    (entries || []).filter(
      (e) => e && typeof e.moodRating === 'number' && e.moodRating >= 1 && e.moodRating <= 5
    )
  );

  if (rated.length < MOOD_TRAJECTORY_MIN_ENTRIES) {
    return {
      status: 'insufficient_data',
      trajectory: 'insufficient_data',
      averageMood: null,
      earlyAverageMood: null,
      recentAverageMood: null,
      standardDeviation: null,
      highVariability: false,
      sampleSize: rated.length,
      observation: null,
      evidence: null,
    };
  }

  const n = rated.length;
  const ratings = rated.map((e) => e.moodRating as number);
  const mean = ratings.reduce((a, b) => a + b, 0) / n;
  // Sample standard deviation (matches the PatternShift engine convention).
  const variance =
    n > 1
      ? ratings.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const highVariability = stdDev >= HIGH_VARIABILITY_STDDEV;

  // Early half vs recent half (deterministic split, NOT first vs last).
  const midpoint = Math.floor(n / 2);
  const earlier = ratings.slice(0, midpoint);
  const recent = ratings.slice(midpoint);
  const earlyAvg = earlier.length
    ? earlier.reduce((a, b) => a + b, 0) / earlier.length
    : null;
  const recentAvg = recent.length
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : null;

  let trajectory: MoodTrajectory;
  if (highVariability) {
    trajectory = 'high_variability';
  } else if (earlyAvg !== null && recentAvg !== null) {
    const delta = recentAvg - earlyAvg;
    if (delta >= TREND_DELTA) trajectory = 'upward';
    else if (delta <= -TREND_DELTA) trajectory = 'downward';
    else trajectory = 'stable';
  } else {
    trajectory = 'stable';
  }

  const periodStart = toMillis(rated[0].createdAt);
  const periodEnd = toMillis(rated[n - 1].createdAt);

  const observation = trajectoryObservation(trajectory);

  const evidence = createEvidence({
    sampleSize: n,
    explanation:
      'Mood ratings were compared between the earlier and later portions of the analyzed period, and the spread of ratings was measured.',
    breakdown:
      earlyAvg !== null && recentAvg !== null
        ? {
            earlierAverageMood: round2(earlyAvg),
            recentAverageMood: round2(recentAvg),
            standardDeviation: round2(stdDev),
          }
        : { standardDeviation: round2(stdDev) },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    trajectory,
    averageMood: round2(mean),
    earlyAverageMood: earlyAvg !== null ? round2(earlyAvg) : null,
    recentAverageMood: recentAvg !== null ? round2(recentAvg) : null,
    standardDeviation: round2(stdDev),
    highVariability,
    sampleSize: n,
    observation,
    evidence,
  };
}

function trajectoryObservation(trajectory: MoodTrajectory): string | null {
  switch (trajectory) {
    case 'upward':
      return 'Your recent reflections have generally carried higher mood ratings than earlier entries in this period.';
    case 'downward':
      return 'Recent reflections have generally carried lower mood ratings than earlier entries in this period.';
    case 'stable':
      return 'Mood ratings have remained fairly consistent across the period.';
    case 'high_variability':
      return 'Mood ratings have shown noticeable swings across the period.';
    default:
      return null;
  }
}