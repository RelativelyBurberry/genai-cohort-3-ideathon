/**
 * Deterministic evidence construction.
 *
 * Every surfaced observation must carry evidence that explains how many
 * reflections contributed, what period was analyzed, and why the pattern
 * was surfaced ("Why am I seeing this?"). Confidence is graded strictly
 * from sample size — never from subjective judgment.
 */

import type { Confidence, PatternEvidence } from './types';

/** Deterministic confidence grading from sample size. */
export function gradeConfidence(sampleSize: number): Confidence {
  if (sampleSize >= 8) return 'strong';
  if (sampleSize >= 5) return 'moderate';
  return 'low';
}

/** Build a fully-populated evidence object for an observation. */
export function createEvidence(input: {
  sampleSize: number;
  explanation: string;
  breakdown?: Record<string, number>;
  periodStart?: string;
  periodEnd?: string;
}): PatternEvidence {
  return {
    sampleSize: input.sampleSize,
    confidence: gradeConfidence(input.sampleSize),
    explanation: input.explanation,
    breakdown: input.breakdown,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  };
}