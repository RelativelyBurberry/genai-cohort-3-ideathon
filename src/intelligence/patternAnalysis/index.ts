/**
 * PatternShift Extended Intelligence — module entry point.
 *
 * All analysis here is deterministic, pure, and independent of React,
 * Firebase, and the backend. The backend engine maps journal data into
 * `AnalyzableEntry` shape and calls `analyzePatternIntelligence`.
 */

import type { AnalyzableEntry } from './types';
import { analyzeMoodTrajectory, type MoodTrajectoryResult } from './moodTrajectory';
import { analyzeReflectionRhythm, type ReflectionRhythmResult } from './reflectionRhythm';
import {
  analyzeReflectionFrequency,
  type ReflectionFrequencyResult,
} from './reflectionFrequency';
import { analyzeThemeEvolution, type ThemeEvolutionResult } from './themeEvolution';
import { analyzeUnusualTiming, type UnusualTimingResult } from './unusualTiming';
import { analyzeLocationPatterns, type LocationPatternsResult } from './locationPatterns';

export interface PatternIntelligence {
  moodTrajectory: MoodTrajectoryResult;
  reflectionRhythm: ReflectionRhythmResult;
  reflectionFrequency: ReflectionFrequencyResult;
  themeEvolution: ThemeEvolutionResult;
  unusualTiming: UnusualTimingResult;
  locationPatterns: LocationPatternsResult;
}

/**
 * Run the full deterministic intelligence suite.
 *
 * @param entries                 Journal entries (mood, tags, timestamps, locations).
 * @param additionalTimedItems    Additional timestamped reflections (e.g. completed
 *                                guided conversations) used for timing analyses only.
 */
export function analyzePatternIntelligence(
  entries: AnalyzableEntry[],
  additionalTimedItems: Array<{ createdAt?: any; id?: string }> = []
): PatternIntelligence {
  const timed = [...(entries || []), ...(additionalTimedItems || [])];
  return {
    moodTrajectory: analyzeMoodTrajectory(entries),
    reflectionRhythm: analyzeReflectionRhythm(timed),
    reflectionFrequency: analyzeReflectionFrequency(entries),
    themeEvolution: analyzeThemeEvolution(entries),
    unusualTiming: analyzeUnusualTiming(timed),
    locationPatterns: analyzeLocationPatterns(entries),
  };
}

export type {
  AnalyzableEntry,
  AnalysisStatus,
  Confidence,
  PatternEvidence,
  TimeBucket,
} from './types';
export { round2 } from './types';
export type { MoodTrajectory, MoodTrajectoryResult } from './moodTrajectory';
export { analyzeMoodTrajectory, MOOD_TRAJECTORY_MIN_ENTRIES } from './moodTrajectory';
export type { ReflectionRhythmResult } from './reflectionRhythm';
export {
  analyzeReflectionRhythm,
  REFLECTION_RHYTHM_MIN_ITEMS,
  TIME_BUCKET_DISPLAY,
  emptyBuckets,
} from './reflectionRhythm';
export type { ReflectionCadence, ReflectionFrequencyResult } from './reflectionFrequency';
export { analyzeReflectionFrequency, REFLECTION_FREQUENCY_MIN_ITEMS } from './reflectionFrequency';
export type { ThemeEvolutionResult, ThemeEvolutionRow } from './themeEvolution';
export { analyzeThemeEvolution, THEME_EVOLUTION_MIN_OCCURRENCES } from './themeEvolution';
export type { UnusualTimingResult } from './unusualTiming';
export { analyzeUnusualTiming, UNUSUAL_TIMING_MIN_BASELINE } from './unusualTiming';
export type { LocationPatternsResult, RecurringLabel } from './locationPatterns';
export { analyzeLocationPatterns, LOCATION_PATTERNS_MIN_ENTRIES } from './locationPatterns';
export { gradeConfidence, createEvidence } from './evidence';
export { toMillis, getTimeBucket, sortByTime, formatPeriodDate } from './time';