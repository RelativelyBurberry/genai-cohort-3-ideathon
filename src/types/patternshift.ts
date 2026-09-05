export interface PatternShiftTimeRange {
  start: string;
  end: string;
}

export interface TagMoodAssociation {
  tag: string;
  averageMood: number;
  count: number;
}

export interface TagVelocity {
  tag: string;
  earlierCount: number;
  recentCount: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface KeywordFrequency {
  word: string;
  count: number;
}

export interface PatternShiftMetrics {
  entryCount: number;
  completedConversationCount: number;
  totalItems: number;
  timeRange: PatternShiftTimeRange;
  mood: {
    distribution: Record<number, number>; // { 1: n, 2: n, 3: n, 4: n, 5: n }
    averageMood: number;
    standardDeviation: number;
    trajectory: 'improving' | 'declining' | 'stable' | 'insufficient_data';
    earlierAverageMood: number | null;
    recentAverageMood: number | null;
  };
  tags: {
    tagFrequencies: { tag: string; count: number }[];
    topTags: string[];
    tagMoodAssociations: TagMoodAssociation[];
    tagVelocity: TagVelocity[];
  };
  themes: {
    topKeywords: KeywordFrequency[];
    reflectionThemes: string[];
  };
}

export interface PatternShiftInsight {
  id: string;
  generatedAt: string;
  timeRange: PatternShiftTimeRange;
  itemCount: {
    entries: number;
    completedConversations: number;
    total: number;
  };
  metrics: PatternShiftMetrics;
  observations: string[];
  suggestedInquiries: string[];
  type: 'patternshift';
}

export type PatternShiftResponse =
  | {
      status: 'success';
      insight: PatternShiftInsight;
    }
  | {
      status: 'insufficient_data';
      required: number;
      available: number;
      message: string;
    }
  | {
      status: 'error';
      error: string;
      message: string;
    };
