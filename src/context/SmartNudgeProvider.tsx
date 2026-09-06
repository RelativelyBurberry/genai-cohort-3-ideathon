import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useAuth } from './AuthContext';
import { useDemo, useIsDemoSession, loadDemoNotificationPrefs } from '../demo';
import type {
  NotificationPreferences,
  SmartNudge,
} from '../types/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../types/notifications';
import {
  subscribeToNotificationPreferences,
  recordNotificationDelivered,
} from '../services/notificationsService';
import {
  getNotificationPermission,
  sendSmartNudge,
} from '../services/notificationDelivery';
import { dispatchSmartNudge } from '../services/integrationsService';
import { evaluateSmartNudge, localDateString } from '../intelligence/smartNudge';

/**
 * SmartNudgeProvider — Phase 13 lifecycle/evaluation hook.
 *
 * Production: subscribes to the owner's Firestore preference document,
 * evaluates the deterministic Smart Nudge Engine at reasonable points
 * (workspace load, foreground, preference change, low-frequency interval),
 * delivers via the browser Notification API, and persists anti-spam
 * bookkeeping only for REAL browser deliveries.
 *
 * Demo: uses localStorage-backed preferences + synthetic workspace
 * signals. Never touches Firestore. The demo "Preview Smart Nudge"
 * trigger runs the SAME deterministic evaluator with safe forced-enable
 * demo conditions and always surfaces the in-app fallback (never faking
 * a system notification).
 *
 * It does NOT use Redux or any new state-management library, requests no
 * permission automatically, and cleans up all timers/listeners on
 * unmount.
 */

interface SmartNudgeContextValue {
  /** Current subscribed preferences (or defaults before loaded). */
  preferences: NotificationPreferences | null;
  /** Whether provider-level evaluation is currently permitted. */
  active: boolean;

  /** The in-app fallback nudge to render, if any (null = none). */
  inAppNudge: SmartNudge | null;

  /** Dismiss the current in-app nudge. */
  dismissInAppNudge: () => void;

  /**
   * Force a manual re-evaluation (used by demo previews).
   * Production callers should let the lifecycle evaluate automatically.
   */
  evaluateNow: (overrides?: {
    hasUnfinishedReflection?: boolean;
    lastActivityAt?: number | null;
  }) => void;

  /**
   * Demo-only: run the deterministic evaluator with safe, forced-enable
   * preview conditions and surface the in-app fallback. Does NOT modify
   * persisted preferences and does NOT fake production data.
   */
  previewDemoNudge: () => void;
}

const SmartNudgeContext = createContext<SmartNudgeContextValue | undefined>(
  undefined
);

/** Low-frequency re-evaluation while the app is open (minutes). */
const EVALUATION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/** In-memory dedupe window for identical nudges (duplicate spam guard). */
const DELIVERY_DEDUPE_MS = 60 * 1000;

/**
 * Delivery dedupe is held in component-scoped refs so each provider
 * mount starts fresh (e.g. after sign-out/sign-in). The persisted
 * `lastNotificationDate` remains the authoritative cross-session
 * anti-spam guardrail.
 */
interface SmartNudgeProviderProps {
  children: React.ReactNode;
  /** Owner UID resolved by the caller (auth user or demo user). */
  uid: string;
}

