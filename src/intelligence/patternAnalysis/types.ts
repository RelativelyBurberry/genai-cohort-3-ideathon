/**
 * Phase 10 — PatternShift Extended Intelligence: shared types.
 *
 * These types are PURE and framework-independent. They are imported by
 * backend analysis code and by the frontend UI, but NEVER by React
 * components as analysis logic.
 */

/** Whether a module had enough evidence to surface an observation. */
export type AnalysisStatus = 'available' | 'insufficient_data';

/** Deterministic confidence grade derived purely from sample size. */
export type Confidence = 'low' | 'moderate' | 'strong';

/** Calendar time-of-day buckets (runtime-local hours). */
export type TimeBucket = 'night' | 'morning' | 'afternoon' | 'evening';

/**
 * Evidence attached to every surfaced observation so the UI can answer
 * "Why am I seeing this?" without exposing raw private content.
 */
export interface PatternEvidence {
  /** Number of reflections that contributed to this observation. */
  sampleSize: number;
  /** Confidence graded deterministically from the sample size. */
  confidence: Confidence;
  /** Plain-language explanation of the deterministic analysis. */
  explanation: string;
  /** Optional numeric breakdown (counts/aggregates only — never raw text). */
  breakdown?: Record<string, number>;
  /** Analyzed period start (ISO date, e.g. 2026-09-01). */
  periodStart?: string;
  /** Analyzed period end (ISO date). */
  periodEnd?: string;
}

/**
 * A privacy-safe, minimal entry shape accepted by the analysis modules.
 * Structurally compatible with journal entries returned by the backend.
 */
export interface AnalyzableEntry {
  id: string;
  content?: string;
  moodRating?: number;
  tags?: string[];
  createdAt?: any;
  location?: {
    latitude?: number;
    longitude?: number;
    label?: string;
  } | null;
}

/** Round to 2 decimals (deterministic, avoids float noise in output). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}