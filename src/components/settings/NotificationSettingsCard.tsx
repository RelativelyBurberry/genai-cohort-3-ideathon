import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  useIsDemoSession,
  DEMO_USER,
  loadDemoNotificationPrefs,
  saveDemoNotificationPrefs,
} from '../../demo';
import { useSmartNudge } from '../../context/SmartNudgeProvider';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../../services/notificationsService';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
} from '../../services/notificationDelivery';
import type { NotificationPreferences } from '../../types/notifications';

/**
 * NotificationSettingsCard — Phase 13 Smart Reflection Reminders.
 *
 * A polished but compact settings card that lets the user:
 *   - Enable/disable Smart Reminders
 *   - See browser notification status (Allowed / Not enabled / Blocked)
 *   - Choose preferred reminder time (HH:mm, default 20:00)
 *   - Configure quiet hours (optional, crossing midnight supported)
 *   - Send a Test Reminder (explicit-interaction-only, never modifies
 *     anti-spam tracking)
 *
 * PRIVACY: The Notification permission prompt is NEVER requested
 * automatically. It only fires after the user clicks
 * "Enable Smart Reminders" (or explicitly prompts from settings), and
 * only after a direct user gesture.
 */

function formatPermissionLabel(state: string): string {
  if (state === 'granted') return 'Allowed';
  if (state === 'denied') return 'Blocked by browser';
  return 'Not enabled';
}

function normalizeHHmm(value: string): string {
  const v = value.trim();
  if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(v)) return v;
  return '20:00';
}

