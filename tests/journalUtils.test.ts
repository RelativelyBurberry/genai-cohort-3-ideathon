import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  calculateWordCount,
  normalizeTags,
  validateJournalEntryInput,
  formatEntryDate,
  getMoodDescriptor,
  CANONICAL_MOOD_RATINGS,
} from '../src/utils/journal';

describe('Journal Utilities & Deterministic Functions', () => {
  describe('calculateWordCount', () => {
    it('returns 0 for empty or whitespace-only strings', () => {
      expect(calculateWordCount('')).toBe(0);
      expect(calculateWordCount('   ')).toBe(0);
      expect(calculateWordCount('\n\t  \r\n')).toBe(0);
    });

    it('accurately counts single and multiple words', () => {
      expect(calculateWordCount('Mindfulness')).toBe(1);
      expect(calculateWordCount('Today was a deeply peaceful day.')).toBe(6);
    });

    it('correctly handles irregular spacing, newlines, and tabs', () => {
      const text = 'First line.\n\nSecond   line   with   irregular   spacing.\tThird line.';
      expect(calculateWordCount(text)).toBe(9);
    });
  });

  describe('normalizeTags', () => {
    it('returns an empty array for undefined, null, or empty inputs', () => {
      expect(normalizeTags(undefined)).toEqual([]);
      expect(normalizeTags(null)).toEqual([]);
      expect(normalizeTags([])).toEqual([]);
      expect(normalizeTags('')).toEqual([]);
    });

    it('trims whitespace and strips leading hash symbols', () => {
      const result = normalizeTags(['  #gratitude ', '#peace', 'work  ']);
      expect(result).toEqual(['gratitude', 'peace', 'work']);
    });

    it('filters out empty or pure-whitespace tags', () => {
      const result = normalizeTags(['#', '   ', 'valid-tag', '']);
      expect(result).toEqual(['valid-tag']);
    });

    it('deduplicates tags case-insensitively while normalizing to lowercase', () => {
      const result = normalizeTags(['Mindfulness', '#MINDFULNESS', 'mindfulness', 'Focus']);
      expect(result).toEqual(['mindfulness', 'focus']);
    });

    it('supports comma-separated string input', () => {
      const result = normalizeTags('nature, #quiet , deep work, nature');
      expect(result).toEqual(['nature', 'quiet', 'deep work']);
    });
  });

  describe('validateJournalEntryInput', () => {
    it('rejects missing or empty content', () => {
      expect(validateJournalEntryInput({ content: '', moodRating: 3 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: '   \n  ', moodRating: 3 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: null as any, moodRating: 3 }).valid).toBe(false);
    });

    it('rejects invalid mood ratings (< 1, > 5, or non-integers)', () => {
      expect(validateJournalEntryInput({ content: 'Valid reflection', moodRating: 0 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: 'Valid reflection', moodRating: 6 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: 'Valid reflection', moodRating: -1 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: 'Valid reflection', moodRating: 3.5 }).valid).toBe(false);
      expect(validateJournalEntryInput({ content: 'Valid reflection', moodRating: undefined as any }).valid).toBe(false);
    });

    it('accepts valid content and mood ratings [1..5]', () => {
      for (let mood = 1; mood <= 5; mood++) {
        const res = validateJournalEntryInput({
          content: 'A thoughtful reflection about the day.',
          moodRating: mood,
        });
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });
  });

  describe('getMoodDescriptor & CANONICAL_MOOD_RATINGS', () => {
    it('defines the canonical 1 to 5 numeric mood ratings mapped to exact vocabulary', () => {
      expect(CANONICAL_MOOD_RATINGS).toEqual([1, 2, 3, 4, 5]);
      const mappedLabels = CANONICAL_MOOD_RATINGS.map((m) => getMoodDescriptor(m).label);
      expect(mappedLabels).toEqual(['Heavy', 'Low', 'Grounded', 'Uplifted', 'Radiant']);
    });

    it('provides distinct descriptors and valid labels for all ratings 1 to 5', () => {
      const mood1 = getMoodDescriptor(1);
      const mood2 = getMoodDescriptor(2);
      const mood3 = getMoodDescriptor(3);
      const mood4 = getMoodDescriptor(4);
      const mood5 = getMoodDescriptor(5);

      expect(mood1.label).toBe('Heavy');
      expect(mood2.label).toBe('Low');
      expect(mood3.label).toBe('Grounded');
      expect(mood4.label).toBe('Uplifted');
      expect(mood5.label).toBe('Radiant');

      expect(mood1.dotColor).toContain('rose');
      expect(mood5.dotColor).toContain('emerald');
    });
  });

  describe('formatEntryDate', () => {
    it('returns fallback for null or invalid dates', () => {
      expect(formatEntryDate(null)).toBe('Just now');
      expect(formatEntryDate(undefined)).toBe('Just now');
    });

    it('formats Date and Firestore Timestamp instances', () => {
      const date = new Date('2026-09-04T12:00:00Z');
      const formatted = formatEntryDate(date);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('Sep');

      const ts = Timestamp.fromDate(date);
      const formattedTs = formatEntryDate(ts);
      expect(formattedTs).toBe(formatted);
    });
  });
});
