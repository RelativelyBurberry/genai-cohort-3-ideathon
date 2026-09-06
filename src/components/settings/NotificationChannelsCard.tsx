/**
 * NotificationChannelsCard — Phase 14 External Notification Channels.
 *
 * A settings card for configuring external notification channels:
 * - Email reminders (privacy-safe, generic content)
 * - Discord webhook integration
 *
 * PRIVACY GUARANTEES:
 * - Discord webhook URLs are NEVER stored locally
 * - Only masked hints (last 4 chars) are displayed
 * - External reminders NEVER include journal content, reflection text,
 *   Gemini output, mood analysis, or any private user content
 */

import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, CheckCircle2, AlertTriangle, Info, Eye, EyeOff, Trash2 } from 'lucide-react';
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

export const NotificationChannelsCard: React.FC = () => {
  const { user } = useAuth();
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

  // Load integration status
  useEffect(() => {
    if (!uid || isDemo) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getIntegrationStatus()
      .then(setStatus)
      .catch(() => {
        setError('Could not load notification channel status.');
      })
      .finally(() => setLoading(false));
  }, [uid, isDemo]);

  const handleEmailToggle = async (enabled: boolean) => {
    if (!uid || isDemo) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      await setEmailEnabled(enabled);
      setStatus((prev) =>
        prev ? { ...prev, email: { ...prev.email, enabled } } : prev
      );
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
      await setDiscordEnabled(enabled);
      setStatus((prev) =>
        prev ? { ...prev, discord: { ...prev.discord, enabled } } : prev
      );
      setSuccessMsg(enabled ? 'Discord notifications enabled.' : 'Discord notifications disabled.');
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
      const result = await configureDiscordWebhook(webhookUrl.trim());
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              discord: {
                ...prev.discord,
                configured: true,
                enabled: true,
                webhookHint: result.webhookHint,
              },
            }
          : prev
      );
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
      await removeDiscordWebhook();
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              discord: {
                enabled: false,
                configured: false,
                webhookHint: undefined,
              },
            }
          : prev
      );
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
      const result = await sendDiscordTestNotification();
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

  // Demo mode: show informational message
  if (isDemo) {
    return (
      <div className="settings-card settings-channels-card">
        <p className="settings-section-kicker">NOTIFICATION CHANNELS</p>
        <h2 className="settings-card-title">External notifications</h2>
        <p className="settings-card-copy">
          Configure email and Discord notifications for reminders.
        </p>

        <div className="channel-demo-notice">
          <Info className="channel-demo-icon" aria-hidden="true" />
          <p>
            Demo mode does not configure real external channels.
            Production environments support email and Discord integration.
          </p>
        </div>

        <p className="channel-privacy-note">
          <Info className="channel-privacy-icon" aria-hidden="true" />
          External reminders never include your journal entries, reflection
          conversations, mood analysis, or AI responses.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-card settings-channels-card">
      <p className="settings-section-kicker">NOTIFICATION CHANNELS</p>
      <h2 className="settings-card-title">External notifications</h2>
      <p className="settings-card-copy">
        Receive reminders through email or Discord. Your content stays private.
      </p>

      {/* Email Channel */}
      <div className="channel-section">
        <div className="channel-header">
          <Mail className="channel-icon" aria-hidden="true" />
          <span className="channel-name">Email Reminders</span>
        </div>

        <p className="channel-description">
          Receive privacy-safe reflection reminders by email. Content is generic
          and never includes your journal text.
        </p>

        {status?.email.configured === false && (
          <p className="channel-unavailable">
            <AlertTriangle className="channel-warning-icon" aria-hidden="true" />
            Email delivery is not configured in this environment.
          </p>
        )}

        {status?.email.hasEmailAddress === false && (
          <p className="channel-unavailable">
            <AlertTriangle className="channel-warning-icon" aria-hidden="true" />
            No email address associated with your account.
          </p>
        )}

        <div className="channel-toggle-row">
          <label className="channel-switch">
            <input
              type="checkbox"
              checked={status?.email.enabled || false}
              onChange={(e) => handleEmailToggle(e.target.checked)}
              disabled={saving || !status?.email.configured || !status?.email.hasEmailAddress}
            />
            <span className="channel-switch-track" />
            <span className="channel-switch-label">
              {status?.email.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </div>

      {/* Discord Channel */}
      <div className="channel-section">
        <div className="channel-header">
          <MessageSquare className="channel-icon" aria-hidden="true" />
          <span className="channel-name">Discord Integration</span>
        </div>

        <p className="channel-description">
          Get notifications in Discord via webhook. Webhook URLs are stored
          securely and never exposed after saving.
        </p>

        {/* Webhook status */}
        {status?.discord.configured ? (
          <div className="discord-configured">
            <p className="discord-status">
              <CheckCircle2 className="discord-status-icon" aria-hidden="true" />
              Webhook configured
              {status.discord.webhookHint && (
                <span className="discord-webhook-hint">
                  {' '}&bull; Ending in <code>{status.discord.webhookHint}</code>
                </span>
              )}
            </p>

            <div className="discord-actions">
              <label className="channel-switch">
                <input
                  type="checkbox"
                  checked={status.discord.enabled}
                  onChange={(e) => handleDiscordToggle(e.target.checked)}
                  disabled={saving}
                />
                <span className="channel-switch-track" />
                <span className="channel-switch-label">
                  {status.discord.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>

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
        ) : (
          <div className="discord-configure">
            {!showWebhookInput ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowWebhookInput(true)}
                disabled={saving}
              >
                Configure Discord Webhook
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
                    className="btn btn-primary"
                    onClick={handleConfigureWebhook}
                    disabled={saving || !webhookUrl.trim()}
                  >
                    Save Securely
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
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
        )}
      </div>

      {/* Messages */}
      {successMsg && (
        <p className="channel-success-msg" role="status">
          <CheckCircle2 className="channel-msg-icon" aria-hidden="true" />
          {successMsg}
        </p>
      )}
      {error && (
        <p className="channel-error-msg" role="alert">
          <AlertTriangle className="channel-msg-icon" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Privacy note */}
      <p className="channel-privacy-note">
        <Info className="channel-privacy-icon" aria-hidden="true" />
        External reminders never include your journal entries, reflection
        conversations, mood analysis, or AI responses.
      </p>
    </div>
  );
};
