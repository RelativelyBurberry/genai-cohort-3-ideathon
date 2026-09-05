import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGeminiModelName,
  generateReflectionResponse,
  generateConversationSummary,
} from '../server/services/geminiService';

describe('Server-Side Gemini Reflection Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to gemini-3.1-flash-lite when GEMINI_MODEL is not set', () => {
    delete process.env.GEMINI_MODEL;
    expect(getGeminiModelName()).toBe('gemini-3.1-flash-lite');
  });

  it('respects GEMINI_MODEL override if explicitly provided', () => {
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
    expect(getGeminiModelName()).toBe('gemini-3.1-flash-lite');
  });

  it('fails closed with GEMINI_CONFIGURATION_ERROR if GEMINI_API_KEY is missing or empty', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      generateReflectionResponse([], 'Hello reflection')
    ).rejects.toThrow('GEMINI_CONFIGURATION_ERROR');

    await expect(
      generateConversationSummary([])
    ).rejects.toThrow('GEMINI_CONFIGURATION_ERROR');
  });
});
