import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { reflectionRouter } from '../server/routes/reflection';
import * as adminHelper from '../server/firebaseAdmin';
import * as conversationService from '../server/services/conversationService';
import * as rateLimiter from '../server/services/rateLimiter';
import * as geminiService from '../server/services/geminiService';

describe('Milestone 3 Reflection & Summarization Routes', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Mock Firebase Admin Auth verifyIdToken
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
    app.use(reflectionRouter);

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

  describe('POST /api/reflect', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error).toBe('auth/missing-token');
    });

    it('returns 401 when token is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer bad_token',
        },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error).toBe('auth/invalid-token');
    });

    it('returns 400 when conversationId is invalid or missing', async () => {
      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('invalid_request');
    });

    it('returns 404 when conversation does not exist under verified user UID', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ conversationId: 'conv_missing' }),
      });

      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toBe('conversation_not_found');
      expect(conversationService.getConversation).toHaveBeenCalledWith('user_123', 'conv_missing');
    });

    it('returns 409 when conversation is already completed', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Completed reflection',
        summary: 'Done',
        status: 'completed',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(409);
      expect(data.error).toBe('conversation_completed');
    });

    it('enforces deterministic pre-AI crisis screener and bypasses Gemini on self-harm language', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Active reflection',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      vi.spyOn(conversationService, 'getAuthoritativeMessages').mockResolvedValue([
        {
          id: 'msg_1',
          role: 'user',
          content: 'I want to kill myself',
          createdAt: null,
        },
      ]);

      const geminiSpy = vi.spyOn(geminiService, 'generateReflectionResponse');
      const rateLimitSpy = vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit');

      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.crisisSupportRequired).toBe(true);
      expect(data.assistantMessage).toBeNull();
      // CRITICAL: Gemini must NOT be called
      expect(geminiSpy).not.toHaveBeenCalled();
      // CRITICAL: Crisis screening must happen before rate limiting
      expect(rateLimitSpy).not.toHaveBeenCalled();
    });

    it('enforces rate limit before calling Gemini', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Active reflection',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      vi.spyOn(conversationService, 'getAuthoritativeMessages').mockResolvedValue([
        {
          id: 'msg_1',
          role: 'user',
          content: 'I am reflecting on my goals today.',
          createdAt: null,
        },
      ]);

      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValue({
        allowed: false,
        count: 10,
        limit: 10,
        remaining: 0,
        resetTimeMs: Date.now() + 45000,
        retryAfterSeconds: 45,
      });

      const geminiSpy = vi.spyOn(geminiService, 'generateReflectionResponse');

      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('45');
      expect(data.error).toBe('rate_limit_exceeded');
      expect(data.retryAfterSeconds).toBe(45);
      expect(geminiSpy).not.toHaveBeenCalled();
    });

    it('successfully calls Gemini and persists assistant message for legitimate reflection', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Active reflection',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      vi.spyOn(conversationService, 'getAuthoritativeMessages').mockResolvedValue([
        {
          id: 'msg_1',
          role: 'user',
          content: 'I feel anxious about tomorrow.',
          createdAt: null,
        },
      ]);

      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValue({
        allowed: true,
        count: 1,
        limit: 10,
        remaining: 9,
        resetTimeMs: Date.now() + 60000,
        retryAfterSeconds: 0,
      });

      vi.spyOn(geminiService, 'generateReflectionResponse').mockResolvedValue(
        'What feels like the heaviest part of tomorrow for you?'
      );

      vi.spyOn(conversationService, 'persistAssistantMessage').mockResolvedValue({
        id: 'msg_assist_1',
        role: 'assistant',
        content: 'What feels like the heaviest part of tomorrow for you?',
        createdAt: null,
      });

      const res = await fetch(`${baseUrl}/api/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ conversationId: 'conv_1' }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.conversationId).toBe('conv_1');
      expect(data.message.role).toBe('assistant');
      expect(data.message.content).toBe('What feels like the heaviest part of tomorrow for you?');

      expect(conversationService.persistAssistantMessage).toHaveBeenCalledWith(
        'user_123',
        'conv_1',
        'What feels like the heaviest part of tomorrow for you?'
      );
    });
  });

  describe('POST /api/conversations/:id/summarize', () => {
    it('returns 404 if conversation does not exist under verified UID', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/conversations/conv_404/summarize`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toBe('conversation_not_found');
    });

    it('returns 409 if conversation is already completed', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Completed reflection',
        summary: 'Existing summary',
        status: 'completed',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      const res = await fetch(`${baseUrl}/api/conversations/conv_1/summarize`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(409);
      expect(data.error).toBe('already_completed');
    });

    it('handles summarization failure gracefully without changing conversation status', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Active reflection',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      vi.spyOn(conversationService, 'getAuthoritativeMessages').mockResolvedValue([
        { id: 'm1', role: 'user', content: 'Turn 1', createdAt: null },
        { id: 'm2', role: 'assistant', content: 'Turn 2', createdAt: null },
      ]);

      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValue({
        allowed: true,
        count: 2,
        limit: 10,
        remaining: 8,
        resetTimeMs: Date.now() + 60000,
        retryAfterSeconds: 0,
      });

      vi.spyOn(geminiService, 'generateConversationSummary').mockRejectedValue(
        new Error('Temporary API error')
      );

      const completeSpy = vi.spyOn(conversationService, 'completeAndSummarizeConversation');

      const res = await fetch(`${baseUrl}/api/conversations/conv_1/summarize`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.error).toBe('summarization_failed');
      // Conversation status must NOT have transitioned
      expect(completeSpy).not.toHaveBeenCalled();
    });

    it('successfully generates summary and atomically completes conversation', async () => {
      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        id: 'conv_1',
        title: 'Active reflection',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      });

      vi.spyOn(conversationService, 'getAuthoritativeMessages').mockResolvedValue([
        { id: 'm1', role: 'user', content: 'Turn 1', createdAt: null },
        { id: 'm2', role: 'assistant', content: 'Turn 2', createdAt: null },
      ]);

      vi.spyOn(rateLimiter, 'checkAndIncrementRateLimit').mockResolvedValue({
        allowed: true,
        count: 2,
        limit: 10,
        remaining: 8,
        resetTimeMs: Date.now() + 60000,
        retryAfterSeconds: 0,
      });

      vi.spyOn(geminiService, 'generateConversationSummary').mockResolvedValue(
        'Key Themes: Personal Growth\nNotable Thoughts: Clarity achieved.'
      );

      const completeSpy = vi.spyOn(
        conversationService,
        'completeAndSummarizeConversation'
      ).mockResolvedValue(undefined);

      const res = await fetch(`${baseUrl}/api/conversations/conv_1/summarize`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.conversationId).toBe('conv_1');
      expect(data.status).toBe('completed');
      expect(data.summary).toContain('Key Themes');
      expect(completeSpy).toHaveBeenCalledWith(
        'user_123',
        'conv_1',
        'Key Themes: Personal Growth\nNotable Thoughts: Clarity achieved.',
        undefined
      );
    });
  });
});
