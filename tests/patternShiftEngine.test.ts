import { describe, it, expect } from 'vitest';
import {
  computePatternShiftMetrics,
  RawEntry,
  RawConversation,
} from '../server/services/patternShiftEngine';

describe('PatternShiftEngine - Deterministic Analysis & Guards', () => {
  describe('Insufficient Data Guard', () => {
    it('returns insufficient_data when total meaningful items is 0', () => {
      const result = computePatternShiftMetrics([], []);
      expect(result.hasSufficientData).toBe(false);
      expect(result.availableCount).toBe(0);
      expect(result.requiredCount).toBe(3);
      expect(result.metrics).toBeUndefined();
    });

    it('returns insufficient_data when total meaningful items is 1 (1 entry, 0 conversations)', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'First journal entry.',
          moodRating: 4,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ];
      const result = computePatternShiftMetrics(entries, []);
      expect(result.hasSufficientData).toBe(false);
      expect(result.availableCount).toBe(1);
      expect(result.requiredCount).toBe(3);
      expect(result.metrics).toBeUndefined();
    });

    it('returns insufficient_data when total meaningful items is 2 (1 entry, 1 completed conversation)', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'First journal entry.',
          moodRating: 4,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ];
      const conversations: RawConversation[] = [
        {
          id: 'c1',
          title: 'Morning reflection',
          status: 'completed',
          summary: 'User explored work-life balance.',
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      ];
      const result = computePatternShiftMetrics(entries, conversations);
      expect(result.hasSufficientData).toBe(false);
      expect(result.availableCount).toBe(2);
      expect(result.requiredCount).toBe(3);
      expect(result.metrics).toBeUndefined();
    });

    it('ignores active or unsummarized conversations in the count', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'First journal entry.',
          moodRating: 4,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ];
      const conversations: RawConversation[] = [
        {
          id: 'c1',
          title: 'Active reflection',
          status: 'active', // Should be ignored
          summary: null,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        {
          id: 'c2',
          title: 'Completed but empty summary',
          status: 'completed',
          summary: '   ', // Empty summary ignored
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ];
      const result = computePatternShiftMetrics(entries, conversations);
      expect(result.hasSufficientData).toBe(false);
      expect(result.availableCount).toBe(1);
    });

    it('activates analysis when exactly 3 meaningful items exist', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'Entry one.',
          moodRating: 3,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
        {
          id: 'e2',
          content: 'Entry two.',
          moodRating: 4,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      ];
      const conversations: RawConversation[] = [
        {
          id: 'c1',
          title: 'Reflection 1',
          status: 'completed',
          summary: 'Discussed project milestones.',
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ];
      const result = computePatternShiftMetrics(entries, conversations);
      expect(result.hasSufficientData).toBe(true);
      expect(result.availableCount).toBe(3);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.entryCount).toBe(2);
      expect(result.metrics?.completedConversationCount).toBe(1);
      expect(result.metrics?.totalItems).toBe(3);
    });
  });

  describe('Deterministic Mood Calculations', () => {
    it('computes accurate mood distribution, average, and standard deviation', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'Very low mood',
          moodRating: 1,
          createdAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'e2',
          content: 'Neutral mood',
          moodRating: 3,
          createdAt: '2026-09-02T00:00:00Z',
        },
        {
          id: 'e3',
          content: 'High mood',
          moodRating: 5,
          createdAt: '2026-09-03T00:00:00Z',
        },
      ];

      const result = computePatternShiftMetrics(entries, []);
      expect(result.hasSufficientData).toBe(true);
      const mood = result.metrics!.mood;

      expect(mood.distribution[1]).toBe(1);
      expect(mood.distribution[2]).toBe(0);
      expect(mood.distribution[3]).toBe(1);
      expect(mood.distribution[4]).toBe(0);
      expect(mood.distribution[5]).toBe(1);

      // (1 + 3 + 5) / 3 = 3.00
      expect(mood.averageMood).toBe(3.0);
      // Sample std dev of [1, 3, 5] = sqrt(((1-3)^2 + (3-3)^2 + (5-3)^2) / 2) = sqrt((4 + 0 + 4)/2) = 2.00
      expect(mood.standardDeviation).toBe(2.0);
    });

    it('determines improving trajectory when recent mood is higher', () => {
      const entries: RawEntry[] = [
        { id: 'e1', content: 'Day 1', moodRating: 2, createdAt: '2026-09-01T00:00:00Z' },
        { id: 'e2', content: 'Day 2', moodRating: 2, createdAt: '2026-09-02T00:00:00Z' },
        { id: 'e3', content: 'Day 3', moodRating: 4, createdAt: '2026-09-03T00:00:00Z' },
        { id: 'e4', content: 'Day 4', moodRating: 5, createdAt: '2026-09-04T00:00:00Z' },
      ];

      const result = computePatternShiftMetrics(entries, []);
      expect(result.metrics!.mood.trajectory).toBe('improving');
      expect(result.metrics!.mood.earlierAverageMood).toBe(2.0);
      expect(result.metrics!.mood.recentAverageMood).toBe(4.5);
    });

    it('determines declining trajectory when recent mood is lower', () => {
      const entries: RawEntry[] = [
        { id: 'e1', content: 'Day 1', moodRating: 5, createdAt: '2026-09-01T00:00:00Z' },
        { id: 'e2', content: 'Day 2', moodRating: 4, createdAt: '2026-09-02T00:00:00Z' },
        { id: 'e3', content: 'Day 3', moodRating: 2, createdAt: '2026-09-03T00:00:00Z' },
        { id: 'e4', content: 'Day 4', moodRating: 1, createdAt: '2026-09-04T00:00:00Z' },
      ];

      const result = computePatternShiftMetrics(entries, []);
      expect(result.metrics!.mood.trajectory).toBe('declining');
    });

    it('determines stable trajectory when difference is within threshold', () => {
      const entries: RawEntry[] = [
        { id: 'e1', content: 'Day 1', moodRating: 3, createdAt: '2026-09-01T00:00:00Z' },
        { id: 'e2', content: 'Day 2', moodRating: 4, createdAt: '2026-09-02T00:00:00Z' },
        { id: 'e3', content: 'Day 3', moodRating: 3, createdAt: '2026-09-03T00:00:00Z' },
        { id: 'e4', content: 'Day 4', moodRating: 4, createdAt: '2026-09-04T00:00:00Z' },
      ];

      const result = computePatternShiftMetrics(entries, []);
      expect(result.metrics!.mood.trajectory).toBe('stable');
    });
  });

  describe('Tag Metrics & Cross-Tabulations', () => {
    it('normalizes tags, calculates frequencies and tag-mood correlations', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'Work project',
          moodRating: 2,
          tags: ['#Work', 'Focus'],
          createdAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'e2',
          content: 'Work deadline',
          moodRating: 3,
          tags: ['work', 'stress'],
          createdAt: '2026-09-02T00:00:00Z',
        },
        {
          id: 'e3',
          content: 'Weekend nature walk',
          moodRating: 5,
          tags: ['nature', 'Focus'],
          createdAt: '2026-09-03T00:00:00Z',
        },
      ];

      const result = computePatternShiftMetrics(entries, []);
      const tags = result.metrics!.tags;

      expect(tags.topTags).toContain('work');
      expect(tags.topTags).toContain('focus');

      // Tag 'work' appears in e1 (mood 2) and e2 (mood 3) -> avg = 2.50
      const workAssoc = tags.tagMoodAssociations.find((a) => a.tag === 'work');
      expect(workAssoc).toBeDefined();
      expect(workAssoc?.averageMood).toBe(2.5);
      expect(workAssoc?.count).toBe(2);

      // Tag 'focus' appears in e1 (mood 2) and e3 (mood 5) -> avg = 3.50
      const focusAssoc = tags.tagMoodAssociations.find((a) => a.tag === 'focus');
      expect(focusAssoc).toBeDefined();
      expect(focusAssoc?.averageMood).toBe(3.5);
      expect(focusAssoc?.count).toBe(2);
    });
  });

  describe('Malformed & Partial Dataset Resiliency', () => {
    it('handles entries with missing mood, null tags, and undefined titles gracefully', () => {
      const entries: RawEntry[] = [
        {
          id: 'e1',
          content: 'Just text entry with no mood rating',
          createdAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'e2',
          content: 'Another entry with empty tags array',
          moodRating: 4,
          tags: [],
          createdAt: '2026-09-02T00:00:00Z',
        },
        {
          id: 'e3',
          content: 'Third entry with invalid mood value',
          moodRating: 99 as any,
          createdAt: '2026-09-03T00:00:00Z',
        },
      ];

      const result = computePatternShiftMetrics(entries, []);
      expect(result.hasSufficientData).toBe(true);
      expect(result.metrics!.entryCount).toBe(3);
      // Only e2 has a valid moodRating (4)
      expect(result.metrics!.mood.averageMood).toBe(4.0);
    });
  });
});
