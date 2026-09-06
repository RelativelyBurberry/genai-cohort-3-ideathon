import { Timestamp } from 'firebase/firestore';

/**
 * Reflectra Smart Nudge & Notification Types — Phase 13.
 *
 * These types describe the privacy-conscious, deterministic reminder
 * system. Notification content is ALWAYS generic and NEVER contains
 * journal/reflection text, Gemini output, location, or emotional
 * classification.
 */

/* ------------------------------------------------------------------ */
/* Notification Preferences                                             */
/* ------------------------------------------------------------------ */

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

/**
 * Owner-scoped notification preferences, persisted under
 * /users/{uid}/preferences/notifications.
 *
 * The document is deliberately minimal — it stores configuration and
 * anti-spam bookkeeping only (last notification date). It does NOT
 * store message history or any journal/reflection content.
 */
export interface NotificationPreferences {
  /** Master switch — notifications only fire when true. */
  enabled: boolean;

  /** Preferred reminder time in HH:mm (24-hour), e.g. "20:00". Null = unset. */
  preferredTime: string | null;

  /** Whether quiet hours suppress notifications. */
  quietHoursEnabled: boolean;

  /** Quiet-hours start in HH:mm (24-hour). Null = unset. */
  quietHoursStart: string | null;

  /** Quiet-hours end in HH:mm (24-hour). Null = unset. */
  quietHoursEnd: string | null;

  /** Daily ceiling on real (non-test) notifications. Defaults to 1. */
  maxDailyNotifications: number;

  /** Timestamp of the last real notification delivered. Null = never. */
  lastNotificationAt: Timestamp | null;

  /** Local date (YYYY-MM-DD) of the last real notification. Null = never. */
  lastNotificationDate: string | null;

  /** Current browser Notification permission state, snapshot on change. */
  notificationPermission: NotificationPermissionState;

  createdAt: Timestamp | null;

  updatedAt: Timestamp | null;
}

/**
 * Defaults applied when a preferences document does not yet exist.
 * Smart reminders are OPT-OUT: disabled by default.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferences,
  'createdAt' | 'updatedAt' | 'lastNotificationAt' | 'lastNotificationDate'
> = {
  enabled: false,
  preferredTime: '20:00', // Reflectra default: 8:00 PM
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  maxDailyNotifications: 1, // Gentle — maximum one real reminder per day
  notificationPermission: 'default',
};

/**
 * Input shape used when creating/updating preferences.
 * Client may only write configuration fields + updatedAt (server).
 * lastNotification fields are written by the delivery layer.
 */
export type NotificationPreferencesInput = Partial<
  Pick<
    NotificationPreferences,
    | 'enabled'
    | 'preferredTime'
    | 'quietHoursEnabled'
    | 'quietHoursStart'
    | 'quietHoursEnd'
    | 'maxDailyNotifications'
    | 'notificationPermission'
  >
>;

/* ------------------------------------------------------------------ */
/* Smart Nudge                                                         */
/* ------------------------------------------------------------------ */

export type SmartNudgeType =
  | 'unfinished_reflection'
  | 'preferred_time'
  | 'inactivity';

/**
 * A deterministic nudge evaluated by the Smart Nudge Engine.
 * Content is always generic and privacy-safe.
 */
export interface SmartNudge {
  type: SmartNudgeType;
  title: string;
  body: string;
  /** Deterministic priority — higher is more important. */
  priority: number;
  /** Internal, explainable metadata (never displayed raw). */
  reason: string;
}

/**
 * Constants describing nudge priority levels.
 */
export const NUDGE_PRIORITY = {
  UNFINISHED_REFLECTION: 100,
  PREFERRED_TIME: 60,
  INACTIVITY: 30,
} as const;

/**
 * Built-in inactivity threshold (days) — conservative default.
 */
export const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 3;

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/**
 * Result of attempting to deliver a nudge through the browser
 * Notification API or the in-app fallback.
 */
export type NudgeDeliveryResult =
  | { delivered: true; via: 'browser' }
  | { delivered: true; via: 'in-app'; label: 'in-app' }
  | {
      delivered: false;
      reason:
        | 'unsupported'
        | 'permission-denied'
        | 'permission-default'
        | 'blocked';
    };

/**
 * Outcome of a "Send Test Reminder" click. Test notifications never
 * modify anti-spam tracking.
 */
export type TestNotificationResult =
  | { sent: true; via: 'browser' | 'in-app' }
  | {
      sent: false;
      reason: 'unsupported' | 'permission-denied' | 'permission-default' | 'blocked';
      message: string;
    };

/* ------------------------------------------------------------------ */
/* Phase 14 — External Notification Channels                          */
/* ------------------------------------------------------------------ */

/**
 * Channel-specific notification configuration.
 *
 * PRIVACY GUARANTEE:
 * - Browser: controlled by browser permission API
 * - Email: user preference (opt-in)
 * - Discord: user preference + server-stored secret (URL never returned to client)
 *
 * These settings extend the base NotificationPreferences without breaking
 * the existing Phase 13 schema.
 */
export interface NotificationChannelConfig {
  /** Browser/PWA notifications (Phase 13) */
  browser: {
    enabled: boolean;
  };
  /** Email reminders (Phase 14) */
  email: {
    enabled: boolean;
  };
  /** Discord webhook integration (Phase 14) */
  discord: {
    enabled: boolean;
    /** Whether a webhook URL has been configured (stored server-side) */
    configured: boolean;
    /** Masked hint showing last 4 characters of webhook URL (e.g., "...aB9X") */
    webhookHint?: string | null;
  };
}

/**
 * Default channel configuration.
 * All external channels are DISABLED by default (privacy-first).
 */
export const DEFAULT_CHANNEL_CONFIG: NotificationChannelConfig = {
  browser: { enabled: false },
  email: { enabled: false },
  discord: { enabled: false, configured: false, webhookHint: null },
};

/* ------------------------------------------------------------------ */
/* Safe Notification Events (Phase 14)                                 */
/* ------------------------------------------------------------------ */

/**
 * Constrained notification event types for external channel dispatch.
 *
 * PRIVACY: These events NEVER contain raw reflection content, Gemini
 * output, mood analysis, location data, or any private user content.
 * Event payloads map to hardcoded, generic notification copy.
 */
export type SafeNotificationEvent =
  | {
      type: 'smart_nudge';
      /** The nudge reason from the deterministic engine */
      reason: 'unfinished_reflection' | 'preferred_time' | 'inactivity';
    }
  | {
      type: 'reflection_completed';
    }
  | {
      type: 'patternshift_ready';
    };

/**
 * Event type string literal for routing.
 */
export type NotificationEventType = SafeNotificationEvent['type'];

/**
 * Generic notification content derived from safe event types.
 * Content is ALWAYS hardcoded — never AI-generated, never user content.
 */
export interface GenericNotificationContent {
  title: string;
  body: string;
  /** Event type for analytics/debugging (not displayed to user) */
  eventType: NotificationEventType;
}

/**
 * Result of attempting delivery through an external channel.
 */
export type ExternalChannelDeliveryResult =
  | { delivered: true; channel: 'email' | 'discord' }
  | {
      delivered: false;
      channel: 'email' | 'discord';
      reason: 'not_configured' | 'disabled' | 'provider_unavailable' | 'send_failed';
      message?: string;
    };

/**
 * Combined result for multi-channel dispatch.
 */
export interface ChannelDispatchResult {
  browser: NudgeDeliveryResult;
  email?: ExternalChannelDeliveryResult;
  discord?: ExternalChannelDeliveryResult;
}
