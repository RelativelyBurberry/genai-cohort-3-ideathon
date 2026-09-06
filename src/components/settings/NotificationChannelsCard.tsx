/**
 * NotificationChannelsCard — Phase 14 External Notification Channels.
 *
 * A polished settings card for configuring external notification channels:
 * - Email reminders (privacy-safe, generic content)
 * - Discord webhook integration
 *
 * PRIVACY GUARANTEES:
 * - Discord webhook URLs are NEVER stored locally
 * - Only masked hints (last 4 chars) are displayed
 * - External reminders NEVER include journal content, reflection text,
 *   Gemini output, mood analysis, or any private user content
 *
 * AUTHENTICATION:
 * Every integration API call passes `getIdToken` from `useAuth()` so the
 * service layer attaches a fresh `Authorization: Bearer <token>`.
 * No API request is made for unauthenticated or demo sessions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Info, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIsDemoSession, DEMO_USER } from '../../demo';
import {
  getIntegrationStatus,
  configureDiscordWebhook,
  removeDiscordWebhook,
  setDiscordEnabled,
  setEmailEnabled,
  sendDiscordTestNotification,
} from '../../services/integrationsService';
import type { IntegrationStatus } from '../../services/integrationsService';

// Discord logo SVG (simplified, matches Lucide icon style)
const DiscordIcon: React.FC<{ className?: string; 'aria-hidden'?: boolean }> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

export const NotificationChannelsCard: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const isDemo = useIsDemoSession();
  const uid = isDemo ? DEMO_USER.uid : user?.uid;

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Discord webhook form state
  const [showWebhookInput, setShowWebhookInput] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookUrlVisible, setWebhookUrlVisible] = useState(false);

  /**
   * Refresh canonical channel status from the backend after a mutation.
   * The backend status endpoint is the single source of truth, so we
   * never hand-reconstruct stale state locally (avoids the null-status
   * bug where an initial empty state stayed empty after configuration).
   */
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (isDemo || !uid) return;
    const fresh = await getIntegrationStatus(getIdToken);
    setStatus(fresh);
  }, [isDemo, uid, getIdToken]);

  // Load integration status (only when authenticated; demo stays local)
  useEffect(() => {
    if (!uid || isDemo) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getIntegrationStatus(getIdToken)
      .then(setStatus)
      .catch((err: any) => {
        // Preserve safe server diagnostics instead of swallowing them.
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Could not load notification channel status.';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [uid, isDemo, getIdToken]);

  const handleEmailToggle = async (enabled: boolean) => {
    if (!uid || isDemo) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      await setEmailEnabled(getIdToken, enabled);
      await refreshStatus();
      setSuccessMsg(enabled ? 'Email reminders enabled.' : 'Email reminders disabled.');
    } catch (err: any) {
      setError(err.message || 'Failed to update email preference.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscordToggle = async (enabled: boolean) => {
    if (!uid || isDemo) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      await setDiscordEnabled(getIdToken, enabled);
      await refreshStatus();
      setSuccessMsg(
        enabled ? 'Discord notifications enabled.' : 'Discord notifications disabled.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update Discord preference.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfigureWebhook = async () => {
    if (!uid || isDemo || !webhookUrl.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      await configureDiscordWebhook(getIdToken, webhookUrl.trim());
      await refreshStatus();
      setWebhookUrl('');
      setShowWebhookInput(false);
      setSuccessMsg('Discord webhook configured successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to configure Discord webhook.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveWebhook = async () => {
    if (!uid || isDemo) return;
    if (!window.confirm('Remove Discord webhook integration?')) return;

    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      await removeDiscordWebhook(getIdToken);
      await refreshStatus();
      setSuccessMsg('Discord webhook removed.');
    } catch (err: any) {
      setError(err.message || 'Failed to remove Discord webhook.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDiscord = async () => {
    if (!uid || isDemo) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const result = await sendDiscordTestNotification(getIdToken);
      if (result.delivered) {
        setSuccessMsg('Test notification sent to Discord.');
      } else {
        setError(result.message || 'Failed to send test notification.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send test notification.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-card settings-channels-card">
        <p className="settings-section-kicker">NOTIFICATION CHANNELS</p>
        <h2 className="settings-card-title">External notifications</h2>
        <p className="settings-card-copy">Loading...</p>
      </div>
    );
  }

  const emailEnabled = isDemo ? false : (status?.email.enabled || false);
  const emailUnavailable = isDemo || !status?.email.configured || !status?.email.hasEmailAddress;

  return (
    <div className="settings-card settings-channels-card">
      <p className="settings-section-kicker">NOTIFICATION CHANNELS</p>
      <h2 className="settings-card-title">External notifications</h2>
      <p className="settings-card-copy">
        Receive privacy-safe reminders through channels you choose.
      </p>

      {/* Email Channel */}
      <div className="channel-config">
        <div className="channel-header-row">
          <Mail className="channel-icon" aria-hidden="true" />
          <span className="channel-name">Email reminders</span>
          <label className="nudge-switch">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => handleEmailToggle(e.target.checked)}
              disabled={saving || emailUnavailable}
            />
            <span className="nudge-switch-track" />
          </label>
        </div>

        <p className="channel-description">
          Receive gentle reminders by email. Journal content is never included.
        </p>

        {isDemo && (
          <p className="channel-status-note">
            <span className="channel-status-dot is-demo" aria-hidden="true" />
            Demo mode — simulated delivery
          </p>
        )}

        {!isDemo && status?.email.configured === false && (
          <p className="channel-status-note">
            <AlertTriangle className="channel-warning-icon" aria-hidden="true" />
            Email delivery not configured in this environment
          </p>
        )}

        {!isDemo && status?.email.hasEmailAddress === false && (
          <p className="channel-status-note">
            <AlertTriangle className="channel-warning-icon" aria-hidden="true" />
            No email address associated with your account
          </p>
        )}
      </div>

      {/* Discord Channel */}
      <div className="channel-config">
        <div className="channel-header-row">
          <DiscordIcon className="channel-icon" aria-hidden="true" />
          <span className="channel-name">Discord</span>
          {!isDemo && status?.discord.configured && (
            <label className="nudge-switch">
              <input
                type="checkbox"
                checked={status.discord.enabled}
                onChange={(e) => handleDiscordToggle(e.target.checked)}
                disabled={saving}
              />
              <span className="nudge-switch-track" />
            </label>
          )}
        </div>

        <p className="channel-description">
          Get Reflectra notifications in your Discord server. Your webhook is
          encrypted and never exposed.
        </p>

        {isDemo && (
          <p className="channel-status-note">
            <span className="channel-status-dot is-demo" aria-hidden="true" />
            Demo mode — configuration unavailable
          </p>
        )}

        {!isDemo && status?.discord.configured ? (
          <div className="discord-configured">
            <div className="discord-status-row">
              <CheckCircle2 className="discord-status-icon" aria-hidden="true" />
              <span>Webhook configured</span>
              {status.discord.webhookHint && (
                <span className="discord-webhook-hint">
                  ending in <code>{status.discord.webhookHint}</code>
                </span>
              )}
            </div>

            <div className="discord-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleTestDiscord}
                disabled={saving || !status.discord.enabled}
              >
                Send Test
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger"
                onClick={handleRemoveWebhook}
                disabled={saving}
              >
                <Trash2 className="btn-icon" aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        ) : !isDemo ? (
          <div className="discord-configure">
            {!showWebhookInput ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowWebhookInput(true)}
                disabled={saving}
              >
                Configure Discord
              </button>
            ) : (
              <div className="discord-webhook-form">
                <label className="discord-field">
                  <span className="discord-field-label">Discord Webhook URL</span>
                  <div className="discord-input-row">
                    <input
                      type={webhookUrlVisible ? 'text' : 'password'}
                      className="input discord-input"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon-only"
                      onClick={() => setWebhookUrlVisible(!webhookUrlVisible)}
                      aria-label={webhookUrlVisible ? 'Hide URL' : 'Show URL'}
                    >
                      {webhookUrlVisible ? (
                        <EyeOff className="btn-icon" aria-hidden="true" />
                      ) : (
                        <Eye className="btn-icon" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </label>

                <div className="discord-form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleConfigureWebhook}
                    disabled={saving || !webhookUrl.trim()}
                  >
                    Save Securely
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setShowWebhookInput(false);
                      setWebhookUrl('');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

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

      {/* Privacy note */}
      <p className="nudge-privacy-note">
        <Info className="nudge-privacy-icon" aria-hidden="true" />
        External notifications never include journal entries, conversations,
        mood analysis, or AI responses.
      </p>
    </div>
  );
};