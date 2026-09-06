import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { patternShiftRouter } from '../server/routes/patternShift.js';
import * as adminHelper from '../server/firebaseAdmin.js';
import * as rateLimiter from '../server/services/rateLimiter.js';
import * as geminiService from '../server/services/geminiService.js';
import * as persistenceService from '../server/services/patternShiftPersistence.js';
import { BackendReadUnavailableError } from '../server/services/privilegedPersistence.js';

describe('Milestone 5 PatternShift Routes (client-read primary)', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Mock Firebase Admin Auth
    vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'valid_token') {
          return { uid: 'user_123', email: 'user@example.com' };
        }
        if (token === 'user_other_token') {
          return { uid: 'user_other', email: 'other@example.com' };
        }
        const err: any = new Error('Invalid token');
        err.code = 'auth/argument-error';
        throw err;
      }),
    } as any);

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
    { id: 'e1', content: 'First entry about work stress.', moodRating: 2, tags: ['work', 'stress'], createdAt: '2026-09-01T10:00:00Z' },
    { id: 'e2', content: 'Second entry about a creative side project.', moodRating: 5, tags: ['creativity', 'passion'], createdAt: '2026-09-02T10:00:00Z' },
    { id: 'e3', content: 'Third entry about calm.', moodRating: 4, tags: ['mindfulness'], createdAt: '2026-09-03T10:00:00Z' },
  ];

  describe('POST /api/patternshift/analyze', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error).toBe('auth/missing-token');
    });

    it('returns 401 when token is invalid', async () => {
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

    it('returns 400 when analysisPayload is missing (client-read primary requires it)', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('invalid_analysis_payload');
      expect(data.message).toContain('analysisPayload is required');
    });

    it('returns 429 when per-user rate limit is exceeded', async () => {
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
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: { entries: validEntries, completedConversations: [] },
        }),
      });

      const data = await res.json();
      expect(res.status).toBe(429);
      expect(data.error).toBe('rate_limit_exceeded');
      expect(data.message).toBe(`Too many pattern analysis requests. Please retry in ${45} seconds.`);
      expect(data.retryAfterSeconds).toBe(45);
    });

    it('returns insufficient_data and NEVER calls Gemini when < 3 items exist', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      const geminiSpy = vi.spyOn(geminiService, 'generatePatternShiftInsights');
      const persistSpy = vi.spyOn(persistenceService, 'persistPatternShiftInsight');

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: {
            entries: [
              { id: 'e1', content: 'My only reflection so far.', moodRating: 3, createdAt: new Date().toISOString() },
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

      // CRITICAL VERIFICATION: Gemini is NOT called and nothing is persisted
      expect(geminiSpy).not.toHaveBeenCalled();
      expect(persistSpy).not.toHaveBeenCalled();
    });

    it('executes analysis from the CLIENT PAYLOAD, invokes Gemini, and persists insight when >= 3 items exist', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      const geminiSpy = vi
        .spyOn(geminiService, 'generatePatternShiftInsights')
        .mockResolvedValueOnce({
          observations: [
            'Over recent reflections, creative pursuits consistently coincide with higher mood ratings.',
          ],
          suggestedInquiries: [
            'What specific aspects of creative projects bring you the most clarity?',
          ],
        });

      const persistSpy = vi
        .spyOn(persistenceService, 'persistPatternShiftInsight')
        .mockResolvedValueOnce(undefined);

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: {
            entries: validEntries,
            completedConversations: [
              {
                id: 'c1',
                title: 'Deep dive on work balance',
                summary: 'Explored sustainable pace and creative outlets.',
                createdAt: '2026-09-03T10:00:00Z',
              },
            ],
          },
        }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight).toBeDefined();
      expect(data.insight.observations).toHaveLength(1);
      expect(data.insight.suggestedInquiries).toHaveLength(1);
      expect(data.insight.itemCount.total).toBe(4);

      expect(geminiSpy).toHaveBeenCalledTimes(1);
      // SECURITY: persistPatternShiftInsight is called WITHOUT a user token
      // because backend-owned writes use privileged Admin SDK only.
      expect(persistSpy).toHaveBeenCalledWith('user_123', expect.anything());
    });

    it('returns 503 service_unavailable (not a misleading 500) when Gemini configuration is broken', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      // Reproduce the runtime failure: secret provider cannot supply the key.
      vi.spyOn(geminiService, 'generatePatternShiftInsights').mockRejectedValueOnce(
        new Error('GEMINI_CONFIGURATION_ERROR: GEMINI_API_KEY could not be retrieved from secret provider.')
      );
      const persistSpy = vi.spyOn(persistenceService, 'persistPatternShiftInsight');

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: { entries: validEntries, completedConversations: [] },
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.error).toBe('service_unavailable');
      expect(data.message).toContain('AI configuration is incomplete');
      // FAIL CLOSED: no fake insights, nothing persisted.
      expect(persistSpy).not.toHaveBeenCalled();
      expect(data.insight).toBeUndefined();
    });

    it('includes the Phase 10 evidence-grounded intelligence block in a successful insight', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce({
        observations: ['A gentle observation.'],
        suggestedInquiries: ['A gentle question?'],
      });
      vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockResolvedValueOnce(undefined);

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: {
            entries: [
              { id: 'e7', content: 'Oldest entry.', moodRating: 2, tags: ['self-awareness', 'patterns'], location: { label: 'Paris, France' }, createdAt: '2026-08-30T07:30:00Z' },
              { id: 'e6', content: 'Down day.', moodRating: 2, tags: ['stress', 'coping'], createdAt: '2026-09-05T15:00:00Z' },
              { id: 'e5', content: 'Calm evening.', moodRating: 5, tags: ['evening', 'mindfulness', 'peace'], location: { label: 'London, United Kingdom' }, createdAt: '2026-09-06T18:50:00Z' },
              { id: 'e4', content: 'Grateful.', moodRating: 4, tags: ['gratitude', 'small-moments', 'wellbeing'], location: { label: 'Brooklyn, New York' }, createdAt: '2026-09-10T19:15:00Z' },
              { id: 'e3', content: 'Night thoughts.', moodRating: 4, tags: ['boundaries', 'courage', 'self-compassion'], createdAt: '2026-09-12T01:30:00Z' },
              { id: 'e2', content: 'Boundaries at work.', moodRating: 3, tags: ['work', 'boundaries', 'stress'], createdAt: '2026-09-12T22:30:00Z' },
              { id: 'e1', content: 'Recent reflection.', moodRating: 4, tags: ['mindfulness', 'gratitude', 'evening'], location: { label: 'Brooklyn, New York' }, createdAt: '2026-09-13T21:15:00Z' },
            ],
            completedConversations: [
              { id: 'c1', title: 'Reflecting', summary: 'Explored calm.', createdAt: '2026-09-10T18:40:00Z' },
            ],
          },
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight.intelligence).toBeDefined();
      expect(data.insight.intelligence.moodTrajectory.status).toBe('available');
      expect(data.insight.intelligence.moodTrajectory.trajectory).toBe('upward');
      expect(data.insight.intelligence.reflectionRhythm.status).toBe('available');
      expect(data.insight.intelligence.reflectionFrequency.status).toBe('available');
      expect(data.insight.intelligence.themeEvolution.status).toBe('available');
      expect(data.insight.intelligence.unusualTiming.status).toBe('available');
      expect(data.insight.intelligence.locationPatterns.status).toBe('available');
      expect(data.insight.intelligence.locationPatterns.observation).toContain('Brooklyn, New York');
      // SECURITY: location data must NOT be part of the metrics payload
      expect(JSON.stringify(data.insight.metrics)).not.toContain('Brooklyn');
    });

    it('derives identity ONLY from the verified token and ignores body uid tampering', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce({
        observations: ['A gentle observation.'],
        suggestedInquiries: ['A gentle question?'],
      });
      const persistSpy = vi
        .spyOn(persistenceService, 'persistPatternShiftInsight')
        .mockResolvedValueOnce(undefined);

      await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token', // user_123
        },
        body: JSON.stringify({
          analysisPayload: { entries: validEntries, completedConversations: [] },
          uid: 'victim_user_999', // Attack payload trying to override UID
        }),
      });

      // Verification: persistence is scoped strictly to the verified token uid
      expect(persistSpy).toHaveBeenCalledWith('user_123', expect.anything());
    });

    it('performs ZERO backend Firestore reads during analysis', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      vi.spyOn(geminiService, 'generatePatternShiftInsights').mockResolvedValueOnce({
        observations: ['Obs'],
        suggestedInquiries: ['Q'],
      });
      vi.spyOn(persistenceService, 'persistPatternShiftInsight').mockResolvedValueOnce(undefined);

      const latestReadSpy = vi.spyOn(persistenceService, 'fetchLatestPatternShiftInsight');

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
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          analysisPayload: { entries: validEntries, completedConversations: [] },
        }),
      });

      expect(res.status).toBe(200);
      expect(latestReadSpy).not.toHaveBeenCalled();
      expect(firestoreGetSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/patternshift/latest', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/patternshift/latest`, {
        method: 'GET',
      });

      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error).toBe('auth/missing-token');
    });

    it('returns latest insight for the verified user', async () => {
      const mockInsight = {
        id: 'ins_1',
        generatedAt: '2026-09-04T12:00:00Z',
        timeRange: { start: '2026-09-01', end: '2026-09-04' },
        itemCount: { entries: 3, completedConversations: 1, total: 4 },
        metrics: {} as any,
        observations: ['Observation 1'],
        suggestedInquiries: ['Prompt 1'],
        type: 'patternshift',
      };

      vi.spyOn(persistenceService, 'fetchLatestPatternShiftInsight').mockResolvedValueOnce(
        mockInsight
      );

      const res = await fetch(`${baseUrl}/api/patternshift/latest`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight.id).toBe('ins_1');
      expect(persistenceService.fetchLatestPatternShiftInsight).toHaveBeenCalledWith('user_123');
    });

    it('returns null insight gracefully when no previous insights exist', async () => {
      vi.spyOn(persistenceService, 'fetchLatestPatternShiftInsight').mockResolvedValueOnce(null);

      const res = await fetch(`${baseUrl}/api/patternshift/latest`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight).toBeNull();
      expect(persistenceService.fetchLatestPatternShiftInsight).toHaveBeenCalledWith('user_123');
    });

    it('returns null insight gracefully when backend Firestore read IAM is unavailable', async () => {
      vi.spyOn(persistenceService, 'fetchLatestPatternShiftInsight').mockRejectedValueOnce(
        new BackendReadUnavailableError('fetchLatestPatternShiftInsight')
      );

      const res = await fetch(`${baseUrl}/api/patternshift/latest`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight).toBeNull();
    });
  });
});