/**
 * Location Pattern Awareness (deterministic, strictly optional).
 *
 * Analyzes ONLY location information the user already stored with their
 * journal entries (Phase 9). Never collects, requests, or tracks location.
 * Coordinates are used only for counting; they are never exposed in
 * observations and never leave the analysis layer.
 */

import { toMillis, formatPeriodDate } from './time';
import { createEvidence } from './evidence';
import type { AnalyzableEntry, AnalysisStatus, PatternEvidence } from './types';

export interface RecurringLabel {
  label: string;
  count: number;
}

export interface LocationPatternsResult {
  status: AnalysisStatus;
  locatedSampleSize: number;
  distinctLabels: number;
  recurringLabels: RecurringLabel[];
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum number of location-tagged entries required to surface anything. */
export const LOCATION_PATTERNS_MIN_ENTRIES = 4;

/** Minimum count of a shared label before it counts as "recurring". */
export const RECURRING_LABEL_MIN_COUNT = 2;

function hasLocationData(entry: AnalyzableEntry): boolean {
  const loc = entry?.location;
  if (!loc) return false;
  if (typeof loc.label === 'string' && loc.label.trim().length > 0) return true;
  return typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
}

export function analyzeLocationPatterns(entries: AnalyzableEntry[]): LocationPatternsResult {
  const located = (entries || []).filter(hasLocationData);

  if (located.length < LOCATION_PATTERNS_MIN_ENTRIES) {
    return {
      status: 'insufficient_data',
      locatedSampleSize: located.length,
      distinctLabels: 0,
      recurringLabels: [],
      observation: null,
      evidence: null,
    };
  }

  // Group strictly by the human-readable label. Coordinates are never
  // used to group/cluster, so no location precision is ever exposed.
  const labelInfo: Record<string, { count: number; display: string }> = {};
  for (const entry of located) {
    const rawLabel = entry.location?.label;
    if (typeof rawLabel === 'string' && rawLabel.trim().length > 0) {
      const normalized = rawLabel.trim().toLowerCase();
      const current = labelInfo[normalized];
      if (current) {
        current.count += 1;
      } else {
        labelInfo[normalized] = { count: 1, display: rawLabel.trim() };
      }
    }
  }

  const distinctLabels = Object.keys(labelInfo).length;
  const recurringLabels: RecurringLabel[] = Object.values(labelInfo)
    .filter((info) => info.count >= RECURRING_LABEL_MIN_COUNT)
    .map((info) => ({ label: info.display, count: info.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  let observation: string | null = null;
  if (recurringLabels.length > 0) {
    const top = recurringLabels[0];
    observation = `Several reflections were written from the same place — ${top.label}.`;
  } else if (distinctLabels >= 2) {
    observation = `Your reflections were written from ${distinctLabels} distinct places during this period.`;
  }

  if (!observation) {
    return {
      status: 'insufficient_data',
      locatedSampleSize: located.length,
      distinctLabels,
      recurringLabels,
      observation: null,
      evidence: null,
    };
  }

  const periodStart = Math.min(...located.map((e) => toMillis(e.createdAt) || Number.MAX_SAFE_INTEGER));
  const periodEnd = Math.max(...located.map((e) => toMillis(e.createdAt)));

  const evidence = createEvidence({
    sampleSize: located.length,
    explanation:
      'Only locations you already stored with your entries were used. Nothing is collected automatically and coordinates never appear in any observation.',
    breakdown: { locatedEntries: located.length, distinctLabels },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    locatedSampleSize: located.length,
    distinctLabels,
    recurringLabels,
    observation,
    evidence,
  };
}