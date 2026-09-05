import { describe, it, expect, vi } from 'vitest';
import { generateReflectionResponse } from '../server/services/geminiService.js';

/*
 * Verifies the frozen Gemini client cache fix: a failed client
 * initialization (missing secret) must NOT poison the client for the
 * rest of the process. After the configuration is repaired, the next
 * call must re-initialize successfully.
 *
 * The real GoogleGenAI module is mocked at construction time; the mock
 * returns a resolved generateContent so the test never touches the
 * network.
 */
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: vi.fn().mockResolvedValue({ text: 'A calm reflection response.' }),
    };
    constructor(_opts: unknown) {}
  },
}));

describe('Gemini client initialization recovery', () => {
  it('fails closed on missing key, then fully recovers once the key is available', async () => {
    // 1. No key configured -> fail closed with GEMINI_CONFIGURATION_ERROR.
    process.env.GEMINI_API_KEY = '';
    await expect(generateReflectionResponse([], 'Hello')).rejects.toThrow(
      'GEMINI_CONFIGURATION_ERROR'
    );

    // 2. Runtime configuration repaired (key now available). The client
    //    cache must NOT be poisoned: the next call must succeed.
    process.env.GEMINI_API_KEY = 'test-key-that-is-valid-enough';
    const response = await generateReflectionResponse([], 'Hello again');
    expect(response).toBe('A calm reflection response.');
  });
});