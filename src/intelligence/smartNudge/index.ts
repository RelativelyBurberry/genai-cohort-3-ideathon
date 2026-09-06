/**
 * Smart Nudge Engine — deterministic, privacy-conscious reminder decision.
 *
 * The engine NEVER calls Gemini and NEVER reads raw journal/reflection
 * content. Its inputs are minimal, privacy-safe signals:
 *   - Notification preferences (owner-scoped config)
 *   - Whether an active Guided Reflection has an unanswered user turn
 *   - The timestamp of the most recent meaningful activity (journal entry
 *     or reflection message)
 *
 * Decision flow (priority order):
 *   1. Eligibility guardrails (enabled, permission granted, outside quiet
 *      hours, daily anti-spam limit not reached) — if ANY fails, return null.
 *   2. Priority 1: Unfinished reflection (active conversation with
 *      unanswered user turn).
 *   3. Priority 2: Preferred time (current time within tolerance of the
 *      user-selected reminder window).
 *   4. Priority 3: Gentle inactivity (no recent activity beyond a
 *      conservative threshold).
 *
 * Returns null when no meaningful condition exists, or a SmartNudge with
 * generic, privacy-safe title/body and explainable internal `reason`.
 */

import type {
  NotificationPreferences,
  SmartNudge,
  SmartNudgeType,
} from '../../types/notifications';
import { NUDGE_PRIORITY, DEFAULT_INACTIVITY_THRESHOLD_DAYS } from '../../types/notifications';
import { isOutsideQuietHours } from './quietHours';

/** Nudge text is guaranteed generic — never derived from user content. */
const GENERIC_COPY: Record<
  SmartNudgeType,
  { title: string; body: string }
> = {
  unfinished_reflection: {
    title: 'Continue your reflection',
    body: 'You have a reflection waiting whenever you\u2019re ready.',
  },
  preferred_time: {
    title: 'A moment to reflect',
    body: 'If now feels like a good time, your space is here.',
  },
  inactivity: {
    title: 'Your space is here',
    body: 'No pressure. Reflect whenever it feels right.',
  },
};

/** Private-phrase mapping for the explainable `reason` metadata. */
const REASONS: Record<SmartNudgeType, string> = {
  unfinished_reflection:
    'An active Guided Reflection contains an unanswered user turn.',
  preferred_time:
    'This reminder is based on the time you selected in settings.',
  inactivity:
    'This gentle reminder appears after some time without activity.',
};

export interface SmartNudgeContext {
  /** Current time, defaulting to `new Date()`. */
  now: Date;
  /** True when an active Guided Reflection has an unanswered user turn. */
  hasUnfinishedReflection: boolean;
  /**
   * Timestamp (ms since epoch) of the most recent meaningful activity —
   * latest journal entry or reflection message. Null/undefined if none.
   */
  lastActivityAt: number | null;
  /** Local date string (YYYY-MM-DD) of the last real notification. */
  lastNotificationDate: string | null;
  /** Override for the inactivity threshold (days). Tests may pass a value. */
  inactivityThresholdDays?: number;
}

/** Format the current local date as YYYY-MM-DD. */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whether a new real notification is allowed today given the daily
 * anti-spam limit. Compare the user's local date with the stored
 * last-notification date.
 */
export function isDailyLimitExceeded(
  lastNotificationDate: string | null,
  maxDailyNotifications: number,
  now: Date
): boolean {
  if (!lastNotificationDate) return false;
  const today = localDateString(now);
  // Phase 13 keeps anti-spam simple: allow a new one only when the
  // stored date differs from today (i.e. once per calendar day).
  if (lastNotificationDate === today) {
    return true; // already notified today
  }
  // If maxDailyNotifications somehow exceeds 1 in future config, the
  // guardrail still resolves to a single today-window.
  return (maxDailyNotifications ?? 1) < 1;
}

