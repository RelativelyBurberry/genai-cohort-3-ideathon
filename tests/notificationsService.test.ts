import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Notification Preferences Service tests.
 *
 * These test the pure/mapping and parsing behavior that does not
 * require a live Firestore: defaults, snapshot mapping resilience,
 * date formatting, and fail-safe behavior. Firestore I/O is mocked.
 */

// Mock the firebase module so the service can be imported in isolation.
vi.mock('../src/firebase', () => ({
  db: {},
}));

// We'll build a lightweight local re-implementation of the mapping
// logic against the service's exported functions where practical.
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  recordNotificationDelivered,
} from '../src/services/notificationsService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../src/types/notifications';

// Mock firebase/firestore primitives used by the service.
vi.mock('firebase/firestore', () => {
  const serverTimestamp = () => ({ serverTimestamp: true });
  return {
    serverTimestamp,
    doc: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    onSnapshot: vi.fn(),
  };
});

const { getDoc, setDoc, updateDoc, doc } = await import('firebase/firestore');

describe('Notification Preferences Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getNotificationPreferences', () => {
    it('returns defaults with null timestamps when the document does not exist', async () => {
      (getDoc as any).mockResolvedValueOnce({ exists: () => false });

      const result = await getNotificationPreferences('uid-1');
      expect(result).toEqual({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        createdAt: null,
        updatedAt: null,
        lastNotificationAt: null,
        lastNotificationDate: null,
      });
    });

    it('maps a valid document into typed preferences', async () => {
      const fakeData = {
        enabled: true,
        preferredTime: '20:00',
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        maxDailyNotifications: 1,
        lastNotificationAt: { seconds: 100, nanoseconds: 0 },
        lastNotificationDate: '2026-01-14',
        notificationPermission: 'granted',
        createdAt: { seconds: 50, nanoseconds: 0 },
        updatedAt: { seconds: 60, nanoseconds: 0 },
      };
      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        id: 'notifications',
        data: () => fakeData,
      });

      const result = await getNotificationPreferences('uid-1');
      expect(result.enabled).toBe(true);
      expect(result.preferredTime).toBe('20:00');
      expect(result.quietHoursStart).toBe('22:00');
      expect(result.quietHoursEnd).toBe('08:00');
      expect(result.lastNotificationDate).toBe('2026-01-14');
      expect(result.notificationPermission).toBe('granted');
      expect(result.lastNotificationAt).toEqual({
        seconds: 100,
        nanoseconds: 0,
      });
    });

    it('tolerates malformed / partially-missing documents (fail safe)', async () => {
      const fakeData = {
        // Missing most fields deliberately.
        notificationPermission: 'weird-value',
        maxDailyNotifications: 'not-a-number',
      };
      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        id: 'notifications',
        data: () => fakeData,
      });
      const result = await getNotificationPreferences('uid-1');
      expect(result.enabled).toBe(false);
      expect(result.preferredTime).toBeNull();
      expect(result.notificationPermission).toBe('default');
      expect(result.maxDailyNotifications).toBe(
        DEFAULT_NOTIFICATION_PREFERENCES.maxDailyNotifications
      );
    });

    it('rejects empty UID', async () => {
      await expect(getNotificationPreferences('')).rejects.toThrow(
        /Unauthorized/
      );
    });
  });

  describe('saveNotificationPreferences', () => {
    it('uses merge so anti-spam fields are not clobbered', async () => {
      (setDoc as any).mockResolvedValueOnce(undefined);
      await saveNotificationPreferences('uid-1', {
        enabled: true,
        preferredTime: '20:00',
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        notificationPermission: 'granted',
      });
      const args = (setDoc as any).mock.calls[0];
      expect(args[1]).toMatchObject({ enabled: true, preferredTime: '20:00' });
      // merge flag must be set to true (never clobber anti-spam fields)
      expect(args[2]).toEqual({ merge: true });
      // lastNotification fields must NOT be present in the written data.
      expect(args[1]).not.toHaveProperty('lastNotificationAt');
      expect(args[1]).not.toHaveProperty('lastNotificationDate');
    });
  });

  describe('recordNotificationDelivered', () => {
    it('writes lastNotificationDate for the local date', async () => {
      (updateDoc as any).mockResolvedValueOnce(undefined);
      const now = new Date(2026, 0, 15, 10, 30, 0);
      await recordNotificationDelivered('uid-1', now);
      const args = (updateDoc as any).mock.calls[0];
      expect(args[1]).toHaveProperty('lastNotificationDate', '2026-01-15');
      expect(args[1]).toHaveProperty('lastNotificationAt');
      expect(args[1].lastNotificationAt).toHaveProperty('serverTimestamp', true);
    });
  });
});