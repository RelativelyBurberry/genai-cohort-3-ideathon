import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as adminHelper from '../server/firebaseAdmin.js';
import {
  fetchUserEntriesForPatternShift,
  fetchUserConversationsForPatternShift,
  fetchLatestPatternShiftInsight,
} from '../server/services/patternShiftPersistence.js';
import {
  BackendReadUnavailableError,
  BackendPersistenceUnavailableError,
  isAdminPermissionDeniedError,
  withBackendReadCapability,
} from '../server/services/privilegedPersistence.js';

describe('PatternShift backend-owned read remediation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchUserEntriesForPatternShift uses the Admin SDK when capability exists', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      docs: [
        {
          id: 'entry_1',
          data: () => ({
            title: 'Today',
            content: 'A calm morning.',
            moodRating: 4,
            tags: ['gratitude'],
            createdAt: '2026-09-01T10:00:00Z',
            updatedAt: '2026-09-01T10:00:00Z',
            location: { label: 'Brooklyn, New York' },
          }),
        },
      ],
    });
    const adminDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({ get: mockGet }),
        }),
      }),
    };
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue(adminDb as any);

    const entries = await fetchUserEntriesForPatternShift('user_123');

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('entry_1');
    expect(entries[0].content).toBe('A calm morning.');
    expect(entries[0].location).toEqual({ label: 'Brooklyn, New York' });
    // The uid is scoped to the caller's collection path
    expect(adminDb.collection).toHaveBeenCalledWith('users');
  });

  it('maps an Admin SDK PERMISSION_DENIED read failure to BackendReadUnavailableError', async () => {
    const permissionErr: any = new Error('PERMISSION_DENIED: no Firestore IAM in sandbox');
    permissionErr.code = 7;

    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            get: vi.fn().mockRejectedValue(permissionErr),
          }),
        }),
      }),
    } as any);

    await expect(fetchUserEntriesForPatternShift('user_123')).rejects.toBeInstanceOf(
      BackendReadUnavailableError
    );
  });

  it('does NOT map arbitrary read errors to capability errors', async () => {
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            get: vi.fn().mockRejectedValue(new Error('random backend bug')),
          }),
        }),
      }),
    } as any);

    await expect(fetchUserEntriesForPatternShift('user_123')).rejects.toThrow('random backend bug');
  });

  it('isAdminPermissionDeniedError only matches verified IAM permission failures', () => {
    const code7: any = new Error('PERMISSION_DENIED');
    code7.code = 7;
    expect(isAdminPermissionDeniedError(code7)).toBe(true);
    expect(isAdminPermissionDeniedError(new Error('random bug'))).toBe(false);
    expect(isAdminPermissionDeniedError('not-an-error')).toBe(false);
  });

  it('withBackendReadCapability wraps IAM failures and passes through others', async () => {
    const code7: any = new Error('PERMISSION_DENIED');
    code7.code = 7;
    await expect(
      withBackendReadCapability('op', () => Promise.reject(code7))
    ).rejects.toBeInstanceOf(BackendReadUnavailableError);

    await expect(
      withBackendReadCapability('op', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');
  });

  it('verifies read functions accept ONLY the uid (no Firebase ID token argument)', () => {
    // Signature assertions: callers cannot accidentally forward a token.
    expect(fetchUserEntriesForPatternShift.length).toBe(1);
    expect(fetchUserConversationsForPatternShift.length).toBe(1);
    expect(fetchLatestPatternShiftInsight.length).toBe(1);
  });
});