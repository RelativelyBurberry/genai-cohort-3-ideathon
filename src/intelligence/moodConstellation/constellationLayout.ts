/**
 * Phase 21 — Mood Constellation: deterministic constellation layout engine.
 *
 * Pure, framework-independent functions following the existing PatternShift
 * intelligence-module convention (`src/intelligence/patternAnalysis`).
 * Given the same journal entries the same constellation view model is always
 * produced — there is deliberately NO `Math.random()` anywhere.
 *
 * PRIVACY: this module only ever reads safe metadata (id, createdAt,
 * moodRating, tags, wordCount). It never receives article content, titles,
 * or location data, so nothing here can leak them into layout output.
 */

import { toMillis } from '../patternAnalysis';

export type MoodRating = 1 | 2 | 3 | 4 | 5;

/**
 * Minimal, privacy-safe entry shape consumed by the layout engine.
 * Structurally compatible with the existing `JournalEntry` type — only the
 * five safe fields are projected through this boundary.
 */
export interface ConstellationEntry {
  id: string;
  createdAt: any; // Firestore Timestamp | number | string | Date
  moodRating?: number;
  tags?: string[];
  wordCount?: number;
}

export type ConstellationRange = 'All time' | '6 months' | '3 months';

export interface ConstellationPoint {
  entryId: string;
  mood: MoodRating;
  /** Absolute X in the 1200×650 stage (chronological, left → right). */
  x: number;
  /** Absolute Y in the 1200×650 stage (mood lane + deterministic jitter). */
  y: number;
  /** Radius derived from wordCount (clamped). */
  radius: number;
  /** Muted constellation palette color for the star. */
  color: string;
  /** Epoch millis from the source createdAt (safe metadata). */
  timestamp: number;
  /** Number of normalized tags (safe metadata). */
  tagCount: number;
}

export interface ConstellationConnection {
  sourceId: string;
  targetId: string;
  /** Number of shared normalized tags (drives line weight). */
  weight: number;
}

export interface ConstellationViewModel {
  points: ConstellationPoint[];
  connections: ConstellationConnection[];
  /** entryId → number of connected neighbors (safe derived metadata). */
  connectedCounts: Record<string, number>;
}

export const CONSTELLATION_RANGE_OPTIONS: ConstellationRange[] = [
  'All time',
  '6 months',
  '3 months',
];

export const CONSTELLATION_MOOD_COLORS: Record<MoodRating, string> = {
  1: '#77718c', // Heavy    — muted mauve
  2: '#8ea8b5', // Low      — muted slate blue
  3: '#8aa69b', // Grounded — muted sage
  4: '#c6a56e', // Uplifted — muted clay gold
  5: '#d6a56d', // Radiant  — muted sand amber
};

/** Stage geometry (preserved from the v0 reference). */
export const CONSTELLATION_VIEW_WIDTH = 1200;
export const CONSTELLATION_VIEW_HEIGHT = 650;
const PAD_X = 92;
const SPAN_X = 1016;
const BASE_Y = 128;
const LANE_STEP = 88;
const JITTER_AMPLITUDE = 1.25;
const JITTER_MOD = 31;
const DEFAULT_WORD_COUNT = 120;
const MIN_RADIUS = 4.5;
const MAX_RADIUS = 12;
const RANGE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EDGES_BASE = 24;
const MAX_EDGES_PER_ENTRY = 4;
const MAX_EDGES_ABSOLUTE = 400;

/** Deterministic string hash — stable across runs and platforms. */
export function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Clamp any value into the canonical 1..5 mood range (missing → Grounded). */
export function clampMood(value: number | undefined | null): MoodRating {
  if (typeof value !== 'number' || Number.isNaN(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value))) as MoodRating;
}

/** Lane index for a mood rating: 5 (Radiant) → top lane (0). */
export function moodLane(mood: MoodRating): number {
  return 5 - mood;
}

/** Star radius derived from wordCount with a log scale and clamped bounds. */
export function computeRadius(wordCount?: number): number {
  const count = typeof wordCount === 'number' && wordCount > 0 ? wordCount : DEFAULT_WORD_COUNT;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, 4 + Math.log10(count + 1) * 2.2));
}

/**
 * Sort entries chronologically (stable by id for identical timestamps) and
 * apply the time-range filter. Filtering happens BEFORE layout so a range
 * change genuinely recomputes the constellation.
 */