export const NotificationSettingsCard: React.FC = () => {
  const { user } = useAuth();
  const isDemo = useIsDemoSession();
  const uid = isDemo ? DEMO_USER.uid : user?.uid;
  const { previewDemoNudge } = useSmartNudge();

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state (shared demo/production values while editing).
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoPreferredTime, setDemoPreferredTime] = useState('20:00');
  const [demoQuietOn, setDemoQuietOn] = useState(false);
  const [demoQuietStart, setDemoQuietStart] = useState('22:00');
  const [demoQuietEnd, setDemoQuietEnd] = useState('08:00');

  // Load existing preferences.
  useEffect(() => {
    if (!uid) return;

    if (isDemo) {
      // Demo: localStorage-backed preferences (never Firestore).
      const p = loadDemoNotificationPrefs();
      setDemoEnabled(p.enabled);
      setDemoPreferredTime(p.preferredTime);
      setDemoQuietOn(p.quietHoursEnabled);
      setDemoQuietStart(p.quietHoursStart);
      setDemoQuietEnd(p.quietHoursEnd);
      setLoading(false);
      return;
    }

    setLoading(true);
    getNotificationPreferences(uid)
      .then((p) => {
        setPrefs(p);
        setDemoEnabled(p.enabled);
        setDemoPreferredTime(p.preferredTime || '20:00');
        setDemoQuietOn(p.quietHoursEnabled);
        setDemoQuietStart(p.quietHoursStart || '22:00');
        setDemoQuietEnd(p.quietHoursEnd || '08:00');
      })
      .catch(() => {
        // Firestore preferences unavailable → do not crash the workspace.
        setError('We could not load your notification preferences right now.');
      })
      .finally(() => setLoading(false));
  }, [uid, isDemo]);

  /** Enable smart reminders → request browser permission ONLY on click. */
  const handleEnable = async () => {
    if (!uid) {
      setError('You must be signed in to enable reminders.');
      return;
    }

    setError(null);
    setSuccessMsg(null);

    // If the browser has already blocked notifications, do not fire the
    // permission prompt again — be honest about the browser setting.
    if (getNotificationPermission() === 'denied') {
      setDemoEnabled(false);
      setError(
        'Notifications are blocked by your browser. You can enable them in browser settings.'
      );
      return;
    }

    // If browser API is available and permission is currently default,
    // request it — this is the ONLY place permission is requested.
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'default'
    ) {
      const perm = await requestNotificationPermission();
      if (perm === 'denied') {
        setDemoEnabled(false);
        setError(
          'Notifications are blocked by your browser. You can enable them in browser settings.'
        );
        if (isDemo) saveDemoNotificationPrefs({ enabled: false, preferredTime: demoPreferredTime, quietHoursEnabled: demoQuietOn, quietHoursStart: demoQuietStart, quietHoursEnd: demoQuietEnd });
        return;
      }
      if (perm !== 'granted') {
        setDemoEnabled(false);
        setError('Notifications were not enabled. Please try again.');
        if (isDemo) saveDemoNotificationPrefs({ enabled: false, preferredTime: demoPreferredTime, quietHoursEnabled: demoQuietOn, quietHoursStart: demoQuietStart, quietHoursEnd: demoQuietEnd });
        return;
      }
    }

    const nextEnabled = true;
    setDemoEnabled(nextEnabled);
    setSuccessMsg('Smart reminders are on. We\u2019ll keep it gentle.');

    if (isDemo) {
      saveDemoNotificationPrefs({
        enabled: nextEnabled,
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart,
        quietHoursEnd: demoQuietEnd,
      });
      const p: NotificationPreferences = {
        enabled: true,
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart,
        quietHoursEnd: demoQuietEnd,
        maxDailyNotifications: 1,
        lastNotificationAt: null,
        lastNotificationDate: null,
        notificationPermission: 'granted',
        createdAt: null,
        updatedAt: null,
      };
      setPrefs(p);
      return;
    }

    setSaving(true);
    try {
      await saveNotificationPreferences(uid, {
        enabled: nextEnabled,
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart ? normalizeHHmm(demoQuietStart) : null,
        quietHoursEnd: demoQuietEnd ? normalizeHHmm(demoQuietEnd) : null,
        notificationPermission: getNotificationPermission(),
      });
      const fresh = await getNotificationPreferences(uid);
      setPrefs(fresh);
    } catch {
      setError('We could not save your preferences. Please try again.');
      setDemoEnabled(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (nextEnabled: boolean) => {
    if (!uid) return;
    setError(null);
    setSuccessMsg(null);
    setDemoEnabled(nextEnabled);

    // Disabling removes permission for automatic nudges but never
    // revokes the browser permission itself.
    if (!nextEnabled) {
      setSuccessMsg('Smart reminders are off.');
    }

    if (isDemo) {
      saveDemoNotificationPrefs({
        enabled: nextEnabled,
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart,
        quietHoursEnd: demoQuietEnd,
      });
    } else {
      setSaving(true);
      try {
        await saveNotificationPreferences(uid, { enabled: nextEnabled });
        const fresh = await getNotificationPreferences(uid);
        setPrefs(fresh);
      } catch {
        setError('We could not save your preferences. Please try again.');
        setDemoEnabled(!nextEnabled);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSaveSettings = async () => {
    if (!uid) return;
    setError(null);
    setSuccessMsg(null);

    if (isDemo) {
      saveDemoNotificationPrefs({
        enabled: demoEnabled,
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart,
        quietHoursEnd: demoQuietEnd,
      });
      setPrefs((p) =>
        p
          ? {
              ...p,
              preferredTime: normalizeHHmm(demoPreferredTime),
              quietHoursEnabled: demoQuietOn,
              quietHoursStart: demoQuietStart,
              quietHoursEnd: demoQuietEnd,
            }
          : p
      );
      setSuccessMsg('Reminder settings saved.');
      return;
    }

    setSaving(true);
    try {
      await saveNotificationPreferences(uid, {
        preferredTime: normalizeHHmm(demoPreferredTime),
        quietHoursEnabled: demoQuietOn,
        quietHoursStart: demoQuietStart ? normalizeHHmm(demoQuietStart) : null,
        quietHoursEnd: demoQuietEnd ? normalizeHHmm(demoQuietEnd) : null,
        maxDailyNotifications: 1,
        notificationPermission: getNotificationPermission(),
      });
      const fresh = await getNotificationPreferences(uid);
      setPrefs(fresh);
      setSuccessMsg('Reminder settings saved.');
    } catch {
      setError('We could not save your preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestReminder = () => {
    setError(null);
    setSuccessMsg(null);

    const result = sendTestNotification();

    if (result.sent === true) {
      setSuccessMsg(
        result.via === 'browser'
          ? 'Test reminder sent to your browser.'
          : 'Test reminder shown in-app (browser notifications unavailable).'
      );
      return;
    }

    setError(result.message);
  };

  const permissionState = getNotificationPermission();
  const statusLabel = formatPermissionLabel(
    prefs?.notificationPermission ?? permissionState
  );

  const statusDotClass =
    prefs?.notificationPermission === 'granted'
      ? 'is-allowed'
      : prefs?.notificationPermission === 'denied'
        ? 'is-blocked'
        : 'is-default';

  return (
    <div className="settings-card settings-notifications-card">
      <p className="settings-section-kicker">SMART REFLECTION REMINDERS</p>
      <h2 className="settings-card-title">
        Smart reflection reminders
      </h2>
      <p className="settings-card-copy">
        Gentle, privacy-conscious reminders based on your preferences. Your
        reflections are never shown in any notification.
      </p>

      {/* Notification status */}
      <div className="nudge-status-row">
        <span className={`nudge-status-dot ${statusDotClass}`} aria-hidden="true" />
        <span className="nudge-status-text">
          Notification status: <strong>{statusLabel}</strong>
        </span>
      </div>

      {/* Enable toggle */}
      <div className="nudge-enable-row">
        <button
          type="button"
          className={`btn ${demoEnabled ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => (demoEnabled ? handleToggle(false) : handleEnable())}
          disabled={saving}
        >
          <Bell className="nudge-btn-icon" aria-hidden="true" />
          <span>{demoEnabled ? 'Disable Smart Reminders' : 'Enable Smart Reminders'}</span>
        </button>
        {demoEnabled && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => handleToggle(false)}
            disabled={saving}
          >
            Disable
          </button>
        )}
      </div>

      {/* Config (only visible when enabled) */}
      {demoEnabled && (
        <div className="nudge-config">
          {/* Preferred time */}
          <label className="nudge-field">
            <span className="nudge-field-label">Preferred reminder time</span>
            <input
              type="time"
              className="input nudge-time-input"
              value={demoPreferredTime}
              onChange={(e) => setDemoPreferredTime(e.target.value)}
            />
          </label>

          {/* Quiet hours */}
          <div className="nudge-quiet-toggle-row">
            <span className="nudge-field-label">Quiet hours</span>
            <label className="nudge-switch">
              <input
                type="checkbox"
                checked={demoQuietOn}
                onChange={(e) => setDemoQuietOn(e.target.checked)}
              />
              <span className="nudge-switch-track" />
              <span className="nudge-switch-label">
                {demoQuietOn ? 'On' : 'Off'}
              </span>
            </label>
          </div>

          {demoQuietOn && (
            <div className="nudge-quiet-times">
              <label className="nudge-field">
                <span className="nudge-field-label">From</span>
                <input
                  type="time"
                  className="input nudge-time-input"
                  value={demoQuietStart}
                  onChange={(e) => setDemoQuietStart(e.target.value)}
                />
              </label>
              <label className="nudge-field">
                <span className="nudge-field-label">To</span>
                <input
                  type="time"
                  className="input nudge-time-input"
                  value={demoQuietEnd}
                  onChange={(e) => setDemoQuietEnd(e.target.value)}
                />
              </label>
            </div>
          )}

          {/* Frequency note */}
          <p className="nudge-frequency-note">
            Frequency: gentle — maximum one reminder per day.
          </p>

          {/* Save */}
          <div className="nudge-save-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveSettings}
              disabled={saving}
            >
              Save settings
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {successMsg && (
        <p className="nudge-success-msg" role="status">
          <CheckCircle2 className="nudge-msg-icon" aria-hidden="true" />
          {successMsg}
        </p>
      )}
      {error && (
        <p className="nudge-error-msg" role="alert">
          <AlertTriangle className="nudge-msg-icon" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Test button — split row */}
      <div className="nudge-test-row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleTestReminder}
        >
          Send Test Reminder
        </button>
        <span className="nudge-test-note">
          Test reminders never count toward your daily limit.
        </span>
      </div>

      {/* Demo preview trigger (VITE_DEMO_MODE only) */}
      {isDemo && (
        <div className="nudge-demo-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={previewDemoNudge}
          >
            Preview Smart Nudge
          </button>
          <span className="nudge-demo-note">
            Demo only — runs the same deterministic evaluator with safe
            demo conditions and shows the in-app preview.
          </span>
        </div>
      )}

      {/* Privacy note */}
      <p className="nudge-privacy-note">
        <Info className="nudge-privacy-icon" aria-hidden="true" />
        Reflectra never includes your journal or reflection content in any
        notification. Reminders are only sent when you opt in.
      </p>
    </div>
  );
};
