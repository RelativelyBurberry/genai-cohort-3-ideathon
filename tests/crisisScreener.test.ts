import { describe, it, expect } from 'vitest';
import { screenForCrisis } from '../server/services/crisisScreener';

describe('Deterministic Pre-AI Crisis Screener', () => {
  it('identifies explicit suicide and self-harm ideation', () => {
    const triggers = [
      'I want to kill myself',
      'I feel like ending my life',
      'Thinking about suicide today',
      'I want to hurt myself tonight',
      'I am going to take my own life',
      'thinking of committing suicide',
      'planning my suicide note',
    ];

    for (const phrase of triggers) {
      const result = screenForCrisis(phrase);
      expect(result.requiresSupport).toBe(true);
      expect(result.matchedCategory).toBe('self_harm_ideation');
    }
  });

  it('identifies imminent crisis and hopelessness phrases', () => {
    const phrases = [
      "I don't want to live anymore",
      'Everyone would be better off without me',
      'There is no point in living anymore',
      'I cannot go on living like this',
    ];

    for (const phrase of phrases) {
      const result = screenForCrisis(phrase);
      expect(result.requiresSupport).toBe(true);
      expect(result.matchedCategory).toBe('self_harm_ideation');
    }
  });

  it('passes normal reflective, emotional, and introspective entries safely without triggering', () => {
    const normalReflections = [
      'I had an extremely exhausting and hard week at work.',
      'Feeling heavy and low today, but going to take a walk and rest.',
      'My presentation was stressful and I felt anxious speaking in front of everyone.',
      'Work deadlines are killing my weekend plans.', // figurative usage
      'I want to change my job and improve my work-life balance.',
      'Grateful for spending time with my family this evening.',
      'Contemplating what my next career step should be.',
    ];

    for (const entry of normalReflections) {
      const result = screenForCrisis(entry);
      expect(result.requiresSupport).toBe(false);
      expect(result.matchedCategory).toBeNull();
    }
  });

  it('handles empty or malformed strings gracefully without throwing', () => {
    expect(screenForCrisis('').requiresSupport).toBe(false);
    expect(screenForCrisis('   ').requiresSupport).toBe(false);
    expect(screenForCrisis(null as any).requiresSupport).toBe(false);
    expect(screenForCrisis(undefined as any).requiresSupport).toBe(false);
  });
});
