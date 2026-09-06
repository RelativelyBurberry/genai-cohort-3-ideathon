/**
 * Notification Delivery Service — Phase 13.
 *
 * A narrow service responsible for delivering a Smart Nudge through
 * either the browser Notification API or the in-app fallback.
 *
 * Privacy rules are enforced at the caller (engine) level: the nudge
 * title/body are always generic. This service only deals with the
 * mechanics of delivery.
 */

import type {
  NudgeDeliveryResult,
  SmartNudge,
  TestNotificationResult,
  NotificationPermissionState,
} from '../types/notifications';

/** Whether the browser exposes the Notification API. */
export function isNotificationApiAvailable(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current Notification permission (or 'default' if API unavailable). */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationApiAvailable()) return 'default';
  const perm = window.Notification.permission as NotificationPermissionState;
  return perm === 'granted' || perm === 'denied' ? perm : 'default';
}

/**
 * Request browser notification permission.
 *
 * PRIVACY: This is ONLY called from an explicit user gesture (e.g. the
 * "Enable Notifications" button in Settings). It is never invoked on
 * login, app load, or during onboarding.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationApiAvailable()) return 'default';
  try {
    const perm = await window.Notification.requestPermission();
    return (perm as NotificationPermissionState) === 'granted' ||
      perm === 'denied'
      ? (perm as NotificationPermissionState)
      : 'default';
  } catch {
    // Some environments throw instead of resolving. Treat as unhandled.
    return 'default';
  }
}

/** The app icon, if configured and available. */
function appIcon(): string | undefined {
  // Reflectra serves favicon/icon; if one is missing this is simply
  // undefined and the browser falls back to its default.
  return '/favicon.ico';
}

/**
 * Deliver a real Smart Nudge via the browser Notification API.
 *
 * Returns a result the UI can use to decide whether to show the
 * in-app fallback.
 */
export function sendSmartNudge(nudge: SmartNudge): NudgeDeliveryResult {
  if (!isNotificationApiAvailable()) {
    return { delivered: false, reason: 'unsupported' };
  }

  const permission = window.Notification.permission;
  if (permission === 'denied') {
    return { delivered: false, reason: 'permission-denied' };
  }
  if (permission !== 'granted') {
    return { delivered: false, reason: 'permission-default' };
  }

  try {
    // eslint-disable-next-line no-new
    new window.Notification(nudge.title, {
      body: nudge.body,
      icon: appIcon(),
      tag: `reflectra-${nudge.type}`, // same tag dedupes identical nudges
    });
    return { delivered: true, via: 'browser' };
  } catch {
    return { delivered: false, reason: 'blocked' };
  }
}

/**
 * Send a "Test Reminder" (hackathon demo capability).
 *
 * This NEVER modifies anti-spam tracking, requires no inactivity, and
 * requires no unfinished conversation. It strictly respects browser
 * permission availability and reports success/failure honestly.
 */
export function sendTestNotification(): TestNotificationResult {
  if (!isNotificationApiAvailable()) {
    return {
      sent: false,
      reason: 'unsupported',
      message:
        'This browser does not support notifications. We\u2019ll show reminders in-app instead.',
    };
  }

  const permission = window.Notification.permission;
  if (permission === 'denied') {
    return {
      sent: false,
      reason: 'permission-denied',
      message:
        'Notifications are blocked by your browser. You can enable them in browser settings.',
    };
  }
  if (permission !== 'granted') {
    return {
      sent: false,
      reason: 'permission-default',
      message:
        'Notifications have not been allowed yet. Enable notifications first.',
    };
  }

  try {
    // eslint-disable-next-line no-new
    new window.Notification('Reflectra', {
      body: 'Smart reminders are ready when you are.',
      icon: appIcon(),
    });
    return { sent: true, via: 'browser' };
  } catch {
    return {
      sent: false,
      reason: 'blocked',
      message: 'The browser blocked this notification. Please check browser settings.',
    };
  }
}
