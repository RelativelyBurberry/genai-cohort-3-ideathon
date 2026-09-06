import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Focused tests for the frontend reflection response handling:
 *   - parseReflectionResponse: HTML detection, malformed JSON, structured errors
 *   - requestAssistantReflection: client fallback persistence
 *
 * These tests mock fetch and the Firebase Client SDK service functions
 * to verify the contract in isolation.
 */

// Mock firebase/firestore before importing the service.
// addDoc / updateDoc are conditionally controlled via variables below
// so tests can simulate both success and failure of the Client SDK
// persistence. Call-tracking variables let tests assert invocation
// counts without relying on vi.spyOn over a mocked module.
let addDocShouldFail = false;
let updateDocShouldFail = false;
let updateDocCallCount = 0;

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(async () => {
    if (addDocShouldFail) {
      throw new Error('Firestore write denied');
    }
    return { id: 'client_persisted_id' };
  }),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(async (_ref: any, _data: any) => {
    updateDocCallCount++;
    if (updateDocShouldFail) {
      throw new Error('Firestore update denied');
    }
  }),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({})),
}));

// Mock db to avoid real Firebase initialization.
vi.mock('../src/firebase', () => ({
  db: {},
}));

import {
  parseReflectionResponse,
  requestAssistantReflection,
  requestSummarize,
} from '../src/services/reflectionService';

/**
 * Helper to build a fetch-like Response object.
 */
function makeResponse(
  body: string,
  init: { status?: number; contentType?: string } = {}
): Response {
  const status = init.status ?? 200;
  const headers = new Headers();
  if (init.contentType !== undefined) {
    headers.set('content-type', init.contentType);
  }
  return new Response(body, { status, headers });
}

describe('parseReflectionResponse — robust response parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid JSON with application/json content-type', async () => {
    const res = makeResponse(
      JSON.stringify({ status: 'success', message: { content: 'hi' } }),
      { status: 200, contentType: 'application/json' }
    );
    const data = await parseReflectionResponse(res);
    expect(data.status).toBe('success');
    expect(data.message.content).toBe('hi');
  });

  it('detects HTML 200 proxy response and throws a friendly error (no raw SyntaxError)', async () => {
    const htmlBody = '<!doctype html><html><head><title>Starting Server...</title></head></html>';
    const res = makeResponse(htmlBody, { status: 200, contentType: 'text/html' });

    await expect(parseReflectionResponse(res)).rejects.toThrow(
      'The reflection service is temporarily unavailable. Please tap Retry.'
    );
  });

  it('detects HTML response without explicit content-type', async () => {
    const htmlBody = '<!doctype html><html><body>Starting Server...</body></html>';
    const res = makeResponse(htmlBody, { status: 200 });

    await expect(parseReflectionResponse(res)).rejects.toThrow(
      'The reflection service is temporarily unavailable. Please tap Retry.'
    );
  });

  it('detects <html> prefix without doctype', async () => {
    const htmlBody = '<html><body>502 Bad Gateway</body></html>';
    const res = makeResponse(htmlBody, { status: 200, contentType: 'text/html' });

    await expect(parseReflectionResponse(res)).rejects.toThrow(
      'The reflection service is temporarily unavailable. Please tap Retry.'
    );
  });

  it('handles malformed JSON in application/json response with friendly error', async () => {
    const res = makeResponse('{ not valid json', { status: 200, contentType: 'application/json' });

    await expect(parseReflectionResponse(res)).rejects.toThrow(
      'The reflection service is temporarily unavailable. Please tap Retry.'
    );
  });

  it('preserves structured JSON backend error message on non-2xx response', async () => {
    const errorBody = JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Reflection rate limit reached. Please pause and reflect.',
      retryAfterSeconds: 45,
    });
    const res = makeResponse(errorBody, { status: 429, contentType: 'application/json' });

    // parseReflectionResponse returns parsed data even on non-2xx;
    // the caller (requestAssistantReflection) inspects response.ok.
    const data = await parseReflectionResponse(res);
    expect(data.error).toBe('rate_limit_exceeded');
    expect(data.message).toBe('Reflection rate limit reached. Please pause and reflect.');
    expect(data.retryAfterSeconds).toBe(45);
  });

  it('handles non-JSON content-type with unparseable body on non-2xx', async () => {
    const res = makeResponse('Internal Server Error', { status: 500, contentType: 'text/plain' });

    await expect(parseReflectionResponse(res)).rejects.toThrow(
      'The reflection service is temporarily unavailable. Please tap Retry.'
    );
  });

  it('does not silently treat HTML as successful JSON', async () => {
    const htmlBody = '<!doctype html><html></html>';
    const res = makeResponse(htmlBody, { status: 200, contentType: 'text/html' });

    // Must throw, NOT return data.
    await expect(parseReflectionResponse(res)).rejects.toThrow();
    try {
      await parseReflectionResponse(makeResponse(htmlBody, { status: 200, contentType: 'text/html' }));
    } catch (e: any) {
      // Never expose raw SyntaxError messages to the UI.
      expect(e.message).not.toContain('Unexpected token');
      expect(e.message).not.toContain('SyntaxError');
    }
  });
});

