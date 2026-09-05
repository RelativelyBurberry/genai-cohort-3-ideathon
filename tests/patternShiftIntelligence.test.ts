import { describe, it, expect } from 'vitest';
import {
  analyzeMoodTrajectory,
  analyzeReflectionRhythm,
  analyzeReflectionFrequency,
  analyzeThemeEvolution,
  analyzeUnusualTiming,
  analyzeLocationPatterns,
  analyzePatternIntelligence,
  gradeConfidence,
  getTimeBucket,
  TIME_BUCKET_DISPLAY,
} from '../src/intelligence/patternAnalysis/index.js';
import type { AnalyzableEntry, TimeBucket } from '../src/intelligence/patternAnalysis/index.js';

/**
 * Deterministic phase-10 intelligence module tests.
 *
 * Timestamps use LOCAL-time date constructors so `getHours()` bucket
 * classification is stable on any machine/timezone.
 */
function at(
  epochLocal: [number, number, number, number, number],
  opts: { mood?: number; tags?: string[]; label?: string } = {}
): AnalyzableEntry {
  const d = new Date(epochLocal[0], epochLocal[1] - 1, epochLocal[2], epochLocal[3], epochLocal[4]);
  return {
    id: `e-${epochLocal.join('-')}`,
    content: 'A reflective entry.',
    moodRating: opts.mood,
    tags: opts.tags || [],
    createdAt: d.getTime(),
    location: opts.label ? { latitude: 0, longitude: 0, label: opts.label } : null,
  };
}

describe('getTimeBucket (time-of-day classification)', () => {
  it('classifies each calendar bucket deterministically', () => {
    expect(getTimeBucket(new Date(2026, 0, 1, 3, 0).getTime())).toBe('night');
    expect(getTimeBucket(new Date(2026, 0, 1, 9, 0).getTime())).toBe('morning');
    expect(getTimeBucket(new Date(2026, 0, 1, 15, 0).getTime())).toBe('afternoon');
    expect(getTimeBucket(new Date(2026, 0, 1, 21, 0).getTime())).toBe('evening');
    expect(getTimeBucket(0)).toBeNull();
  });
});

