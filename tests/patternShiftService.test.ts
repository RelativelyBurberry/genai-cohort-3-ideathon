import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/journalService', () => ({
  getJournalEntries: vi.fn(),
}));
vi.mock('../src/services/reflectionService', () => ({
  getConversations: vi.fn(),
}));

import { triggerPatternAnalysis } from '../src/services/patternShiftService';
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

describe('patternShiftService triggerPatternAnalysis (remediation fallback)', () => {
  const getIdToken = vi.fn().mockResolvedValue('client_id_token');
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getJournalEntries).mockReset();
    vi.mocked(getConversations).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through a normal success response with persistence metadata', async () => {
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
    // Normal flow: single request, empty body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody).toEqual({});
  });

  it('builds a minimal payload from client reads and retries when the server requests it', async () => {
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

    // First call: backend has no Firestore read capability.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'client_data_required', message: 'Provide records and retry.' })
      )
      // Second call: analysis succeeds with the client-supplied payload.
      .mockResolvedValueOnce(
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.analysisPayload.entries[0]).toMatchObject({
      id: 'entry_1',
      content: 'A calm morning.',
      moodRating: 4,
      tags: ['gratitude'],
      // PRIVACY: only the label leaves the device — never coordinates.
      location: { label: 'Brooklyn, New York' },
    });
    expect(retryBody.analysisPayload.entries[0].location.latitude).toBeUndefined();
    expect(retryBody.analysisPayload.entries[0].location.longitude).toBeUndefined();
    expect(retryBody.analysisPayload.completedConversations[0]).toMatchObject({
      id: 'conv_1',
      summary: 'Explored boundaries.',
    });
  });

  it('does not attempt a client retry when no uid is available', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'client_data_required', message: 'Provide records and retry.' })
    );

    const parsed = await triggerPatternAnalysis(getIdToken as any, undefined);

    expect(parsed.status).toBe('client_data_required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getJournalEntries).not.toHaveBeenCalled();
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

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'client_data_required', message: 'x' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'insufficient_data',
          required: 3,
          available: 0,
          message: 'More data required.',
        })
      );

    const parsed = await triggerPatternAnalysis(getIdToken as any, 'user_client');

    // Active conversations are excluded → empty payload → insufficient_data.
    expect(parsed.status).toBe('insufficient_data');
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.analysisPayload.completedConversations).toHaveLength(0);
  });
});