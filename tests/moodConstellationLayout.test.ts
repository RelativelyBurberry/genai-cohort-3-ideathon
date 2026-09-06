import { describe, it, expect } from 'vitest';
import {
  buildConstellation,
  filterEntriesByRange,
  layoutPoints,
  buildConnections,
  stableHash,
  clampMood,
  moodLane,
  computeRadius,
  CONSTELLATION_MOOD_COLORS,
} from '../src/intelligence/moodConstellation/constellationLayout.js';
import type { ConstellationEntry } from '../src/intelligence/moodConstellation/constellationLayout.js';

/**
 * Phase 21 — Mood Constellation deterministic layout tests.
 *
 * The layout pipeline must be fully deterministic: the same input set
 * always produces the same view model, with no Math.random anywhere.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function entry(
  id: string,
  daysAgo: number,
  opts: { mood?: number; tags?: string[]; wordCount?: number } = {}
): ConstellationEntry {
  return {
    id,
    createdAt: Date.now() - daysAgo * DAY_MS,
    moodRating: opts.mood,
    tags: opts.tags,
    wordCount: opts.wordCount,
  };
}

describe('mood mapping', () => {
  it('clamps mood values into the canonical 1..5 range', () => {
    expect(clampMood(1)).toBe(1);
    expect(clampMood(5)).toBe(5);
    expect(clampMood(3)).toBe(3);
    expect(clampMood(7)).toBe(5);
    expect(clampMood(-2)).toBe(1);
    expect(clampMood(undefined)).toBe(3);
    expect(clampMood(null)).toBe(3);
    expect(clampMood(NaN)).toBe(3);
  });

  it('maps Radiant (5) to the top lane and Heavy (1) to the bottom lane', () => {
    expect(moodLane(5)).toBe(0);
    expect(moodLane(4)).toBe(1);
    expect(moodLane(3)).toBe(2);
    expect(moodLane(2)).toBe(3);
    expect(moodLane(1)).toBe(4);
  });

  it('sizes stars deterministically from wordCount with clamped bounds', () => {
    expect(computeRadius(undefined)).toBe(computeRadius(undefined));
    expect(computeRadius(1000000)).toBeLessThanOrEqual(12);
    expect(computeRadius(1)).toBeGreaterThanOrEqual(4.5);
    expect(computeRadius(500)).toBeGreaterThan(computeRadius(10));
  });

  it('assigns a color for every canonical mood rating', () => {
    expect(Object.keys(CONSTELLATION_MOOD_COLORS).length).toBe(5);
  });
});

describe('stableHash', () => {
  it('is deterministic across calls', () => {
    expect(stableHash('demo-entry-1')).toBe(stableHash('demo-entry-1'));
  });

  it('varies across ids (jitter spreads overlapping points)', () => {
    expect(stableHash('a')).not.toBe(stableHash('b'));
  });
});

describe('x-position is chronological', () => {
  it('places older entries to the left of newer entries', () => {
    const entries = [
      entry('old', 30, { mood: 3 }),
      entry('mid', 15, { mood: 3 }),
      entry('new', 1, { mood: 3 }),
    ];
    const points = layoutPoints(filterEntriesByRange(entries, 'All time'));
    expect(points[0].x).toBeLessThan(points[1].x);
    expect(points[1].x).toBeLessThan(points[2].x);
  });

  it('keeps identical timestamps laid out without NaN (span never zero)', () => {
    const entries = [
      entry('same-a', 5, { mood: 2 }),
      entry('same-b', 5, { mood: 4 }),
    ];
    entries[0].createdAt = entries[1].createdAt;
    const vm = buildConstellation(entries, 'All time');
    expect(vm.points.length).toBe(2);
    expect(vm.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('y-position follows the mood band', () => {
  it('positions Radiant (5) above Heavy (1)', () => {
    const points = layoutPoints(
      filterEntriesByRange(
        [entry('low', 3, { mood: 1 }), entry('high', 2, { mood: 5 })],
        'All time'
      )
    );
    const high = points.find((p) => p.entryId === 'high')!;
    const low = points.find((p) => p.entryId === 'low')!;
    expect(high.y).toBeLessThan(low.y);
  });
});

describe('same input produces the same constellation', () => {
  it('is bit-identical across two builds', () => {
    const entries = [
      entry('a', 20, { mood: 4, tags: ['work', 'rest'], wordCount: 300 }),
      entry('b', 12, { mood: 2, tags: ['work'], wordCount: 90 }),
      entry('c', 6, { mood: 5, tags: ['rest'], wordCount: 700 }),
      entry('d', 2, { mood: 3, tags: [], wordCount: 150 }),
    ];
    const first = buildConstellation(entries, 'All time');
    const second = buildConstellation(entries, 'All time');
    expect(second).toEqual(first);
  });

  it('does not use random jitter (same id → same offset)', () => {
    const one = layoutPoints([entry('stable-id', 4, { mood: 3 })]);
    const two = layoutPoints([entry('stable-id', 4, { mood: 3 })]);
    expect(one[0].y).toBe(two[0].y);
  });
});

describe('shared tags produce bounded deterministic connections', () => {
  it('connects a 5-entry chain as 4 adjacent edges (not a clique)', () => {
    const entries = [
      entry('e1', 10, { tags: ['work'] }),
      entry('e2', 8, { tags: ['work'] }),
      entry('e3', 6, { tags: ['work'] }),
      entry('e4', 4, { tags: ['work'] }),
      entry('e5', 2, { tags: ['work'] }),
    ];
    const vm = buildConstellation(entries, 'All time');
    expect(vm.connections.length).toBe(4);
  });

  it('leaves isolated stars unconnected', () => {
    const entries = [
      entry('solo', 5, { tags: ['unique'] }),
      entry('other', 3, { tags: ['distinct'] }),
    ];
    const vm = buildConstellation(entries, 'All time');
    expect(vm.connections.length).toBe(0);
    expect(vm.connectedCounts['solo'] ?? 0).toBe(0);
  });

  it('deduplicates edges across multiple shared tags but weights them', () => {
    const entries = [
      entry('x', 6, { tags: ['work', 'rest'] }),
      entry('y', 4, { tags: ['work', 'rest'] }),
    ];
    const vm = buildConstellation(entries, 'All time');
    expect(vm.connections.length).toBe(1);
    expect(vm.connections[0].weight).toBe(2);
  });

  it('deduplicates tags within a single entry', () => {
    const entries = [
      entry('m', 5, { tags: ['work', 'Work', '#work'] }),
      entry('n', 3, { tags: ['work'] }),
    ];
    const vm = buildConstellation(entries, 'All time');
    expect(vm.connections.length).toBe(1);
    expect(vm.connections[0].weight).toBe(1);
  });

  it('caps excessive connections deterministically', () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      entry(`cap-${i}`, 100 - i, { tags: ['shared'], mood: (i % 5) + 1 })
    );
    const vm = buildConstellation(entries, 'All time');
    // 40 entries in one tag group → at most 39 chain edges.
    expect(vm.connections.length).toBeLessThanOrEqual(40);
    expect(vm.connections.length).toBe(39);
    expect(buildConnections(entries)).toEqual(buildConnections(entries));
  });
});

describe('time range filtering', () => {
  it('filters before layout when a range is applied', () => {
    const entries = [
      entry('ancient', 200, { mood: 3, tags: ['old'] }),
      entry('recent', 1, { mood: 3, tags: ['new'] }),
    ];
    const all = buildConstellation(entries, 'All time');
    const sixMonths = buildConstellation(entries, '6 months');
    const threeMonths = buildConstellation(entries, '3 months');
    expect(all.points.length).toBe(2);
    expect(sixMonths.points.length).toBe(1);
    expect(threeMonths.points.length).toBe(1);
  });
});

describe('empty and sparse inputs do not crash', () => {
  it('handles an empty entry list', () => {
    const vm = buildConstellation([], 'All time');
    expect(vm.points).toEqual([]);
    expect(vm.connections).toEqual([]);
    expect(vm.connectedCounts).toEqual({});
  });

  it('handles a single entry', () => {
    const vm = buildConstellation([entry('only', 1, { mood: 4, tags: ['solo'] })], 'All time');
    expect(vm.points.length).toBe(1);
    expect(vm.connections.length).toBe(0);
  });

  it('handles missing mood, tags, wordCount, and createdAt', () => {
    const entries = [
      { id: 'bare', createdAt: undefined, moodRating: undefined, tags: undefined, wordCount: undefined },
      { id: 'bare-2', createdAt: null, moodRating: null, tags: null, wordCount: null },
    ] as unknown as ConstellationEntry[];
    const vm = buildConstellation(entries, 'All time');
    expect(vm.points.length).toBe(2);
    expect(vm.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(vm.points.every((p) => p.mood === 3)).toBe(true);
  });
});