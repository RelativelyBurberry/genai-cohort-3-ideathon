import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { patternShiftRouter } from '../server/routes/patternShift.js';
import * as adminHelper from '../server/firebaseAdmin.js';
import * as rateLimiter from '../server/services/rateLimiter.js';
import * as geminiService from '../server/services/geminiService.js';
import * as persistenceService from '../server/services/patternShiftPersistence.js';

describe('Milestone 5 PatternShift Routes', () => {
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

      // User has only 1 entry and 0 completed conversations
      vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockResolvedValueOnce([
        {
          id: 'e1',
          content: 'My only reflection so far.',
          moodRating: 3,
          createdAt: new Date().toISOString(),
        },
      ]);
      vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([]);

      const geminiSpy = vi.spyOn(geminiService, 'generatePatternShiftInsights');
      const persistSpy = vi.spyOn(persistenceService, 'persistPatternShiftInsight');

      const res = await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
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

    it('executes analysis, invokes Gemini, and persists insight when >= 3 items exist', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      vi.spyOn(persistenceService, 'fetchUserEntriesForPatternShift').mockResolvedValueOnce([
        {
          id: 'e1',
          content: 'First entry about work stress.',
          moodRating: 2,
          tags: ['work', 'stress'],
          createdAt: '2026-09-01T10:00:00Z',
        },
        {
          id: 'e2',
          content: 'Second entry about a creative side project.',
          moodRating: 5,
          tags: ['creativity', 'passion'],
          createdAt: '2026-09-02T10:00:00Z',
        },
      ]);

      vi.spyOn(persistenceService, 'fetchUserConversationsForPatternShift').mockResolvedValueOnce([
        {
          id: 'c1',
          title: 'Deep dive on work balance',
          status: 'completed',
          summary: 'Explored sustainable pace and creative outlets.',
          createdAt: '2026-09-03T10:00:00Z',
        },
      ]);

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
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.insight).toBeDefined();
      expect(data.insight.observations).toHaveLength(1);
      expect(data.insight.suggestedInquiries).toHaveLength(1);
      expect(data.insight.itemCount.total).toBe(3);

      expect(geminiSpy).toHaveBeenCalledTimes(1);
      // SECURITY: persistPatternShiftInsight is called WITHOUT a user token
      // because backend-owned writes use privileged Admin SDK only.
      expect(persistSpy).toHaveBeenCalledWith('user_123', expect.anything());
    });

    it('strictly isolates data lookup by verified token UID and ignores body tampering', async () => {
      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValueOnce({
        allowed: true,
        retryAfterSeconds: 0,
        remaining: 9,
        count: 1,
        limit: 10,
        resetTimeMs: Date.now() + 60000,
      });

      const fetchEntriesSpy = vi
        .spyOn(persistenceService, 'fetchUserEntriesForPatternShift')
        .mockResolvedValueOnce([]);
      const fetchConvsSpy = vi
        .spyOn(persistenceService, 'fetchUserConversationsForPatternShift')
        .mockResolvedValueOnce([]);

      await fetch(`${baseUrl}/api/patternshift/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token', // user_123
        },
        body: JSON.stringify({
          uid: 'victim_user_999', // Attack payload trying to override UID
        }),
      });

      // Verification: Lookups are strictly for user_123
      expect(fetchEntriesSpy).toHaveBeenCalledWith('user_123', 'valid_token');
      expect(fetchConvsSpy).toHaveBeenCalledWith('user_123', 'valid_token');
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
      expect(persistenceService.fetchLatestPatternShiftInsight).toHaveBeenCalledWith('user_123', 'valid_token');
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
      expect(persistenceService.fetchLatestPatternShiftInsight).toHaveBeenCalledWith('user_123', 'valid_token');
    });
  });

});