export const SmartNudgeProvider: React.FC<SmartNudgeProviderProps> = ({
  children,
  uid,
}) => {
  const { user, getIdToken } = useAuth();
  const isDemo = useIsDemoSession();

  // Component-scoped dedupe for identical nudges within the window.
  const recentDeliveriesRef = useRef(new Set<string>());
  const lastDeliveryTsRef = useRef(0);

  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [inAppNudge, setInAppNudge] = useState<SmartNudge | null>(null);

  // Signals used by the evaluator.
  const hasUnfinishedReflectionRef = useRef(false);
  const lastActivityRef = useRef<number | null>(null);
  const prefsRef = useRef<NotificationPreferences | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const intervalRef = useRef<number | null>(null);
  const didLoadRef = useRef(false);

  /** Keep the latest preference value available to the evaluator. */
  useEffect(() => {
    prefsRef.current = preferences;
  }, [preferences]);

  /** Build fresh demo preferences from localStorage (never Firestore). */
  const buildDemoPrefs = useCallback(
    (forceEnabled = false): NotificationPreferences => {
      const demo = loadDemoNotificationPrefs();
      return {
        enabled: forceEnabled ? true : demo.enabled,
        preferredTime: demo.preferredTime,
        quietHoursEnabled: demo.quietHoursEnabled,
        quietHoursStart: demo.quietHoursStart,
        quietHoursEnd: demo.quietHoursEnd,
        maxDailyNotifications: 1,
        lastNotificationAt: null,
        lastNotificationDate: null,
        // Demo previews always use the in-app fallback path, so the
        // permission snapshot is informational only.
        notificationPermission: 'granted',
        createdAt: null,
        updatedAt: null,
      };
    },
    []
  );

  /**
   * Core delivery decision. Evaluates the engine and delivers via
   * browser, else surfaces the in-app fallback. Never requests
   * permission.
   */
  const tryDeliver = useCallback(
    (now: Date, forceInApp = false, prefsOverride?: NotificationPreferences | null) => {
      // Demo: read fresh from localStorage so settings-save is honored.
      let prefs: NotificationPreferences | null =
        prefsOverride === undefined ? prefsRef.current : prefsOverride;
      if (isDemo && prefsOverride === undefined) {
        prefs = buildDemoPrefs();
      }
      if (!prefs) return;

      const nudge = evaluateSmartNudge(prefs, {
        now,
        hasUnfinishedReflection: hasUnfinishedReflectionRef.current,
        lastActivityAt: lastActivityRef.current,
        lastNotificationDate: prefs.lastNotificationDate,
      });

      if (!nudge) return;

      // Duplicate-delivery guard within the dedupe window. Component-
      // scoped so a fresh provider mount (sign-out/sign-in) starts clean;
      // the persisted lastNotificationDate still blocks same-day repeats.
      const nowMs = now.getTime();
      const key = `${localDateString(now)}::${nudge.type}`;
      if (
        nowMs - lastDeliveryTsRef.current < DELIVERY_DEDUPE_MS ||
        recentDeliveriesRef.current.has(key)
      ) {
        return;
      }
      recentDeliveriesRef.current.add(key);
      lastDeliveryTsRef.current = nowMs;

      // Decide delivery path.
      const permission = forceInApp ? null : getNotificationPermission();

      if (!forceInApp && permission === 'granted') {
        const result = sendSmartNudge(nudge);
        if (result.delivered) {
          // Persist anti-spam bookkeeping ONLY for real browser delivery.
          if (uidRef.current && !isDemo) {
            recordNotificationDelivered(uidRef.current, now).catch(() => {
              // Non-fatal: if persistence fails we still don't spam the UI.
            });

            // Phase 14: Dispatch to external channels (non-blocking).
            // The authenticated service attaches the Firebase Bearer token.
            // Fire-and-forget; delivery failures are isolated so the
            // browser/in-app nudge path is NEVER affected.
            dispatchSmartNudge(getIdToken, nudge.type).catch(() => {
              // Non-fatal: external channel failures are isolated
            });
          }
          return;
        }
        // Fall through to in-app fallback (blocked/unsupported).
      }

      // In-app fallback — non-spammy, dismissible.
      setInAppNudge(nudge);
    },
    [isDemo, buildDemoPrefs, getIdToken]
  );

  /** Manual re-evaluation (used by demo previews). */
  const evaluateNow = useCallback(
    (overrides?: {
      hasUnfinishedReflection?: boolean;
      lastActivityAt?: number | null;
    }) => {
      if (overrides?.hasUnfinishedReflection !== undefined) {
        hasUnfinishedReflectionRef.current = overrides.hasUnfinishedReflection;
      }
      if (overrides?.lastActivityAt !== undefined) {
        lastActivityRef.current = overrides.lastActivityAt;
      }
      tryDeliver(new Date());
    },
    [tryDeliver]
  );

  /**
   * Demo-only preview trigger: runs the deterministic evaluator with
   * safe demo conditions (forced-enable, unfinished reflection present,
   * mild inactivity) and always shows the in-app fallback. It does NOT
   * modify persisted demo preferences and works independently of the
   * browser permission state.
   */
  const previewDemoNudge = useCallback(() => {
    if (!isDemo) return;
    const now = new Date();
    // Force the enable gate ONLY for the preview evaluation (never
    // persisted) so the evaluator can return a meaningful Nudge.
    const previewPrefs = buildDemoPrefs(true);
    // Safe demo condition: unfinished reflection present.
    hasUnfinishedReflectionRef.current = true;
    if (lastActivityRef.current == null) {
      lastActivityRef.current = now.getTime() - 4 * 24 * 60 * 60 * 1000;
    }
    tryDeliver(now, true, previewPrefs);
  }, [isDemo, buildDemoPrefs, tryDeliver]);

  const dismissInAppNudge = useCallback(() => setInAppNudge(null), []);

  /**
   * Demo-mode signal wiring: derive unfinished-reflection and
   * last-activity from the synthetic demo workspace. Also load demo
   * preferences into state (informational UI).
   */
  const { hasUnfinishedReflection: demoHasUnfinished, lastActivityAt: demoLastActivity } =
    useDemoNudgesSignals();

  useEffect(() => {
    if (isDemo) {
      hasUnfinishedReflectionRef.current = demoHasUnfinished;
      lastActivityRef.current = demoLastActivity;
      setPreferences(buildDemoPrefs());
    }
  }, [isDemo, demoHasUnfinished, demoLastActivity, buildDemoPrefs]);

  /**
   * Production: subscribe to Firestore preferences whenever the
   * workspace authenticates. Demo mode never touches Firestore.
   */
  useEffect(() => {
    if (isDemo) {
      didLoadRef.current = true;
      return;
    }
    if (!uid || !user?.uid) return;

    let unsub: (() => void) | null = null;

    unsub = subscribeToNotificationPreferences(
      uid,
      (prefs) => {
        // Always reflect the CURRENT browser permission — the stored
        // snapshot may be stale (e.g. user granted it outside Reflectra).
        setPreferences({
          ...prefs,
          notificationPermission: getNotificationPermission(),
        });
      },
      (err) => {
        // Firestore preferences unavailable → do not crash the workspace.
        console.warn('[SmartNudge] Preferences unavailable:', err);
      }
    );

    return () => {
      if (unsub) unsub();
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [uid, user?.uid, isDemo]);

  /**
   * Re-evaluate when preferences change (a fresh doc or an edit) — but
   * skip the initial mount load so we don't double-fire.
   */
  useEffect(() => {
    if (isDemo) return;
    if (!preferences) return;
    if (!didLoadRef.current) {
      didLoadRef.current = true;
      return;
    }
    tryDeliver(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences, isDemo]);

  /**
   * Evaluate on workspace load + low-frequency interval + foreground.
   * Cleanup guarantees no leaked timer or listener.
   */
  useEffect(() => {
    if (isDemo) return; // demos never auto-spam
    if (!uid) return;

    // Initial evaluation shortly after load (data has settled).
    const initialTimer = window.setTimeout(() => {
      tryDeliver(new Date());
    }, 1500);

    // Low-frequency interval.
    intervalRef.current = window.setInterval(() => {
      tryDeliver(new Date());
    }, EVALUATION_INTERVAL_MS);

    // Return-to-foreground re-evaluation.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tryDeliver(new Date());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (initialTimer) window.clearTimeout(initialTimer);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [uid, isDemo, tryDeliver]);

  /**
   * Unmount-only safety net: guarantees no interval or listener is left
   * behind regardless of how the provider is torn down.
   */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const value = useMemo<SmartNudgeContextValue>(
    () => ({
      preferences,
      active: true,
      inAppNudge,
      dismissInAppNudge,
      evaluateNow,
      previewDemoNudge,
    }),
    [preferences, inAppNudge, dismissInAppNudge, evaluateNow, previewDemoNudge]
  );

  return (
    <SmartNudgeContext.Provider value={value}>
      {children}
    </SmartNudgeContext.Provider>
  );
};

export function useSmartNudge(): SmartNudgeContextValue {
  const context = useContext(SmartNudgeContext);
  if (!context) {
    throw new Error('useSmartNudge must be used within a SmartNudgeProvider');
  }
  return context;
}

/**
 * Demo-mode signal adapter. Derives:
 *   - hasUnfinishedReflection: an active demo conversation whose latest
 *     message is a user turn (awaiting an assistant reply).
 *   - lastActivityAt: max journal/conversation timestamp in the demo
 *     workspace.
 */
function useDemoNudgesSignals(): {
  hasUnfinishedReflection: boolean;
  lastActivityAt: number | null;
} {
  const isDemo = useIsDemoSession();
  const { demoConversations, demoJournalEntries, getDemoMessages } = useDemo();

  if (!isDemo) {
    return { hasUnfinishedReflection: false, lastActivityAt: null };
  }

  let hasUnfinishedReflection = false;
  for (const conv of demoConversations) {
    if (conv.status !== 'active') continue;
    const msgs = getDemoMessages(conv.id);
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
      hasUnfinishedReflection = true;
      break;
    }
  }

  const candidates: number[] = [];
  demoJournalEntries.forEach((e) => {
    if (e.updatedAt) candidates.push(e.updatedAt.toDate().getTime());
    if (e.createdAt) candidates.push(e.createdAt.toDate().getTime());
  });
  demoConversations.forEach((c) => {
    if (c.updatedAt) candidates.push(c.updatedAt.toDate().getTime());
  });
  const lastActivityAt = candidates.length > 0 ? Math.max(...candidates) : null;

  return { hasUnfinishedReflection, lastActivityAt };
}