describe('requestAssistantReflection — client fallback persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    addDocShouldFail = false;
    updateDocShouldFail = false;
    updateDocCallCount = 0;
  });

  it('returns the persisted message on normal backend persistence (no fallback)', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      message: {
        id: 'msg_assist_1',
        role: 'assistant',
        content: 'What feels heaviest?',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      persistence: { persisted: true },
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    const result = await requestAssistantReflection('token', 'conv_1', 'user_123');

    expect(result.status).toBe('success');
    expect(result.message.id).toBe('msg_assist_1');
    expect(result.persistence.persisted).toBe(true);
    expect(result.persistence.fallbackRequired).toBeUndefined();
    // fetch called exactly once; no client fallback path executed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('persists assistant message via Client SDK when backend signals fallbackRequired', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      message: {
        id: null,
        role: 'assistant',
        content: 'What feels heaviest?',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      persistence: {
        persisted: false,
        fallbackRequired: true,
        reason: 'backend_persistence_unavailable',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    // addDoc succeeds (default), so the fallback persists the assistant
    // message and normalizes the response.
    const result = await requestAssistantReflection('token', 'conv_1', 'user_123');

    expect(result.message.content).toBe('What feels heaviest?');
    // Client fallback persisted and normalized the id.
    expect(result.message.id).toBe('client_persisted_id');
    expect(result.persistence.persisted).toBe(true);
    expect(result.persistence.fallbackRequired).toBe(false);
  });

  it('throws when client fallback persistence fails (no fake success)', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      message: {
        id: null,
        role: 'assistant',
        content: 'What feels heaviest?',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      persistence: {
        persisted: false,
        fallbackRequired: true,
        reason: 'backend_persistence_unavailable',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    // Force the Client SDK addDoc to reject.
    addDocShouldFail = true;

    await expect(
      requestAssistantReflection('token', 'conv_1', 'user_123')
    ).rejects.toThrow();
  });

  it('surfaces a friendly error on HTML 200 response (no raw SyntaxError)', async () => {
    const htmlBody = '<!doctype html><html><title>Starting Server...</title></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(htmlBody, { status: 200, contentType: 'text/html' })
    );

    await expect(
      requestAssistantReflection('token', 'conv_1', 'user_123')
    ).rejects.toThrow('The reflection service is temporarily unavailable. Please tap Retry.');
  });

  it('surfaces structured backend error message on non-2xx JSON', async () => {
    const errorBody = {
      error: 'rate_limit_exceeded',
      message: 'Reflection rate limit reached. Please pause for 45 seconds before reflecting again.',
      retryAfterSeconds: 45,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(errorBody), { status: 429, contentType: 'application/json' })
    );

    try {
      await requestAssistantReflection('token', 'conv_1', 'user_123');
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.message).toBe('Reflection rate limit reached. Please pause for 45 seconds before reflecting again.');
      expect((e as any).statusCode).toBe(429);
      expect((e as any).retryAfterSeconds).toBe(45);
    }
  });

  it('passes crisis support early-exit without attempting fallback', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      crisisSupportRequired: true,
      assistantMessage: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    const result = await requestAssistantReflection('token', 'conv_1', 'user_123');

    expect(result.crisisSupportRequired).toBe(true);
    expect(result.message).toBeUndefined();
  });
});

describe('requestSummarize — client fallback completion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    addDocShouldFail = false;
    updateDocShouldFail = false;
    updateDocCallCount = 0;
  });

  it('returns the summary on normal backend persistence (no fallback)', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      summary: 'Key Themes: Personal Growth\nNotable Thoughts: Clarity achieved.',
      persistence: { persisted: true },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    const result = await requestSummarize('token', 'conv_1', 'user_123');

    expect(result.status).toBe('success');
    expect(result.conversationId).toBe('conv_1');
    expect(result.summary).toContain('Key Themes');
    expect(result.persistence?.persisted).toBe(true);
    expect(result.persistence?.fallbackRequired).toBeUndefined();
    // Client SDK completion MUST NOT have been called.
    expect(updateDocCallCount).toBe(0);
  });

  it('completes conversation via Client SDK when backend signals fallbackRequired', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      summary: 'Key Themes: Personal Growth\nNotable Thoughts: Clarity achieved.',
      persistence: {
        persisted: false,
        fallbackRequired: true,
        reason: 'backend_persistence_unavailable',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    // updateDoc succeeds (default), so the fallback completes the
    // conversation and normalizes the response.
    const result = await requestSummarize('token', 'conv_1', 'user_123');

    expect(result.conversationId).toBe('conv_1');
    expect(result.summary).toContain('Key Themes');
    // Client fallback persisted and normalized the response.
    expect(result.persistence?.persisted).toBe(true);
    expect(result.persistence?.fallbackRequired).toBe(false);
    expect(result.persistence?.reason).toBe('client_fallback_completed');
    // updateDoc MUST have been called once for the completion.
    expect(updateDocCallCount).toBe(1);
  });

  it('throws when client completion fails (no fake success)', async () => {
    const responseBody = {
      status: 'success',
      conversationId: 'conv_1',
      summary: 'Key Themes: Personal Growth\nNotable Thoughts: Clarity achieved.',
      persistence: {
        persisted: false,
        fallbackRequired: true,
        reason: 'backend_persistence_unavailable',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(JSON.stringify(responseBody), { status: 200, contentType: 'application/json' })
    );

    // Force the Client SDK updateDoc to reject.
    updateDocShouldFail = true;

    await expect(
      requestSummarize('token', 'conv_1', 'user_123')
    ).rejects.toThrow();
  });

  it('surfaces a friendly error on HTML 200 response (no raw SyntaxError)', async () => {
    const htmlBody = '<!doctype html><html><title>Starting Server...</title></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(htmlBody, { status: 200, contentType: 'text/html' })
    );

    await expect(
      requestSummarize('token', 'conv_1', 'user_123')
    ).rejects.toThrow('The reflection service is temporarily unavailable. Please tap Retry.');
  });
});