export function filterEntriesByRange(
  entries: ConstellationEntry[],
  range: ConstellationRange
): ConstellationEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const diff = toMillis(a.createdAt) - toMillis(b.createdAt);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  if (range === 'All time' || sorted.length === 0) return sorted;

  const months = range === '6 months' ? 6 : 3;
  const latest = toMillis(sorted[sorted.length - 1].createdAt);
  if (!latest) return sorted;
  const cutoff = latest - months * RANGE_MONTH_MS;
  return sorted.filter((entry) => toMillis(entry.createdAt) >= cutoff);
}

/** Deterministic per-entry position on the 1200×650 stage. */
export function layoutPoints(entries: ConstellationEntry[]): ConstellationPoint[] {
  const first = entries.length ? toMillis(entries[0].createdAt) : 0;
  const last = entries.length ? toMillis(entries[entries.length - 1].createdAt) : first + 1;
  const span = Math.max(last - first, 1);

  return entries.map((entry) => {
    const ts = toMillis(entry.createdAt);
    const mood = clampMood(entry.moodRating);
    const baseX = PAD_X + ((ts - first) / span) * SPAN_X;
    // Deterministic id-seeded jitter — never Math.random().
    const jitter = ((stableHash(entry.id) % JITTER_MOD) - 15) * JITTER_AMPLITUDE;
    const y = BASE_Y + moodLane(mood) * LANE_STEP + jitter;
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    return {
      entryId: entry.id,
      mood,
      x: baseX,
      y,
      radius: computeRadius(entry.wordCount),
      color: CONSTELLATION_MOOD_COLORS[mood],
      timestamp: ts,
      tagCount: tags.length,
    };
  });
}

/**
 * Build constellation edges from shared normalized tags.
 *
 * For each tag, members are connected as a chronological chain (adjacent
 * neighbours only — not a social-network clique). Edges are deduplicated
 * across tags, weighted by the number of shared tags, kept in a
 * deterministic order, and capped to avoid pathological line counts.
 * Isolated stars simply get no edges.
 */
export function buildConnections(entries: ConstellationEntry[]): ConstellationConnection[] {
  const tagGroups = new Map<string, Array<{ id: string; ts: number }>>();

  for (const entry of entries) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const seen = new Set<string>();
    for (const raw of tags) {
      if (typeof raw !== 'string') continue;
      const tag = raw.trim().toLowerCase().replace(/^#+/, '');
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      const list = tagGroups.get(tag) ?? [];
      list.push({ id: entry.id, ts: toMillis(entry.createdAt) });
      tagGroups.set(tag, list);
    }
  }

  const result: ConstellationConnection[] = [];
  const index = new Map<string, number>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

  for (const tag of [...tagGroups.keys()].sort()) {
    const group = tagGroups.get(tag)!;
    if (group.length < 2) continue;
    // Chronological chain order (stable by id for identical timestamps).
    group.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)));
    for (let i = 0; i < group.length - 1; i += 1) {
      const fromId = group[i].id;
      const toId = group[i + 1].id;
      const key = edgeKey(fromId, toId);
      const existing = index.get(key);
      if (existing !== undefined) {
        result[existing].weight += 1;
        continue;
      }
      index.set(key, result.length);
      result.push({
        sourceId: fromId < toId ? fromId : toId,
        targetId: fromId < toId ? toId : fromId,
        weight: 1,
      });
    }
  }

  const cap = Math.max(
    MAX_EDGES_BASE,
    Math.min(MAX_EDGES_ABSOLUTE, entries.length * MAX_EDGES_PER_ENTRY)
  );
  if (result.length > cap) {
    result.sort((a, b) =>
      a.sourceId !== b.sourceId
        ? a.sourceId.localeCompare(b.sourceId)
        : a.targetId.localeCompare(b.targetId)
    );
    return result.slice(0, cap);
  }
  return result;
}

/** Full deterministic pipeline: filter → layout → connect. */
export function buildConstellation(
  entries: ConstellationEntry[],
  range: ConstellationRange = 'All time'
): ConstellationViewModel {
  const visible = filterEntriesByRange(entries, range);
  const points = layoutPoints(visible);
  const connections = buildConnections(visible);

  const connectedCounts: Record<string, number> = {};
  for (const conn of connections) {
    connectedCounts[conn.sourceId] = (connectedCounts[conn.sourceId] ?? 0) + 1;
    connectedCounts[conn.targetId] = (connectedCounts[conn.targetId] ?? 0) + 1;
  }

  return { points, connections, connectedCounts };
}