/**
 * Whether the current time is within tolerance of the user's preferred
 * reminder minute. Uses a window around the configured HH:mm to avoid
 * requiring an exact millisecond match and to avoid duplicate firing
 * during re-renders (the daily anti-spam guardrail is the ultimate
 * protection against duplicates).
 */
export function isWithinPreferredTime(
  preferredTime: string | null | undefined,
  now: Date,
  toleranceMinutes = 5
): boolean {
  if (!preferredTime) return false;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(preferredTime.trim());
  if (!match) return false;

  const targetMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(currentMinutes - targetMinutes);

  // Handle wrap-around at midnight (e.g. preferred 23:58, now 00:01).
  const wrappedDiff = Math.min(diff, 1440 - diff);
  return wrappedDiff <= toleranceMinutes;
}

/**
 * Core deterministic nudge evaluator.
 *
 * Returns a SmartNudge when a meaningful condition exists AND all
 * eligibility guardrails pass. Returns null otherwise.
 *
 * The eligibility guardrails (enabled, permission, quiet hours, daily
 * limit) are evaluated here so the caller gets a single decision point.
 */
export function evaluateSmartNudge(
  preferences: NotificationPreferences,
  context: SmartNudgeContext
): SmartNudge | null {
  const now = context.now;

  /* ------------------------------------------------------------------
   * Eligibility guardrails.
   * ------------------------------------------------------------------ */

  // 1. Notifications must be explicitly enabled.
  if (!preferences.enabled) return null;

  // 2. Browser permission must be granted. If the user has not granted
  //    permission, we never fire a real (browser) nudge. The in-app
  //    fallback is handled by the delivery layer, not here.
  if (preferences.notificationPermission !== 'granted') return null;

  // 3. Outside quiet hours.
  if (
    !isOutsideQuietHours(
      now,
      preferences.quietHoursEnabled,
      preferences.quietHoursStart,
      preferences.quietHoursEnd
    )
  ) {
    return null;
  }

  // 4. Daily anti-spam limit.
  if (
    isDailyLimitExceeded(
      context.lastNotificationDate,
      preferences.maxDailyNotifications,
      now
    )
  ) {
    return null;
  }

  /* ------------------------------------------------------------------
   * Priority 1 — Unfinished reflection (highest).
   * ------------------------------------------------------------------ */
  if (context.hasUnfinishedReflection) {
    return {
      type: 'unfinished_reflection',
      title: GENERIC_COPY.unfinished_reflection.title,
      body: GENERIC_COPY.unfinished_reflection.body,
      priority: NUDGE_PRIORITY.UNFINISHED_REFLECTION,
      reason: REASONS.unfinished_reflection,
    };
  }

  /* ------------------------------------------------------------------
   * Priority 2 — Preferred reflection time.
   * ------------------------------------------------------------------ */
  if (isWithinPreferredTime(preferences.preferredTime, now)) {
    return {
      type: 'preferred_time',
      title: GENERIC_COPY.preferred_time.title,
      body: GENERIC_COPY.preferred_time.body,
      priority: NUDGE_PRIORITY.PREFERRED_TIME,
      reason: REASONS.preferred_time,
    };
  }

  /* ------------------------------------------------------------------
   * Priority 3 — Gentle inactivity.
   * ------------------------------------------------------------------ */
  const thresholdDays =
    context.inactivityThresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS;
  if (thresholdDays > 0 && context.lastActivityAt != null) {
    const cutoff = now.getTime() - thresholdDays * 24 * 60 * 60 * 1000;
    if (context.lastActivityAt < cutoff) {
      return {
        type: 'inactivity',
        title: GENERIC_COPY.inactivity.title,
        body: GENERIC_COPY.inactivity.body,
        priority: NUDGE_PRIORITY.INACTIVITY,
        reason: REASONS.inactivity,
      };
    }
  }

  /* ------------------------------------------------------------------
   * No meaningful condition.
   * ------------------------------------------------------------------ */
  return null;
}
