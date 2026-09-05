import { describe, it, expect } from 'vitest';
import {
  sortMessagesChronologically,
  getTimestampMillis,
} from './firestoreRestService.js';
import { formatTurnsForGemini } from './conversationService.js';

describe('BUG 1 Fix - Conversation Memory Integrity & Timestamp Ordering', () => {
  it('correctly parses diverse timestamp formats into epoch milliseconds', () => {
    const iso = '2026-09-04T12:00:00.000Z';
    const isoMillis = new Date(iso).getTime();

    expect(getTimestampMillis(iso)).toBe(isoMillis);
    expect(getTimestampMillis(new Date(iso))).toBe(isoMillis);
    expect(getTimestampMillis(isoMillis)).toBe(isoMillis);
    expect(getTimestampMillis({ seconds: Math.floor(isoMillis / 1000), nanos: 0 })).toBe(isoMillis);
    expect(getTimestampMillis({ _seconds: Math.floor(isoMillis / 1000), _nanoseconds: 0 })).toBe(isoMillis);
    expect(getTimestampMillis({ timestampValue: iso })).toBe(isoMillis);
    expect(getTimestampMillis(null)).toBe(0);
  });

  it('deterministically sorts unordered messages chronologically', () => {
    const t1 = '2026-09-04T10:00:00.000Z';
    const t2 = '2026-09-04T10:05:00.000Z';
    const t3 = '2026-09-04T10:10:00.000Z';

    const unordered = [
      { id: 'msg3', role: 'user' as const, content: 'What was I stressed out for again?', createdAt: t3 },
      { id: 'msg1', role: 'user' as const, content: 'im kinda stressed about exams', createdAt: t1 },
      { id: 'msg2', role: 'assistant' as const, content: 'I hear how overwhelming exam stress can be.', createdAt: t2 },
    ];

    const sorted = sortMessagesChronologically(unordered);

    expect(sorted.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg3']);
    expect(sorted[0].content).toBe('im kinda stressed about exams');
    expect(sorted[1].content).toBe('I hear how overwhelming exam stress can be.');
    expect(sorted[2].content).toBe('What was I stressed out for again?');
  });

  it('correctly formats chronological prior turns for Gemini prompt context', () => {
    const t1 = '2026-09-04T10:00:00.000Z';
    const t2 = '2026-09-04T10:05:00.000Z';
    const t3 = '2026-09-04T10:10:00.000Z';

    const rawMessages = [
      { id: 'msg2', role: 'assistant' as const, content: 'I hear how overwhelming exam stress can be.', createdAt: t2 },
      { id: 'msg3', role: 'user' as const, content: 'What was I stressed out for again?', createdAt: t3 },
      { id: 'msg1', role: 'user' as const, content: 'im kinda stressed about exams', createdAt: t1 },
    ];

    const sorted = sortMessagesChronologically(rawMessages);

    // Latest user turn is msg3
    const priorMessages = sorted.slice(0, -1);
    const priorTurns = formatTurnsForGemini(priorMessages as any);

    expect(priorTurns).toHaveLength(2);
    expect(priorTurns[0]).toEqual({
      role: 'user',
      content: 'im kinda stressed about exams',
    });
    expect(priorTurns[1]).toEqual({
      role: 'assistant',
      content: 'I hear how overwhelming exam stress can be.',
    });
  });
});
