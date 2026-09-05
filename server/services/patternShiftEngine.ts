/**
 * Deterministic PatternShift Engine
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Strictly deterministic, pure mathematical and frequency calculations.
 * 2. Never asks Gemini to compute statistics, counts, or trend math.
 * 3. Enforces Insufficient Data Guard (< 3 meaningful historical items).
 * 4. Bounded, sanitized output structure.
 *
 * Phase 10: extended deterministic intelligence (mood trajectory, timing
 * rhythm, reflection frequency, theme evolution, unusual timing, location
 * patterns) is computed by the pure modules in
 * `src/intelligence/patternAnalysis`. Location data is aggregated into
 * counts/labels only and NEVER leaves the analysis layer or reaches Gemini.
 */

import { analyzePatternIntelligence } from '../../src/intelligence/patternAnalysis/index.js';
import type { PatternIntelligence } from '../../src/intelligence/patternAnalysis/index.js';

export interface RawEntry {
  id: string;
  title?: string;
  content: string;
  moodRating?: number;
  tags?: string[];
  createdAt?: any;
  updatedAt?: any;
  /** Phase 9 optional, user-provided location (never auto-captured). */
  location?: {
    latitude?: number;
    longitude?: number;
    label?: string;
  } | null;
}

export interface RawConversation {
  id: string;
  title?: string;
  summary?: string | null;
  status: 'active' | 'completed';
  createdAt?: any;
  updatedAt?: any;
  summaryUpdatedAt?: any;
}

export interface EngineResult {
  hasSufficientData: boolean;
  requiredCount: number;
  availableCount: number;
  metrics?: {
    entryCount: number;
    completedConversationCount: number;
    totalItems: number;
    timeRange: {
      start: string;
      end: string;
    };
    mood: {
      distribution: Record<number, number>;
      averageMood: number;
      standardDeviation: number;
      trajectory: 'improving' | 'declining' | 'stable' | 'insufficient_data';
      earlierAverageMood: number | null;
      recentAverageMood: number | null;
    };
    tags: {
      tagFrequencies: { tag: string; count: number }[];
      topTags: string[];
      tagMoodAssociations: { tag: string; averageMood: number; count: number }[];
      tagVelocity: { tag: string; earlierCount: number; recentCount: number; trend: 'increasing' | 'decreasing' | 'stable' }[];
    };
    themes: {
      topKeywords: { word: string; count: number }[];
      reflectionThemes: string[];
    };
  };
  /** Phase 10: extended deterministic intelligence (evidence-grounded). */
  intelligence?: PatternIntelligence;
}

const COMMON_STOP_WORDS = new Set([
  'the', 'and', 'to', 'of', 'in', 'is', 'that', 'it', 'on', 'you', 'this', 'for', 'but',
  'with', 'are', 'have', 'be', 'at', 'or', 'as', 'was', 'so', 'if', 'out', 'not', 'my',
  'me', 'we', 'they', 'had', 'he', 'she', 'what', 'when', 'where', 'which', 'who', 'why',
  'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'also', 'about',
  'into', 'then', 'them', 'these', 'their', 'your', 'feel', 'feeling', 'felt', 'day',
  'days', 'today', 'time', 'think', 'thinking', 'thought', 'like', 'get', 'getting',
  'got', 'go', 'going', 'went', 'make', 'making', 'made', 'know', 'see', 'come', 'take',
  'want', 'would', 'could', 'been', 'there', 'from', 'an', 'by', 'up', 'down', 'over'
]);

export function parseDateMillis(timestamp: any): number {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  if (typeof timestamp.toMillis === 'function') {
    return timestamp.toMillis();
  }
  if (typeof timestamp.toDate === 'function') {
    const d = timestamp.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof timestamp._seconds === 'number') {
    return timestamp._seconds * 1000 + Math.floor((timestamp._nanoseconds || 0) / 1000000);
  }
  if (timestamp.seconds !== undefined) {
    const sec = Number(timestamp.seconds) || 0;
    const nanos = Number(timestamp.nanoseconds || timestamp.nanos) || 0;
    return sec * 1000 + Math.floor(nanos / 1000000);
  }
  return 0;
}

/**
 * Deterministically computes longitudinal metrics across entries and completed reflections.
 */
