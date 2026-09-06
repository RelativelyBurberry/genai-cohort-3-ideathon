import { describe, it, expect } from 'vitest';
import {
  evaluateSmartNudge,
  localDateString,
  isDailyLimitExceeded,
  isWithinPreferredTime,
} from '../src/intelligence/smartNudge';
import {
  NUDGE_PRIORITY,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type SmartNudge,
} from '../src/types/notifications';

function makePrefs(
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    createdAt: null,
    updatedAt: null,
    lastNotificationAt: null,
    lastNotificationDate: null,
    ...overrides,
  };
}

// Notification text is always generic; these phrases must never appear.
const FORBIDDEN_TEXT = [
  'journal',
  'entry',
  'reflection text',
  'you wrote',
  'location',
  'crisis',
  'mood',
  'summary',
  'Gemini',
];

function assertSafeText(nudge: SmartNudge) {
  const combined = `${nudge.title} ${nudge.body} ${nudge.reason}`.toLowerCase();
  for (const phrase of FORBIDDEN_TEXT) {
    expect(combined).not.toContain(phrase);
  }
}

describe('Smart Nudge Engine — deterministic decision', () => {
  const now = new Date(2026, 0, 15, 14, 0, 0); // Jan 15 2026 14:00

  describe('Guardrails', () => {
    it('disabled notifications → null even with unfinished reflection', () => {
      const prefs = makePrefs({ enabled: false, notificationPermission: 'granted' });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('permission not granted → null (browser delivery must be blocked)', () => {
      const prefs = makePrefs({ enabled: true, notificationPermission: 'default' });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('permission denied → null', () => {
      const prefs = makePrefs({ enabled: true, notificationPermission: 'denied' });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('inside quiet hours (normal range) → null', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        quietHoursEnabled: true,
        quietHoursStart: '09:00',
        quietHoursEnd: '17:00',
      });
      const nudge = evaluateSmartNudge(prefs, {
        now, // 14:00 inside 09:00–17:00
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('outside quiet hours (normal range) → allowed', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        quietHoursEnabled: true,
        quietHoursStart: '09:00',
        quietHoursEnd: '17:00',
      });
      const evening = new Date(2026, 0, 15, 20, 0, 0);
      const nudge = evaluateSmartNudge(prefs, {
        now: evening,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('unfinished_reflection');
    });

    it('quiet hours crossing midnight suppress at 03:00', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });
      const at3am = new Date(2026, 0, 15, 3, 0, 0);
      const nudge = evaluateSmartNudge(prefs, {
        now: at3am,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('quiet hours disabled → never blocks', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        quietHoursEnabled: false,
      });
      const nudge = evaluateSmartNudge(prefs, {
        now: new Date(2026, 0, 15, 23, 0, 0),
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('unfinished_reflection');
    });

    it('daily limit reached (notified today) → null', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        lastNotificationDate: localDateString(now),
      });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: prefs.lastNotificationDate,
      });
      expect(nudge).toBeNull();
    });

    it('daily limit not reached (notified yesterday) → allowed', () => {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        lastNotificationDate: localDateString(yesterday),
      });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: prefs.lastNotificationDate,
      });
      expect(nudge?.type).toBe('unfinished_reflection');
    });
  });

  describe('Priority ordering', () => {
    it('unfinished reflection has the highest priority', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        preferredTime: '14:10', // near now → preferred_time would also match
      });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: now.getTime() - 20 * 60 * 1000, // recent activity → no inactivity
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('unfinished_reflection');
      expect(nudge?.priority).toBe(NUDGE_PRIORITY.UNFINISHED_REFLECTION);
      expect(nudge?.priority).toBeGreaterThan(NUDGE_PRIORITY.PREFERRED_TIME);
    });

    it('preferred time fires when no higher-priority nudge exists', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        preferredTime: '14:00',
      });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: now.getTime() - 60 * 60 * 1000, // 1h ago → not inactive
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('preferred_time');
      expect(nudge?.priority).toBe(NUDGE_PRIORITY.PREFERRED_TIME);
    });

    it('preferred time uses a tolerance window (not exact millisecond)', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        preferredTime: '14:00',
      });
      const nudge = evaluateSmartNudge(prefs, {
        now: new Date(2026, 0, 15, 14, 2, 30), // +2m30s
        hasUnfinishedReflection: false,
        lastActivityAt: now.getTime(),
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('preferred_time');
    });

    it('inactivity fires only after the threshold', () => {
      const prefs = makePrefs({ enabled: true, notificationPermission: 'granted' });
      const inactive = now.getTime() - 4 * 24 * 60 * 60 * 1000; // 4 days ago
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: inactive,
        lastNotificationDate: null,
      });
      expect(nudge?.type).toBe('inactivity');
      expect(nudge?.priority).toBe(NUDGE_PRIORITY.INACTIVITY);
    });

    it('inactivity does not fire before the threshold', () => {
      const prefs = makePrefs({ enabled: true, notificationPermission: 'granted' });
      const recent = now.getTime() - 2 * 24 * 60 * 60 * 1000; // 2 days ago (< 3)
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: recent,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('inactivity with no known activity → null (no condition)', () => {
      const prefs = makePrefs({ enabled: true, notificationPermission: 'granted' });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });

    it('no meaningful condition → null', () => {
      const prefs = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        preferredTime: null, // no preferred time
      });
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: now.getTime() - 60 * 1000, // active now
        lastNotificationDate: null,
      });
      expect(nudge).toBeNull();
    });
  });

  describe('Privacy-safe generic text', () => {
    const prefs = makePrefs({ enabled: true, notificationPermission: 'granted' });

    it('unfinished reflection text is safe and generic', () => {
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: null,
        lastNotificationDate: null,
      });
      expect(nudge).not.toBeNull();
      assertSafeText(nudge!);
    });

    it('preferred time text is safe and generic', () => {
      const p = makePrefs({
        enabled: true,
        notificationPermission: 'granted',
        preferredTime: '14:00',
      });
      const nudge = evaluateSmartNudge(p, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: now.getTime(),
        lastNotificationDate: null,
      });
      expect(nudge).not.toBeNull();
      assertSafeText(nudge!);
      expect(nudge!.title).toBe('A moment to reflect');
      expect(nudge!.body).toContain('your space is here');
    });

    it('inactivity text is gentle and never guilt-inducing', () => {
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: false,
        lastActivityAt: now.getTime() - 10 * 24 * 60 * 60 * 1000,
        lastNotificationDate: null,
      });
      expect(nudge).not.toBeNull();
      assertSafeText(nudge!);
      const text = `${nudge!.title} ${nudge!.body}`.toLowerCase();
      expect(text).not.toContain('streak');
      expect(text).not.toContain('productive');
      expect(text).not.toContain('need to reflect');
      expect(text).not.toContain('guilt');
    });

    it('never leaks raw reflection content', () => {
      // Even with an extreme scenario, the nudge text must not reference content.
      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: true,
        lastActivityAt: now.getTime() - 30 * 24 * 60 * 60 * 1000,
        lastNotificationDate: null,
      });
      expect(nudge).not.toBeNull();
      expect(nudge!.title).toBe('Continue your reflection');
      expect(nudge!.body).toBe(
        'You have a reflection waiting whenever you\u2019re ready.'
      );
    });
  });

  describe('Helper functions', () => {
    it('localDateString formats YYYY-MM-DD', () => {
      expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(localDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('isDailyLimitExceeded', () => {
      const today = new Date(2026, 0, 15, 10, 0, 0);
      expect(isDailyLimitExceeded(null, 1, today)).toBe(false);
      expect(isDailyLimitExceeded('2026-01-15', 1, today)).toBe(true);
      expect(isDailyLimitExceeded('2026-01-14', 1, today)).toBe(false);
    });

    it('isWithinPreferredTime handles wrap-around at midnight', () => {
      expect(
        isWithinPreferredTime('23:58', new Date(2026, 0, 15, 0, 1, 0), 5)
      ).toBe(true);
      expect(
        isWithinPreferredTime('00:02', new Date(2026, 0, 15, 23, 59, 0), 5)
      ).toBe(true);
      expect(
        isWithinPreferredTime('12:00', new Date(2026, 0, 15, 14, 0, 0), 5)
      ).toBe(false);
    });
  });
});