import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/journalService', () => ({
  getJournalEntries: vi.fn(),
}));
vi.mock('../src/services/reflectionService', () => ({
  getConversations: vi.fn(),
}));

import { triggerPatternAnalysis, parsePatternShiftApiResponse, buildAnalysisPayload } from '../src/services/patternShiftService';
import { getJournalEntries } from '../src/services/journalService';
import { getConversations } from '../src/services/reflectionService';
import type { JournalEntry } from '../src/types/journal';
import type { Conversation } from '../src/types/reflection';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('patternShiftService — client-read primary architecture', () => {
  const getIdToken = vi.fn().mockResolvedValue('client_id_token');
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getJournalEntries).mockReset();
    vi.mocked(getConversations).mockReset();
    // Default: no records (client-read primary still sends empty payload).
    vi.mocked(getJournalEntries).mockResolvedValue([]);
    vi.mocked(getConversations).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through a canonical success response with persistence metadata', async () => {
    const insight = {
      id: 'insight_1',
      observations: [],
      suggestedInquiries: [],
      type: 'patternshift',
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'success',
        insight,
        persistence: { persisted: true },
      })
    );

    const parsed = await triggerPatternAnalysis(getIdToken as any, 'user_client');
    expect(parsed.status).toBe('success');
    if (parsed.status === 'success') {
      expect(parsed.insight.id).toBe('insight_1');
      expect(parsed.persistence).toEqual({ persisted: true });
    }
    // Single direct request with payload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveProperty('analysisPayload');
    expect(body.analysisPayload.entries).toBeDefined();
    expect(body.analysisPayload.completedConversations).toBeDefined();
  });

  it('builds a minimal payload from client reads and sends it in the single request', async () => {
    const DATE = new Date('2026-09-01T10:00:00Z');

    const entries: JournalEntry[] = [
      {
        id: 'entry_1',
        title: 'Morning',
        content: 'A calm morning.',
        moodRating: 4,
        tags: ['gratitude'],
        wordCount: 7,
        crisisFlagged: false,
        createdAt: DATE as any,
        updatedAt: DATE as any,
        location: { latitude: 40.7128, longitude: -74.006, label: 'Brooklyn, New York' },
      },
    ];
    const conversations: Conversation[] = [
      {
        id: 'conv_1',
        title: 'Reflection session',
        summary: 'Explored boundaries.',
        status: 'completed',
        createdAt: DATE as any,
        updatedAt: DATE as any,
        summaryUpdatedAt: DATE as any,
      },
    ];

    vi.mocked(getJournalEntries).mockResolvedValue(entries);
    vi.mocked(getConversations).mockResolvedValue(conversations);

    // Single request succeeds
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'success',
        insight: { id: 'insight_2', observations: [], suggestedInquiries: [], type: 'patternshift' },
        persistence: { persisted: false, reason: 'backend_persistence_unavailable' },
      })
    );

    const parsed = await triggerPatternAnalysis(getIdToken as any, 'user_client');

    expect(parsed.status).toBe('success');
    if (parsed.status === 'success') {
      expect(parsed.insight.id).toBe('insight_2');
      expect(parsed.persistence).toEqual({
        persisted: false,
        reason: 'backend_persistence_unavailable',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.analysisPayload.entries[0]).toMatchObject({
      id: 'entry_1',
      content: 'A calm morning.',
      moodRating: 4,
      tags: ['gratitude'],
      // PRIVACY: only the label leaves the device — never coordinates.
      location: { label: 'Brooklyn, New York' },
    });
    expect(requestBody.analysisPayload.entries[0].location.latitude).toBeUndefined();
    expect(requestBody.analysisPayload.entries[0].location.longitude).toBeUndefined();
    expect(requestBody.analysisPayload.completedConversations[0]).toMatchObject({
      id: 'conv_1',
      summary: 'Explored boundaries.',
    });
  });

  it('returns auth error when no uid is available', async () => {
    const parsed = await triggerPatternAnalysis(getIdToken as any, undefined);

    expect(parsed.status).toBe('error');
    expect(parsed.error).toBe('authentication_required');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getJournalEntries).not.toHaveBeenCalled();
    expect(getConversations).not.toHaveBeenCalled();
  });

  it('treats active conversations as excluded from the payload', async () => {
    const DATE = new Date('2026-09-01T10:00:00Z');
    vi.mocked(getJournalEntries).mockResolvedValue([]);
    vi.mocked(getConversations).mockResolvedValue([
      {
        id: 'conv_active',
        title: 'Active session',
        summary: null,
        status: 'active',
        createdAt: DATE as any,
        updatedAt: DATE as any,
        summaryUpdatedAt: null,
      },
    ]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'insufficient_data',
        required: 3,
        available: 0,
        message: 'More data required.',
      })
    );

    const parsed = await triggerPatternAnalysis(getIdToken as any, 'user_client');

    expect(parsed.status).toBe('insufficient_data');
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.analysisPayload.completedConversations).toHaveLength(0);
  });

  it('returns error when client data reads fail', async () => {
    vi.mocked(getJournalEntries).mockRejectedValue(new Error('permission denied'));
    vi.mocked(getConversations).mockResolvedValue([]);

    const parsed = await triggerPatternAnalysis(getIdToken as any, 'user_client');

    expect(parsed.status).toBe('error');
    expect(parsed.error).toBe('client_data_unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('parsePatternShiftApiResponse — canonical contract validation', () => {
    it('parses canonical success with persistence', async () => {
      const res = jsonResponse({
        status: 'success',
        insight: { id: 'i1', type: 'patternshift' },
        persistence: { persisted: true },
      });
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('success');
      if (parsed.status === 'success') {
        expect(parsed.insight.id).toBe('i1');
        expect(parsed.persistence.persisted).toBe(true);
      }
    });

    it('parses insufficient_data', async () => {
      const res = jsonResponse({
        status: 'insufficient_data',
        required: 3,
        available: 1,
        message: 'Need more data.',
      });
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('insufficient_data');
      if (parsed.status === 'insufficient_data') {
        expect(parsed.required).toBe(3);
        expect(parsed.available).toBe(1);
      }
    });

    it('handles 429 rate limit with retry hint', async () => {
      const res = jsonResponse({
        error: 'rate_limit_exceeded',
        message: 'Too many requests.',
        retryAfterSeconds: 30,
      }, 429);
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('error');
      if (parsed.status === 'error') {
        expect(parsed.error).toBe('rate_limit_exceeded');
        expect(parsed.retryAfterSeconds).toBe(30);
      }
    });

    it('handles non-2xx server errors', async () => {
      const res = jsonResponse({
        error: 'service_unavailable',
        message: 'Gemini unavailable.',
      }, 503);
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('error');
      if (parsed.status === 'error') {
        expect(parsed.error).toBe('service_unavailable');
      }
    });

    it('rejects unexpected response shapes', async () => {
      const res = jsonResponse({
        someOtherField: 'value',
      });
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('error');
      if (parsed.status === 'error') {
        expect(parsed.error).toBe('unexpected_response');
        expect(parsed.message).toContain('unexpected response format');
      }
    });

    it('rejects 2xx success without insight', async () => {
      const res = jsonResponse({ status: 'success' }); // missing insight
      const parsed = parsePatternShiftApiResponse(res, await res.json());
      expect(parsed.status).toBe('error');
      if (parsed.status === 'error') {
        expect(parsed.error).toBe('unexpected_response');
      }
    });
  });
});