describe('analyzeMoodTrajectory', () => {
  it('detects an upward trajectory from early vs recent averages', () => {
    const entries = [
      at([2026, 8, 31, 7, 30], { mood: 2 }),
      at([2026, 9, 5, 15, 10], { mood: 2 }),
      at([2026, 9, 6, 18, 45], { mood: 5 }),
      at([2026, 9, 9, 19, 10], { mood: 4 }),
      at([2026, 9, 11, 1, 20], { mood: 4 }),
      at([2026, 9, 12, 22, 30], { mood: 3 }),
      at([2026, 9, 13, 21, 15], { mood: 4 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('available');
    expect(r.trajectory).toBe('upward');
    expect(r.earlyAverageMood).toBe(3.0);
    expect(r.recentAverageMood).toBe(3.75);
    expect(r.sampleSize).toBe(7);
    expect(r.observation).toContain('higher mood ratings');
  });

  it('detects a downward trajectory', () => {
    const entries = [
      at([2026, 9, 1, 9, 0], { mood: 4 }),
      at([2026, 9, 2, 9, 0], { mood: 4 }),
      at([2026, 9, 3, 9, 0], { mood: 3 }),
      at([2026, 9, 4, 9, 0], { mood: 2 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('available');
    expect(r.trajectory).toBe('downward');
  });

  it('detects a stable trajectory within the delta threshold', () => {
    const entries = [
      at([2026, 9, 1, 9, 0], { mood: 3 }),
      at([2026, 9, 2, 9, 0], { mood: 4 }),
      at([2026, 9, 3, 9, 0], { mood: 3 }),
      at([2026, 9, 4, 9, 0], { mood: 4 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('available');
    expect(r.trajectory).toBe('stable');
  });

  it('does NOT equalize first and last: middle variation keeps it stable/honest', () => {
    // First and last are both 5; if we naively compared first vs last
    // we would (wrongly) claim a stable/positive message. The early-vs-
    // recent split sees the dip and stays observational.
    const entries = [
      at([2026, 9, 1, 9, 0], { mood: 5 }),
      at([2026, 9, 2, 9, 0], { mood: 1 }),
      at([2026, 9, 3, 9, 0], { mood: 1 }),
      at([2026, 9, 4, 9, 0], { mood: 5 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    // early avg (5+1)/2 = 3, recent avg (1+5)/2 = 3 -> stable (or, if
    // variability dominated, high_variability). It must NOT be upward.
    expect(['stable', 'high_variability']).toContain(r.trajectory);
  });

  it('reports high variability when ratings swing widely', () => {
    const entries = [
      at([2026, 9, 1, 9, 0], { mood: 1 }),
      at([2026, 9, 2, 9, 0], { mood: 5 }),
      at([2026, 9, 3, 9, 0], { mood: 1 }),
      at([2026, 9, 4, 9, 0], { mood: 5 }),
      at([2026, 9, 5, 9, 0], { mood: 5 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('available');
    expect(r.trajectory).toBe('high_variability');
    expect(r.highVariability).toBe(true);
    expect(r.observation).toContain('swings');
  });

  it('returns insufficient_data below the minimum and never invents an observation', () => {
    const entries = [
      at([2026, 9, 1, 9, 0], { mood: 3 }),
      at([2026, 9, 2, 9, 0], { mood: 4 }),
      at([2026, 9, 3, 9, 0], { mood: 3 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('insufficient_data');
    expect(r.trajectory).toBe('insufficient_data');
    expect(r.observation).toBeNull();
    expect(r.evidence).toBeNull();
  });

  it('attaches non-clinical evidence with a numeric breakdown', () => {
    const entries = [
      at([2026, 9, 6, 9, 0], { mood: 2 }),
      at([2026, 9, 4, 9, 0], { mood: 3 }),
      at([2026, 9, 2, 9, 0], { mood: 4 }),
      at([2026, 9, 1, 9, 0], { mood: 5 }),
    ];
    const r = analyzeMoodTrajectory(entries);
    expect(r.status).toBe('available');
    expect(r.evidence).not.toBeNull();
    expect(r.evidence!.sampleSize).toBe(4);
    expect(r.evidence!.confidence).toBe('low');
    expect(r.evidence!.explanation.length).toBeGreaterThan(10);
    expect(r.evidence!.breakdown).toHaveProperty('earlierAverageMood');
    expect(r.evidence!.periodStart).toBeTruthy();
  });
});

describe('analyzeReflectionRhythm', () => {
  function item(epochLocal: [number, number, number, number, number], id: string) {
    const d = new Date(epochLocal[0], epochLocal[1] - 1, epochLocal[2], epochLocal[3], epochLocal[4]);
    return { id, createdAt: d.getTime() };
  }

  it('detects an evening-dominant writing rhythm', () => {
    const items = [
      item([2026, 9, 10, 21, 15], 'a'),
      item([2026, 9, 9, 22, 30], 'b'),
      item([2026, 9, 8, 1, 20], 'c'),
      item([2026, 9, 7, 19, 10], 'd'),
      item([2026, 9, 6, 18, 45], 'e'),
    ];
    const r = analyzeReflectionRhythm(items);
    expect(r.status).toBe('available');
    expect(r.dominantBucket).toBe('evening');
    expect(r.dominantCount).toBe(4);
    expect(r.balanced).toBe(false);
    expect(r.buckets).toEqual({ night: 1, morning: 0, afternoon: 0, evening: 4 });
    expect(r.observation).toContain(TIME_BUCKET_DISPLAY.evening);
  });

  it('detects balanced timing when reflections spread across the day', () => {
    const items = [
      item([2026, 9, 10, 7, 0], 'a'),
      item([2026, 9, 9, 13, 0], 'b'),
      item([2026, 9, 8, 19, 0], 'c'),
      item([2026, 9, 7, 22, 0], 'd'),
      item([2026, 9, 6, 9, 0], 'e'),
    ];
    const r = analyzeReflectionRhythm(items);
    expect(r.status).toBe('available');
    expect(r.balanced).toBe(true);
    expect(r.observation).toContain('spread fairly evenly');
  });

  it('returns insufficient_data with fewer than 4 reflections', () => {
    const items = [
      item([2026, 9, 10, 21, 0], 'a'),
      item([2026, 9, 9, 22, 0], 'b'),
      item([2026, 9, 8, 7, 0], 'c'),
    ];
    const r = analyzeReflectionRhythm(items);
    expect(r.status).toBe('insufficient_data');
    expect(r.dominantBucket).toBeNull();
    expect(r.observation).toBeNull();
  });
});

describe('analyzeReflectionFrequency', () => {
  function item(days: number[], id: string) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(10, 0, 0, 0);
    return { id, createdAt: d.getTime() };
  }

  it('detects increasing activity (recent clusters, longer earlier pauses)', () => {
    const items = [
      item([13], 'a'),
      item([7], 'b'),
      item([6], 'c'),
      item([4], 'd'),
      item([2], 'e'),
      item([1], 'f'),
      item([0], 'g'),
    ];
    const r = analyzeReflectionFrequency(items);
    expect(r.status).toBe('available');
    expect(r.cadence).toBe('increasing');
    expect(r.recentAvgGapDays).toBeLessThan(r.earlyAvgGapDays!);
    expect(r.observation).toContain('closer clusters');
  });

  it('detects decreasing activity', () => {
    const items = [
      item([26], 'a'),
      item([24], 'b'),
      item([22], 'c'),
      item([20], 'd'),
      item([12], 'e'),
      item([5], 'f'),
      item([0], 'g'),
    ];
    const r = analyzeReflectionFrequency(items);
    expect(r.status).toBe('available');
    expect(r.cadence).toBe('decreasing');
  });

  it('detects a consistent rhythm', () => {
    const items = [
      item([0], 'a'),
      item([2], 'b'),
      item([4], 'c'),
      item([6], 'd'),
      item([8], 'e'),
      item([10], 'f'),
      item([12], 'g'),
    ];
    const r = analyzeReflectionFrequency(items);
    expect(r.status).toBe('available');
    expect(r.cadence).toBe('consistent');
  });

  it('detects an irregular rhythm (clustered with pauses)', () => {
    const items = [
      item([0], 'a'),
      item([1], 'b'),
      item([2], 'c'),
      item([30], 'd'),
      item([31], 'e'),
      item([32], 'f'),
      item([60], 'g'),
    ];
    const r = analyzeReflectionFrequency(items);
    expect(r.status).toBe('available');
    expect(r.cadence).toBe('irregular');
    expect(r.observation).toContain('pauses');
  });

  it('never gamifies and returns insufficient below the minimum', () => {
    const items = [item([0], 'a'), item([2], 'b'), item([4], 'c')];
    const r = analyzeReflectionFrequency(items);
    expect(r.status).toBe('insufficient_data');
    expect(r.observation).toBeNull();
    expect(r.observation ?? '').not.toContain('streak');
  });
});

describe('analyzeThemeEvolution', () => {
  it('detects an emerging theme in recent reflections', () => {
    const entries = [
      at([2026, 8, 30, 7, 30], { tags: ['self-awareness', 'patterns'] }),
      at([2026, 9, 5, 15, 10], { tags: ['stress', 'coping'] }),
      at([2026, 9, 6, 18, 45], { tags: ['evening', 'mindfulness', 'peace'] }),
      at([2026, 9, 9, 19, 10], { tags: ['gratitude', 'small-moments', 'wellbeing'] }),
      at([2026, 9, 11, 1, 20], { tags: ['boundaries', 'courage', 'self-compassion'] }),
      at([2026, 9, 12, 22, 30], { tags: ['work', 'boundaries', 'stress'] }),
      at([2026, 9, 13, 21, 15], { tags: ['mindfulness', 'gratitude', 'evening'] }),
    ];
    const r = analyzeThemeEvolution(entries);
    expect(r.status).toBe('available');
    expect(r.emergingThemes.length).toBeGreaterThan(0);
    const top = r.emergingThemes[0];
    expect(top.tag).toBe('boundaries');
    expect(top.earlierCount).toBe(0);
    expect(top.recentCount).toBe(2);
    expect(r.observation).toContain('#boundaries');
  });

  it('surfaces persistent themes when nothing is emerging', () => {
    const entries = [
      at([2026, 9, 4, 9, 0], { tags: ['work', 'family', 'rest'] }),
      at([2026, 9, 3, 9, 0], { tags: ['work', 'family', 'gratitude'] }),
      at([2026, 9, 2, 9, 0], { tags: ['work', 'family', 'rest'] }),
      at([2026, 9, 1, 9, 0], { tags: ['work', 'family', 'gratitude'] }),
    ];
    const r = analyzeThemeEvolution(entries);
    expect(r.status).toBe('available');
    expect(r.emergingThemes.length).toBe(0);
    expect(r.persistentThemes.some((t) => t.tag === 'work')).toBe(true);
    expect(r.observation).toContain('stayed with you');
  });

  it('returns insufficient_data from tiny datasets without inventing evolution', () => {
    const entries = [
      at([2026, 9, 3, 9, 0], { tags: ['work'] }),
      at([2026, 9, 2, 9, 0], { tags: ['work'] }),
      at([2026, 9, 1, 9, 0], { tags: ['work'] }),
    ];
    const r = analyzeThemeEvolution(entries);
    expect(r.status).toBe('insufficient_data');
    expect(r.observation).toBeNull();
  });
});

describe('analyzeUnusualTiming', () => {
  function item(epochLocal: [number, number, number, number, number], id: string) {
    const d = new Date(epochLocal[0], epochLocal[1] - 1, epochLocal[2], epochLocal[3], epochLocal[4]);
    return { id, createdAt: d.getTime() };
  }

  it('flags a recent reflection outside the established rhythm', () => {
    const items = [
      item([2026, 9, 20, 21, 0], 'a'),
      item([2026, 9, 19, 20, 0], 'b'),
      item([2026, 9, 18, 22, 0], 'c'),
      item([2026, 9, 16, 19, 0], 'd'),
      item([2026, 9, 14, 21, 0], 'e'),
      item([2026, 9, 12, 20, 0], 'f'),
      item([2026, 9, 10, 21, 0], 'g'),
      item([2026, 9, 21, 3, 0], 'h'), // most recent & unusual (3am, night vs evening baseline)
    ];
    const r = analyzeUnusualTiming(items);
    expect(r.status).toBe('available');
    expect(r.typicalBucket).toBe('evening');
    expect(r.flaggedCount).toBeGreaterThanOrEqual(1);
    expect(r.observation).toContain('outside your usual writing rhythm');
  });

  it('surfaces nothing when recent reflections match the typical rhythm', () => {
    const allEvening = [21, 20, 22, 19, 21, 20, 21].map((h, i) =>
      item([2026, 9, 20 - i, h, 0], `e${i}`)
    );
    const r = analyzeUnusualTiming(allEvening);
    expect(r.status).toBe('insufficient_data');
    expect(r.flaggedCount).toBe(0);
    expect(r.observation).toBeNull();
  });

  it('requires an established baseline before anything is unusual', () => {
    const items = [
      item([2026, 9, 10, 21, 0], 'a'),
      item([2026, 9, 9, 9, 0], 'b'),
      item([2026, 9, 8, 15, 0], 'c'),
      item([2026, 9, 7, 7, 0], 'd'),
    ];
    const r = analyzeUnusualTiming(items);
    expect(r.status).toBe('insufficient_data');
    expect(r.observation).toBeNull();
  });
});

describe('analyzeLocationPatterns', () => {
  it('detects recurring labeled places without exposing coordinates', () => {
    const entries = [
      at([2026, 9, 20, 10, 0], { label: 'Brooklyn, New York' }),
      at([2026, 9, 18, 10, 0], { label: 'Brooklyn, New York' }),
      at([2026, 9, 15, 10, 0], { label: 'London, United Kingdom' }),
      at([2026, 9, 10, 10, 0], { label: 'Paris, France' }),
    ];
    const r = analyzeLocationPatterns(entries);
    expect(r.status).toBe('available');
    expect(r.locatedSampleSize).toBe(4);
    expect(r.distinctLabels).toBe(3);
    expect(r.recurringLabels[0].label).toBe('Brooklyn, New York');
    expect(r.recurringLabels[0].count).toBe(2);
    expect(r.observation).toContain('Brooklyn, New York');
    // Privacy: raw coordinates must never appear in the observation.
    expect(JSON.stringify(r)).not.toMatch(/latitude|longitude|40\.7|-74\./);
  });

  it('returns insufficient_data when fewer than 4 entries carry locations', () => {
    const entries = [
      at([2026, 9, 20, 10, 0], { label: 'Brooklyn, New York' }),
      at([2026, 9, 18, 10, 0], { label: 'Brooklyn, New York' }),
      at([2026, 9, 15, 10, 0], { label: 'London, United Kingdom' }),
    ];
    const r = analyzeLocationPatterns(entries);
    expect(r.status).toBe('insufficient_data');
    expect(r.observation).toBeNull();
  });
});

describe('gradeConfidence (evidence)', () => {
  it('grades deterministically from sample size', () => {
    expect(gradeConfidence(2)).toBe('low');
    expect(gradeConfidence(4)).toBe('low');
    expect(gradeConfidence(5)).toBe('moderate');
    expect(gradeConfidence(7)).toBe('moderate');
    expect(gradeConfidence(8)).toBe('strong');
    expect(gradeConfidence(40)).toBe('strong');
  });
});

describe('analyzePatternIntelligence (aggregate)', () => {
  it('returns all six modules with per-module statuses', () => {
    const entries = [
      at([2026, 8, 30, 7, 30], { mood: 2, tags: ['self-awareness', 'patterns'], label: 'Paris, France' }),
      at([2026, 9, 5, 15, 0], { mood: 2, tags: ['stress', 'coping'] }),
      at([2026, 9, 6, 18, 50], { mood: 5, tags: ['evening', 'mindfulness', 'peace'], label: 'London, United Kingdom' }),
      at([2026, 9, 10, 19, 15], { mood: 4, tags: ['gratitude', 'small-moments', 'wellbeing'], label: 'Brooklyn, New York' }),
      at([2026, 9, 12, 1, 30], { mood: 4, tags: ['boundaries', 'courage', 'self-compassion'] }),
      at([2026, 9, 12, 22, 30], { mood: 3, tags: ['work', 'boundaries', 'stress'] }),
      at([2026, 9, 13, 21, 15], { mood: 4, tags: ['mindfulness', 'gratitude', 'evening'], label: 'Brooklyn, New York' }),
    ];
    const convs = [
      { id: 'c1', createdAt: new Date(2026, 8, 10, 18, 40).getTime() },
      { id: 'c2', createdAt: new Date(2026, 8, 11, 20, 0).getTime() },
    ];

    const r = analyzePatternIntelligence(entries, convs);
    expect(r.moodTrajectory.status).toBe('available');
    expect(r.moodTrajectory.trajectory).toBe('upward');
    expect(r.reflectionRhythm.status).toBe('available');
    expect(r.reflectionRhythm.dominantBucket).toBe('evening');
    expect(r.reflectionFrequency.status).toBe('available');
    expect(r.themeEvolution.status).toBe('available');
    expect(r.unusualTiming.status).toBe('available');
    expect(r.locationPatterns.status).toBe('available');
  });
});

describe('insufficient data is handled honestly across the board', () => {
  it('surfaces no observations when only a single entry exists', () => {
    const entries = [at([2026, 9, 10, 21, 0], { mood: 4, tags: ['work'] })];
    const r = analyzePatternIntelligence(entries, []);
    for (const key of [
      'moodTrajectory',
      'reflectionRhythm',
      'reflectionFrequency',
      'themeEvolution',
      'unusualTiming',
      'locationPatterns',
    ] as const) {
      expect(r[key].status).toBe('insufficient_data');
      expect(r[key].observation).toBeNull();
    }
  });
});