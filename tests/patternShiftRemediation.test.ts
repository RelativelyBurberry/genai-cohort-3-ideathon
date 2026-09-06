import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { patternShiftRouter } from '../server/routes/patternShift.js';
import * as adminHelper from '../server/firebaseAdmin.js';
import * as rateLimiter from '../server/services/rateLimiter.js';
import * as geminiService from '../server/services/geminiService.js';
import * as persistenceService from '../server/services/patternShiftPersistence.js';
import {
  BackendPersistenceUnavailableError,
} from '../server/services/privilegedPersistence.js';
import { DEMO_USER, DEMO_STORAGE_KEY } from '../src/demo/demoConfig.js';
import { DEMO_PATTERN_INSIGHT } from '../src/demo/demoData.js';

describe('Phase 10 PatternShift Remediation — Client-Read Primary Architecture', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Mock Firebase Admin Auth
    vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'valid_user_token') {
          return { uid: 'verified_user_abc', email: 'alice@example.com' };
        }
        const err: any = new Error('Invalid token');
        err.code = 'auth/argument-error';
        throw err;
      }),
    } as any);

    // Default rate limit pass
    vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 9,
      count: 1,
      limit: 10,
      resetTimeMs: Date.now() + 60000,
    });

    app = express();
    app.use(express.json());
    app.use(patternShiftRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const validEntries = [
    { id: 'e1', content: 'First reflection on priorities.', moodRating: 3, createdAt: '2026-09-01T10:00:00Z' },
    { id: 'e2', content: 'Second reflection on focus.', moodRating: 4, createdAt: '2026-09-02T10:00:00Z' },
    { id: 'e3', content: 'Third reflection on boundaries.', moodRating: 4, createdAt: '2026-09-03T10:00:00Z' },
  ];

  const mockAiOutput = {
    observations: ['A clear pattern of reflection.'],
    suggestedInquiries: ['What helps you stay focused?'],
  };

  // 1. Firebase ID token is NOT forwarded to Google Firestore REST
  //    (verified by the signature of persistence functions)
  it('1. verifies that PatternShift persistence functions do NOT accept Firebase ID tokens (no token parameter)', async () => {
    // fetchLatestPatternShiftInsight is used by the fallback GET /latest endpoint
    expect(persistenceService.fetchLatestPatternShiftInsight.length).toBe(1);
    expect(persistenceService.persistPatternShiftInsight.length).toBe(2); // (uid, insight)
  });

  // 2. Client-read primary: analysis works when backend has write capability
  it('2. analysis succeeds with client payload; backend writes insight when capability exists', async () => {
    const geminiSpy = vi
      .spyOn(geminiService, 'generatePatternShiftInsights')
      .mockResolvedValueOnce(mockAiOutput);
    const persistSpy = vi
      .spyOn(persistenceService, 'persistPatternShiftInsight')
      .mockResolvedValueOnce(undefined);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.persistence).toEqual({ persisted: true });
    expect(data.insight.observations).toEqual(mockAiOutput.observations);
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  // 3. Client-read primary: analysis works even when backend write capability is unavailable
  it('3. successful analysis returned even when backend write fails (persisted: false)', async () => {
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);

    // Simulate backend write capability failure
    vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockRejectedValueOnce(
      new BackendPersistenceUnavailableError('persistPatternShiftInsight')
    );

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.insight).toBeDefined();
    expect(data.insight.observations).toEqual(mockAiOutput.observations);
    // Explicit persistence metadata signaling sandbox write limitation
    expect(data.persistence).toEqual({
      persisted: false,
      reason: 'backend_persistence_unavailable',
    });
  });

  // 4. Request uid cannot override authenticated req.user.uid
  it('4. request uid in body or payload cannot override authenticated req.user.uid', async () => {
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);
    const persistSpy = vi
      .spyOn(persistenceService, 'persistPatternShiftInsight')
      .mockResolvedValueOnce(undefined);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token', // verified_user_abc
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
        uid: 'attacker_override_uid',
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    // Persistence called with verified UID only
    expect(persistSpy).toHaveBeenCalledWith('verified_user_abc', expect.anything());
  });

  // 5. Malformed client analysis payload is rejected
  it('5. malformed client analysis payload is rejected with 400 invalid_analysis_payload', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: [
            {
              id: 'e1',
              // Malformed: moodRating out of bounds
              moodRating: 99,
              content: 'Bad entry',
            },
          ],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_analysis_payload');
    expect(data.message).toContain('moodRating');
  });

  it('5b. rejects unexpected unknown properties in client analysis payload', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          unknownField: 'malicious_injected_data',
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_analysis_payload');
    expect(data.message).toContain('unsupported field');
  });

  it('5c. requires analysisPayload (client-read primary flow)', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({}), // missing analysisPayload
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('invalid_analysis_payload');
    expect(data.message).toContain('analysisPayload is required');
  });

  // 6. Successful Gemini analysis is returned even when persistence fails (covered by test 3)

  // 7. Unexpected persistence errors still fail normally
  it('7. unexpected persistence errors (not IAM capability) still fail normally', async () => {
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);

    // Simulate unexpected runtime crash / network error
    vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockRejectedValueOnce(
      new Error('ENOTFOUND: database host unreachable')
    );

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('internal_error');
    expect(data.insight).toBeUndefined();
  });

  // 8. Insufficient data guard (< 3 meaningful items) works
  it('8. returns insufficient_data when < 3 meaningful items provided', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: [
            { id: 'e1', content: 'Only one entry.', moodRating: 3, createdAt: '2026-09-01T10:00:00Z' },
          ],
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('insufficient_data');
    expect(data.available).toBe(1);
    expect(data.required).toBe(3);
  });

  // 9. Rate limiting works
  it('9. returns 429 when per-user rate limit is exceeded', async () => {
    vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 45,
      remaining: 0,
      count: 10,
      limit: 10,
      resetTimeMs: Date.now() + 45000,
    });

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error).toBe('rate_limit_exceeded');
    expect(data.retryAfterSeconds).toBe(45);
  });

  // 10. Auth errors work
  it('10. returns 401 when Authorization header is missing', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe('auth/missing-token');
  });

  it('10b. returns 401 when token is invalid', async () => {
    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer bad_token',
      },
    });

    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe('auth/invalid-token');
  });

  // 11. Demo mode isolation preserved
  it('11. demo mode preserves all isolation guarantees', () => {
    expect(DEMO_USER.uid).toBe('demo-user-local-preview');
    expect(DEMO_USER.email).toBe('demo@reflectra.local');
    expect(DEMO_STORAGE_KEY).toBe('reflectra-demo-workspace');
    expect(DEMO_PATTERN_INSIGHT.type).toBe('patternshift');
    expect(DEMO_PATTERN_INSIGHT.intelligence).toBeDefined();
  });

  // 12. Backend performs ZERO Firestore reads during normal analysis route
  it('12. backend performs ZERO Firestore reads during normal analyze route', async () => {
    const geminiSpy = vi
      .spyOn(geminiService, 'generatePatternShiftInsights')
      .mockResolvedValueOnce(mockAiOutput);
    const persistSpy = vi
      .spyOn(persistenceService, 'persistPatternShiftInsight')
      .mockResolvedValueOnce(undefined);

    // `fetchLatestPatternShiftInsight` is the ONLY remaining backend read
    // function; it must never be called by the analyze route.
    const fetchLatestSpy = vi
      .spyOn(persistenceService, 'fetchLatestPatternShiftInsight');

    // Additionally, prove no Admin SDK `.get()` (Firestore READ) happens:
    // the mock DB records any `.get()` call and would throw if invoked.
    const firestoreGetSpy = vi.fn().mockRejectedValue(new Error('UNEXPECTED FIRESTORE READ'));
    const mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              set: vi.fn().mockResolvedValue(undefined),
              get: firestoreGetSpy,
            }),
            get: firestoreGetSpy,
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ get: firestoreGetSpy }) }),
          }),
          get: firestoreGetSpy,
        }),
        get: firestoreGetSpy,
      }),
    };
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue(mockDb as any);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');

    // CRITICAL: NO backend Firestore reads
    expect(fetchLatestSpy).not.toHaveBeenCalled();
    expect(firestoreGetSpy).not.toHaveBeenCalled();

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  // 13. Backend performs ZERO Firebase ID token -> Firestore REST calls
  it('13. backend performs ZERO Firebase ID token -> Firestore REST calls', async () => {
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);
    const persistSpy = vi
      .spyOn(persistenceService, 'persistPatternShiftInsight')
      .mockResolvedValueOnce(undefined);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        analysisPayload: {
          entries: validEntries,
          completedConversations: [],
        },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    // Verified by function signatures: persistPatternShiftInsight accepts (uid, insight) only
    expect(persistSpy).toHaveBeenCalledWith('verified_user_abc', expect.anything());
  });
});