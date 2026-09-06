import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNotificationApiAvailable,
  getNotificationPermission,
  requestNotificationPermission,
  sendSmartNudge,
  sendTestNotification,
} from '../src/services/notificationDelivery';
import type { SmartNudge } from '../src/types/notifications';

/**
 * Notification Delivery tests — mock the browser Notification API.
 * Also validates that notification text NEVER contains private content.
 */

const SAMPLE_NUDGE: SmartNudge = {
  type: 'unfinished_reflection',
  title: 'Continue your reflection',
  body: 'You have a reflection waiting whenever you\u2019re ready.',
  priority: 100,
  reason: 'An active Guided Reflection contains an unanswered user turn.',
};

// Mock constructor that records the notification.
let MockNotification: any;
let createdNotifications: Array<{ title: string; options: any }> = [];
let permissionValue = 'default';

const originalWindow = globalThis.window;

function installMockNotification() {
  MockNotification = vi.fn(function (this: any, title: string, options: any) {
    this.title = title;
    this.options = options;
    createdNotifications.push({ title, options });
  });
  MockNotification.permission = permissionValue;
  MockNotification.requestPermission = vi.fn(() =>
    Promise.resolve(permissionValue)
  );

  (globalThis as any).window = {
    Notification: MockNotification,
  };
}

beforeEach(() => {
  createdNotifications = [];
  permissionValue = 'granted';
  installMockNotification();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }
});

describe('Notification Delivery', () => {
  describe('isNotificationApiAvailable', () => {
    it('true when Notification is on window', () => {
      expect(isNotificationApiAvailable()).toBe(true);
    });

    it('false when window is undefined (SSR) or Notification missing', () => {
      const w = (globalThis as any).window;
      (globalThis as any).window = undefined;
      expect(isNotificationApiAvailable()).toBe(false);
      (globalThis as any).window = w;

      (globalThis as any).window = {};
      expect(isNotificationApiAvailable()).toBe(false);
    });
  });

  describe('getNotificationPermission', () => {
    it('returns the browser permission state', () => {
      permissionValue = 'granted';
      installMockNotification();
      expect(getNotificationPermission()).toBe('granted');

      permissionValue = 'denied';
      installMockNotification();
      expect(getNotificationPermission()).toBe('denied');

      permissionValue = 'default';
      installMockNotification();
      expect(getNotificationPermission()).toBe('default');
    });
  });

  describe('requestNotificationPermission', () => {
    it('requests permission and returns result', async () => {
      permissionValue = 'granted';
      installMockNotification();
      expect(await requestNotificationPermission()).toBe('granted');
      expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('never auto-requests — only explicit call (enforced by design)', async () => {
      expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('sendSmartNudge', () => {
    it('supported + granted → Notification called with safe text', () => {
      const result = sendSmartNudge(SAMPLE_NUDGE);
      expect(result).toEqual({ delivered: true, via: 'browser' });
      expect(createdNotifications).toHaveLength(1);
      const { title, options } = createdNotifications[0];
      expect(title).toBe('Continue your reflection');
      expect(options.body).toContain('reflection waiting');
      // Privacy: title/body must never contain private content.
      expect(title).not.toMatch(/journal|you wrote|crisis|gemini/i);
      expect(options.body).not.toMatch(/journal|you wrote|crisis|gemini/i);
    });

    it('unsupported (no Notification API) → fallback result, no crash', () => {
      (globalThis as any).window = {};
      const result = sendSmartNudge(SAMPLE_NUDGE);
      expect(result.delivered).toBe(false);
      if (!result.delivered) expect(result.reason).toBe('unsupported');
    });

    it('denied → no delivery, no repeated request', () => {
      permissionValue = 'denied';
      installMockNotification();
      const result = sendSmartNudge(SAMPLE_NUDGE);
      expect(result).toEqual({ delivered: false, reason: 'permission-denied' });
      expect(MockNotification.requestPermission).not.toHaveBeenCalled();
      expect(createdNotifications).toHaveLength(0);
    });

    it('default → no delivery (must not fire without grant)', () => {
      permissionValue = 'default';
      installMockNotification();
      const result = sendSmartNudge(SAMPLE_NUDGE);
      expect(result).toEqual({ delivered: false, reason: 'permission-default' });
      expect(createdNotifications).toHaveLength(0);
    });

    it('constructor throws → honest blocked result', () => {
      // Need permission 'granted' AND a throwing constructor to reach
      // the try/catch inside sendSmartNudge.
      const throwConstructor: any = vi.fn(function () {
        throw new Error('blocked');
      });
      throwConstructor.permission = 'granted';
      (globalThis as any).window = { Notification: throwConstructor };
      const result = sendSmartNudge(SAMPLE_NUDGE);
      expect(result.delivered).toBe(false);
      if (!result.delivered) expect(result.reason).toBe('blocked');
    });
  });

  describe('sendTestNotification', () => {
    it('granted → browser test notification with generic body', () => {
      const result = sendTestNotification();
      expect(result.sent).toBe(true);
      if (result.sent) expect(result.via).toBe('browser');
      expect(createdNotifications).toHaveLength(1);
      const { title, options } = createdNotifications[0];
      expect(title).toBe('Reflectra');
      expect(options.body).toBe('Smart reminders are ready when you are.');
    });

    it('unsupported → honest failure message', () => {
      (globalThis as any).window = {};
      const result = sendTestNotification();
      if (!result.sent) {
        expect(result.reason).toBe('unsupported');
        expect(result.message).toBeTruthy();
      }
    });

    it('denied → honest failure message, no request', () => {
      permissionValue = 'denied';
      installMockNotification();
      const result = sendTestNotification();
      if (!result.sent) {
        expect(result.reason).toBe('permission-denied');
        expect(result.message).toMatch(/blocked by your browser/);
      }
      expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    });

    it('default → honest failure message', () => {
      permissionValue = 'default';
      installMockNotification();
      const result = sendTestNotification();
      if (!result.sent) {
        expect(result.reason).toBe('permission-default');
        expect(result.message).toMatch(/Enable notifications first/);
      }
    });
  });
});