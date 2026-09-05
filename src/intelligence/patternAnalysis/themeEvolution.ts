/**
 * Theme Evolution (deterministic).
 *
 * Examines how recurring tags have shifted between the earlier and later
 * halves of the analyzed period. Only surfaces evolution when there is
 * sufficient evidence — never from tiny datasets.
 */

import { toMillis, sortByTime, formatPeriodDate } from './time';
import { createEvidence } from './evidence';
import type { AnalyzableEntry, AnalysisStatus, PatternEvidence } from './types';

export interface ThemeEvolutionRow {
  tag: string;
  earlierCount: number;
  recentCount: number;
}

export interface ThemeEvolutionResult {
  status: AnalysisStatus;
  emergingThemes: ThemeEvolutionRow[];
  fadingThemes: ThemeEvolutionRow[];
  increasingThemes: ThemeEvolutionRow[];
  persistentThemes: ThemeEvolutionRow[];
  earlierTotal: number;
  recentTotal: number;
  sampleSize: number;
  observation: string | null;
  evidence: PatternEvidence | null;
}

/** Minimum total normalized tag occurrences required for an evolution claim. */
export const THEME_EVOLUTION_MIN_OCCURRENCES = 8;

/** Minimum recent occurrences for a theme to be called "emerging". */
export const EMERGING_MIN_RECENT_COUNT = 2;

/** Minimum earlier occurrences for a theme to be called "fading". */
export const FADING_MIN_EARLIER_COUNT = 2;

function normalizeTags(entry: AnalyzableEntry): string[] {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw === 'string') {
      const tag = raw.trim().toLowerCase().replace(/^#+/, '');
      if (tag.length > 0) seen.add(tag);
    }
  }
  return [...seen];
}

export function analyzeThemeEvolution(entries: AnalyzableEntry[]): ThemeEvolutionResult {
  const sorted = sortByTime(
    (entries || []).filter(
      (e) => e && Array.isArray(e.tags) && e.tags.some((t) => typeof t === 'string')
    )
  );

  const midpoint = Math.floor(sorted.length / 2);
  const earlierCounts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};
  let earlierTotal = 0;
  let recentTotal = 0;

  sorted.forEach((entry, idx) => {
    const isRecent = idx >= midpoint;
    const target = isRecent ? recentCounts : earlierCounts;
    for (const tag of normalizeTags(entry)) {
      target[tag] = (target[tag] || 0) + 1;
      if (isRecent) recentTotal += 1;
      else earlierTotal += 1;
    }
  });

  const totalOccurrences = earlierTotal + recentTotal;
  const emptyResult: ThemeEvolutionResult = {
    status: 'insufficient_data',
    emergingThemes: [],
    fadingThemes: [],
    increasingThemes: [],
    persistentThemes: [],
    earlierTotal,
    recentTotal,
    sampleSize: totalOccurrences,
    observation: null,
    evidence: null,
  };

  if (totalOccurrences < THEME_EVOLUTION_MIN_OCCURRENCES || sorted.length < 4) {
    return emptyResult;
  }

  const allTags = new Set([...Object.keys(earlierCounts), ...Object.keys(recentCounts)]);
  const rows: ThemeEvolutionRow[] = [...allTags].map((tag) => ({
    tag,
    earlierCount: earlierCounts[tag] || 0,
    recentCount: recentCounts[tag] || 0,
  }));

  const byRecentDesc = (a: ThemeEvolutionRow, b: ThemeEvolutionRow) =>
    b.recentCount - a.recentCount || a.tag.localeCompare(b.tag);
  const byEarlierDesc = (a: ThemeEvolutionRow, b: ThemeEvolutionRow) =>
    b.earlierCount - a.earlierCount || a.tag.localeCompare(b.tag);
  const byDeltaDesc = (a: ThemeEvolutionRow, b: ThemeEvolutionRow) =>
    b.recentCount - b.earlierCount - (a.recentCount - a.earlierCount) || a.tag.localeCompare(b.tag);
  const byTotalDesc = (a: ThemeEvolutionRow, b: ThemeEvolutionRow) =>
    b.earlierCount + b.recentCount - (a.earlierCount + a.recentCount) || a.tag.localeCompare(b.tag);

  const emergingThemes = rows
    .filter((r) => r.earlierCount === 0 && r.recentCount >= EMERGING_MIN_RECENT_COUNT)
    .sort(byRecentDesc);
  const fadingThemes = rows
    .filter((r) => r.recentCount === 0 && r.earlierCount >= FADING_MIN_EARLIER_COUNT)
    .sort(byEarlierDesc);
  const increasingThemes = rows
    .filter((r) => r.earlierCount >= 1 && r.recentCount > r.earlierCount)
    .sort(byDeltaDesc);
  const persistentThemes = rows
    .filter((r) => r.earlierCount >= 1 && r.recentCount >= 1)
    .sort(byTotalDesc);

  let observation: string | null = null;
  if (emergingThemes.length > 0) {
    observation = `#${emergingThemes[0].tag} appears more frequently in your recent reflections.`;
  } else if (increasingThemes.length > 0) {
    observation = `#${increasingThemes[0].tag} has appeared more often in your recent reflections than earlier in the period.`;
  } else if (persistentThemes.length > 0) {
    const tags = persistentThemes.slice(0, 3).map((r) => `#${r.tag}`).join(', ');
    observation = `Some themes have stayed with you across the period — ${tags}.`;
  }

  const periodStart = toMillis(sorted[0].createdAt);
  const periodEnd = toMillis(sorted[sorted.length - 1].createdAt);

  const evidence = createEvidence({
    sampleSize: totalOccurrences,
    explanation:
      'Reflection tags were compared between the earlier and later halves of the analyzed period. Only recurring use across multiple entries was considered.',
    breakdown: { earlierTotal, recentTotal },
    periodStart: formatPeriodDate(periodStart) || undefined,
    periodEnd: formatPeriodDate(periodEnd) || undefined,
  });

  return {
    status: 'available',
    emergingThemes,
    fadingThemes,
    increasingThemes,
    persistentThemes,
    earlierTotal,
    recentTotal,
    sampleSize: totalOccurrences,
    observation,
    evidence,
  };
}