export function computePatternShiftMetrics(
  rawEntries: RawEntry[] = [],
  rawConversations: RawConversation[] = []
): EngineResult {
  // 1. Filter completed conversations with non-empty summaries
  const validConversations = (rawConversations || []).filter(
    (c) => c && c.status === 'completed' && typeof c.summary === 'string' && c.summary.trim().length > 0
  );

  const validEntries = (rawEntries || []).filter(
    (e) => e && typeof e.content === 'string' && e.content.trim().length > 0
  );

  const totalMeaningfulItems = validEntries.length + validConversations.length;

  // 2. Insufficient Data Guard (< 3 meaningful items)
  if (totalMeaningfulItems < 3) {
    return {
      hasSufficientData: false,
      requiredCount: 3,
      availableCount: totalMeaningfulItems,
    };
  }

  // 3. Chronological sorting (oldest to newest)
  const sortedEntries = [...validEntries].sort((a, b) => {
    return parseDateMillis(a.createdAt) - parseDateMillis(b.createdAt);
  });

  const sortedConversations = [...validConversations].sort((a, b) => {
    return parseDateMillis(a.createdAt) - parseDateMillis(b.createdAt);
  });

  // Calculate overall time range
  const allTimestamps: number[] = [
    ...sortedEntries.map((e) => parseDateMillis(e.createdAt)),
    ...sortedConversations.map((c) => parseDateMillis(c.createdAt)),
  ].filter((t) => t > 0);

  let rangeStart = new Date().toISOString();
  let rangeEnd = new Date().toISOString();

  if (allTimestamps.length > 0) {
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    rangeStart = new Date(minTime).toISOString();
    rangeEnd = new Date(maxTime).toISOString();
  }

  // 4. Mood Metrics
  const moodDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const moodRatings: number[] = [];

  for (const entry of sortedEntries) {
    if (typeof entry.moodRating === 'number' && entry.moodRating >= 1 && entry.moodRating <= 5) {
      const rounded = Math.round(entry.moodRating);
      moodDistribution[rounded] = (moodDistribution[rounded] || 0) + 1;
      moodRatings.push(entry.moodRating);
    }
  }

  let averageMood = 0;
  let standardDeviation = 0;
  let trajectory: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
  let earlierAvg: number | null = null;
  let recentAvg: number | null = null;

  if (moodRatings.length > 0) {
    const sum = moodRatings.reduce((acc, val) => acc + val, 0);
    averageMood = Number((sum / moodRatings.length).toFixed(2));

    if (moodRatings.length >= 2) {
      const variance =
        moodRatings.reduce((acc, val) => acc + Math.pow(val - averageMood, 2), 0) /
        (moodRatings.length - 1);
      standardDeviation = Number(Math.sqrt(variance).toFixed(2));

      // Calculate trajectory between earlier half and recent half
      const midpoint = Math.floor(moodRatings.length / 2);
      const earlierRatings = moodRatings.slice(0, midpoint);
      const recentRatings = moodRatings.slice(midpoint);

      if (earlierRatings.length > 0 && recentRatings.length > 0) {
        earlierAvg = Number(
          (earlierRatings.reduce((a, b) => a + b, 0) / earlierRatings.length).toFixed(2)
        );
        recentAvg = Number(
          (recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length).toFixed(2)
        );

        const diff = recentAvg - earlierAvg;
        if (diff > 0.35) {
          trajectory = 'improving';
        } else if (diff < -0.35) {
          trajectory = 'declining';
        } else {
          trajectory = 'stable';
        }
      }
    }
  }

  // 5. Tag Frequencies and Cross-Tabulations
  const tagFreqMap: Record<string, number> = {};
  const tagMoodSumMap: Record<string, { sum: number; count: number }> = {};
  const halfEntryIndex = Math.floor(sortedEntries.length / 2);
  const earlierTagCounts: Record<string, number> = {};
  const recentTagCounts: Record<string, number> = {};

  sortedEntries.forEach((entry, idx) => {
    const isRecent = idx >= halfEntryIndex;
    const entryTags = Array.isArray(entry.tags) ? entry.tags : [];
    const validEntryMood =
      typeof entry.moodRating === 'number' && entry.moodRating >= 1 && entry.moodRating <= 5
        ? entry.moodRating
        : null;

    const seenInEntry = new Set<string>();
    for (const rawTag of entryTags) {
      if (typeof rawTag === 'string') {
        const tag = rawTag.trim().toLowerCase().replace(/^[#]+/, '');
        if (tag.length > 0 && !seenInEntry.has(tag)) {
          seenInEntry.add(tag);
          tagFreqMap[tag] = (tagFreqMap[tag] || 0) + 1;

          if (isRecent) {
            recentTagCounts[tag] = (recentTagCounts[tag] || 0) + 1;
          } else {
            earlierTagCounts[tag] = (earlierTagCounts[tag] || 0) + 1;
          }

          if (validEntryMood !== null) {
            if (!tagMoodSumMap[tag]) {
              tagMoodSumMap[tag] = { sum: 0, count: 0 };
            }
            tagMoodSumMap[tag].sum += validEntryMood;
            tagMoodSumMap[tag].count += 1;
          }
        }
      }
    }
  });

  const tagFrequencies = Object.entries(tagFreqMap)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const topTags = tagFrequencies.slice(0, 5).map((t) => t.tag);

  const tagMoodAssociations = Object.entries(tagMoodSumMap)
    .map(([tag, data]) => ({
      tag,
      averageMood: Number((data.sum / data.count).toFixed(2)),
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count);

  const tagVelocity = topTags.map((tag) => {
    const earlierCount = earlierTagCounts[tag] || 0;
    const recentCount = recentTagCounts[tag] || 0;
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentCount > earlierCount) trend = 'increasing';
    else if (recentCount < earlierCount) trend = 'decreasing';
    return { tag, earlierCount, recentCount, trend };
  });

  // 6. Deterministic Keyword & Theme Extraction
  const keywordFreqMap: Record<string, number> = {};

  const processTextForKeywords = (text: string) => {
    if (!text) return;
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/);

    for (const token of tokens) {
      if (token.length >= 4 && !COMMON_STOP_WORDS.has(token)) {
        keywordFreqMap[token] = (keywordFreqMap[token] || 0) + 1;
      }
    }
  };

  validEntries.forEach((e) => {
    processTextForKeywords(e.title || '');
    processTextForKeywords(e.content || '');
  });

  validConversations.forEach((c) => {
    processTextForKeywords(c.summary || '');
  });

  const topKeywords = Object.entries(keywordFreqMap)
    .map(([word, count]) => ({ word, count }))
    .filter((kw) => kw.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Extract key themes from summaries
  const reflectionThemes: string[] = [];
  validConversations.forEach((c) => {
    if (c.summary) {
      const lines = c.summary.split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
        if (
          cleaned.length >= 10 &&
          cleaned.length <= 100 &&
          !cleaned.toLowerCase().startsWith('key themes') &&
          !cleaned.toLowerCase().startsWith('notable thoughts') &&
          !cleaned.toLowerCase().startsWith('questions')
        ) {
          if (!reflectionThemes.includes(cleaned)) {
            reflectionThemes.push(cleaned);
          }
        }
      }
    }
  });

  // 7. Phase 10: Extended Deterministic Intelligence
  //    Pure, evidence-grounded modules analyze mood trajectory, timing
  //    rhythm, reflection frequency, theme evolution, unusual timing, and
  //    optional location patterns. Each module enforces its own minimum
  //    evidence threshold and returns `insufficient_data` honestly.
  const analyzableEntries = validEntries.map((e) => ({
    id: e.id,
    content: typeof e.content === 'string' ? e.content : '',
    moodRating: typeof e.moodRating === 'number' ? e.moodRating : undefined,
    tags: Array.isArray(e.tags) ? e.tags : [],
    createdAt: e.createdAt,
    location: e.location || null,
  }));
  const conversationTimedItems = validConversations.map((c) => ({
    id: c.id,
    createdAt: c.createdAt,
  }));
  const intelligence = analyzePatternIntelligence(analyzableEntries, conversationTimedItems);

  return {
    hasSufficientData: true,
    requiredCount: 3,
    availableCount: totalMeaningfulItems,
    metrics: {
      entryCount: validEntries.length,
      completedConversationCount: validConversations.length,
      totalItems: totalMeaningfulItems,
      timeRange: {
        start: rangeStart,
        end: rangeEnd,
      },
      mood: {
        distribution: moodDistribution,
        averageMood,
        standardDeviation,
        trajectory,
        earlierAverageMood: earlierAvg,
        recentAverageMood: recentAvg,
      },
      tags: {
        tagFrequencies,
        topTags,
        tagMoodAssociations,
        tagVelocity,
      },
      themes: {
        topKeywords,
        reflectionThemes: reflectionThemes.slice(0, 6),
      },
    },
    intelligence,
  };
}
