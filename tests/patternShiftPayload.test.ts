import { describe, it, expect } from 'vitest';
import {
  validatePatternShiftAnalysisPayload,
  PATTERN_ANALYSIS_PAYLOAD_LIMITS,
} from '../server/services/patternShiftPayload.js';

describe('PatternShift client analysis payload validation', () => {
  const validEntry = {
    id: 'e1',
    title: 'Morning reflection',
    content: 'A thoughtful entry.',
    moodRating: 4,
    tags: ['mindfulness', 'gratitude'],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:05:00Z',
    location: { latitude: 40.7128, longitude: -74.006, label: 'Brooklyn, New York' },
  };

  const validConversation = {
    id: 'c1',
    title: 'Deep dive',
    summary: 'Explored balance and boundaries.',
    createdAt: '2026-09-02T10:00:00Z',
    updatedAt: '2026-09-02T10:10:00Z',
    summaryUpdatedAt: '2026-09-02T10:10:00Z',
  };

  it('accepts an absent payload as valid-but-empty', () => {
    expect(validatePatternShiftAnalysisPayload(undefined)).toEqual({
      valid: true,
      entries: [],
      completedConversations: [],
    });
    expect(validatePatternShiftAnalysisPayload(null)).toEqual({
      valid: true,
      entries: [],
      completedConversations: [],
    });
  });

  it('rejects non-object payloads', () => {
    expect(validatePatternShiftAnalysisPayload('nope').valid).toBe(false);
    expect(validatePatternShiftAnalysisPayload([1, 2]).valid).toBe(false);
    expect(validatePatternShiftAnalysisPayload(42).valid).toBe(false);
  });

  it('rejects a uid or any unsupported top-level key', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [validEntry],
      uid: 'someone-else',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('unsupported field');
  });

  it('correctly maps a fully valid payload to RawEntry/RawConversation shapes', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [validEntry],
      completedConversations: [validConversation],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        id: 'e1',
        title: 'Morning reflection',
        content: 'A thoughtful entry.',
        moodRating: 4,
        tags: ['mindfulness', 'gratitude'],
        location: { label: 'Brooklyn, New York' },
      });
      expect(result.completedConversations).toHaveLength(1);
      expect(result.completedConversations[0]).toMatchObject({
        id: 'c1',
        status: 'completed',
        summary: 'Explored balance and boundaries.',
      });
    }
  });

  it('rejects malformed entries (out-of-range moodRating)', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ ...validEntry, moodRating: 99 }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('moodRating');
  });

  it('rejects entries with missing content', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ id: 'e1' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('content');
  });

  it('rejects entries with non-string tags', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ ...validEntry, tags: ['ok', 42] }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('tags');
  });

  it('rejects malformed location types', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ ...validEntry, location: { latitude: 'north', longitude: 10, label: 'x' } }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('location.latitude');
  });

  it('normalizes location with label only (coordinates optional)', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ ...validEntry, location: { label: 'Paris, France' } }],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.entries[0].location).toEqual({ label: 'Paris, France' });
    }
  });

  it('enforces array-length limits', () => {
    const overLimit = Array.from({ length: PATTERN_ANALYSIS_PAYLOAD_LIMITS.maxEntries + 1 }).map(
      (_, i) => ({ ...validEntry, id: `e${i}` })
    );
    const result = validatePatternShiftAnalysisPayload({ entries: overLimit });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('limit');
  });

  it('rejects an entry carrying a uid / unknown field inside the array item', () => {
    const result = validatePatternShiftAnalysisPayload({
      entries: [{ ...validEntry, uid: 'attacker' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('unsupported field');
  });
});