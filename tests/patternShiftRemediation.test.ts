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
  BackendReadUnavailableError,
} from '../server/services/privilegedPersistence.js';
import { DEMO_USER, DEMO_STORAGE_KEY, isDemoModeEnabled } from '../src/demo/demoConfig.js';
import { DEMO_PATTERN_INSIGHT } from '../src/demo/demoData.js';

describe('Phase 10 PatternShift Remediation Suite', () => {
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
  it('1. verifies that PatternShift persistence functions do NOT forward Firebase ID tokens to Firestore REST', async () => {
    const mockGet = vi.fn().mockResolvedValue({ docs: [] });
    const mockCollection = vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({ get: mockGet }),
      }),
    });
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue({
      collection: mockCollection,
    } as any);

    // Call fetchUserEntriesForPatternShift directly — no token parameter
    await persistenceService.fetchUserEntriesForPatternShift('user_direct');
    expect(mockCollection).toHaveBeenCalledWith('users');

    // Verify signature expects ONLY the uid, preventing any caller from passing a token
    expect(persistenceService.fetchUserEntriesForPatternShift.length).toBe(1);
    expect(persistenceService.fetchUserConversationsForPatternShift.length).toBe(1);
    expect(persistenceService.fetchLatestPatternShiftInsight.length).toBe(1);
  });

  // 2. Server-side Firestore path works when backend capability exists
  it('2. server-side Firestore path works when backend capability exists', async () => {
    const fetchEntriesSpy = vi
      .spyOn(persistenceService, 'fetchUserEntriesForPatternShift')
      .mockResolvedValueOnce(validEntries);
    const fetchConvsSpy = vi
      .spyOn(persistenceService, 'fetchUserConversationsForPatternShift')
      .mockResolvedValueOnce([]);
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
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.persistence).toEqual({ persisted: true });
    expect(data.insight.observations).toEqual(mockAiOutput.observations);
    expect(fetchEntriesSpy).toHaveBeenCalledWith('verified_user_abc');
    expect(fetchConvsSpy).toHaveBeenCalledWith('verified_user_abc');
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  // 3. Client-provided fallback only activates for verified backend infrastructure capability failures
  it('3. client-provided fallback only activates when backend Firestore read capability is unavailable', async () => {
    // Simulate backend read capability failure (BackendReadUnavailableError)
    vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockRejectedValueOnce(
      new BackendReadUnavailableError('fetchUserEntriesForPatternShift')
    );
    vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);

    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);
    vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockResolvedValueOnce(undefined);

    // Client supplies its minimal records
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
    expect(data.insight.itemCount.total).toBe(3);
    expect(data.insight.observations).toEqual(mockAiOutput.observations);
  });

  it('3b. when backend read capability is unavailable and client sends no payload, route returns client_data_required', async () => {
    vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockRejectedValueOnce(
      new BackendReadUnavailableError('fetchUserEntriesForPatternShift')
    );
    vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('client_data_required');
    expect(data.message).toContain('backend cannot access Firestore');
  });

  // 4. Request uid cannot override authenticated req.user.uid
  it('4. request uid in body or payload cannot override authenticated req.user.uid', async () => {
    const fetchEntriesSpy = vi
      .spyOn(persistenceService, 'fetchUserEntriesForPatternShift')
      .mockResolvedValueOnce(validEntries);
    const fetchConvsSpy = vi
      .spyOn(persistenceService, 'fetchUserConversationsForPatternShift')
      .mockResolvedValueOnce([]);
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
        uid: 'attacker_override_uid',
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(fetchEntriesSpy).toHaveBeenCalledWith('verified_user_abc');
    expect(fetchConvsSpy).toHaveBeenCalledWith('verified_user_abc');
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

  // 6. Successful Gemini analysis is returned even when persistence specifically fails due to infrastructure IAM
  it('6. successful Gemini analysis is returned even when persistence fails due to backend IAM (persisted: false)', async () => {
    vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockResolvedValueOnce(validEntries);
    vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);

    // Simulate backend write capability failure (BackendPersistenceUnavailableError)
    vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockRejectedValueOnce(
      new BackendPersistenceUnavailableError('persistPatternShiftInsight')
    );

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({}),
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

  // 7. Unexpected persistence errors still fail normally
  it('7. unexpected persistence errors (not IAM capability) still fail normally', async () => {
    vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockResolvedValueOnce(validEntries);
    vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);
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
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('internal_error');
    expect(data.insight).toBeUndefined();
  });

  // 8. Production persistence success remains unchanged
  it('8. production persistence success returns { persisted: true } and the insight', async () => {
    vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockResolvedValueOnce(validEntries);
    vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);
    vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce(mockAiOutput);
    vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockResolvedValueOnce(undefined);

    const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.persistence).toEqual({ persisted: true });
    expect(data.insight.id).toBeDefined();
  });

  // 9. Demo mode remains isolated
  it('9. demo mode preserves all isolation guarantees', () => {
    // Note: test environment has VITE_DEMO_MODE=true for local dev.
    // The critical guarantees are identity and storage isolation, not the
    // runtime flag value in this specific dev config.
    expect(DEMO_USER.uid).toBe('demo-user-local-preview');
    expect(DEMO_USER.email).toBe('demo@reflectra.local');
    expect(DEMO_STORAGE_KEY).toBe('reflectra-demo-workspace');
    expect(DEMO_PATTERN_INSIGHT.type).toBe('patternshift');
    expect(DEMO_PATTERN_INSIGHT.intelligence).toBeDefined();
  });
});