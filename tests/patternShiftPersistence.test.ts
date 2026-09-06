import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as adminHelper from '../server/firebaseAdmin.js';
import {
  fetchLatestPatternShiftInsight,
} from '../server/services/patternShiftPersistence.js';
import {
  BackendReadUnavailableError,
  BackendPersistenceUnavailableError,
  isAdminPermissionDeniedError,
  withBackendReadCapability,
} from '../server/services/privilegedPersistence.js';

describe('PatternShift backend-owned read/persistence remediation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchLatestPatternShiftInsight uses the Admin SDK when capability exists', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'insight_1',
          data: () => ({
            generatedAt: '2026-09-04T12:00:00Z',
            timeRange: { start: '2026-09-01', end: '2026-09-04' },
            itemCount: { entries: 3, completedConversations: 1, total: 4 },
            metrics: {},
            observations: ['Observation 1'],
            suggestedInquiries: ['Prompt 1'],
            type: 'patternshift',
          }),
        },
      ],
    });
    const adminDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ get: mockGet }),
            }),
          }),
        }),
      }),
    };
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue(adminDb as any);

    const insight = await fetchLatestPatternShiftInsight('user_123');

    expect(insight).toBeDefined();
    expect(insight!.id).toBe('insight_1');
    expect(adminDb.collection).toHaveBeenCalledWith('users');
  });

  it('maps an Admin SDK PERMISSION_DENIED read failure to BackendReadUnavailableError', async () => {
    const permissionErr: any = new Error('PERMISSION_DENIED: no Firestore IAM in sandbox');
    permissionErr.code = 7;

    const mockGet = vi.fn().mockRejectedValue(permissionErr);
    const adminDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ get: mockGet }),
            }),
          }),
        }),
      }),
    };
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue(adminDb as any);

    await expect(fetchLatestPatternShiftInsight('user_123')).rejects.toBeInstanceOf(
      BackendReadUnavailableError
    );
  });

  it('does NOT map arbitrary read errors to capability errors', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('random backend bug'));
    const adminDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ get: mockGet }),
            }),
          }),
        }),
      }),
    };
    vi.spyOn(adminHelper, 'getAdminDb').mockReturnValue(adminDb as any);

    await expect(fetchLatestPatternShiftInsight('user_123')).rejects.toThrow('random backend bug');
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

  it('verifies fetchLatestPatternShiftInsight accepts ONLY the uid (no Firebase ID token argument)', () => {
    // Signature assertion: callers cannot accidentally forward a token.
    expect(fetchLatestPatternShiftInsight.length).toBe(1);
  });
});