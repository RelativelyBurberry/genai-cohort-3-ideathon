/**
 * Integrations Service — Phase 14.
 *
 * Frontend service for external notification channel configuration.
 * Handles Discord webhook setup and email preferences.
 *
 * SECURITY:
 * - Discord webhook URLs are NEVER stored locally
 * - Only masked hints are returned from the backend
 * - All webhook operations require authentication
 */

import type { NotificationChannelConfig } from '../types/notifications';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DiscordConfigStatus {
  configured: boolean;
  enabled: boolean;
  webhookHint?: string;
}

export interface EmailConfigStatus {
  enabled: boolean;
  configured: boolean;
  hasEmailAddress: boolean;
}

export interface IntegrationStatus {
  email: EmailConfigStatus;
  discord: DiscordConfigStatus;
}

/* ------------------------------------------------------------------ */
/* API Helpers                                                         */
/* ------------------------------------------------------------------ */

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `Request to ${path} failed`);
  }

  return response.json();
}

/* ------------------------------------------------------------------ */
/* Discord Webhook Configuration                                       */
/* ------------------------------------------------------------------ */

/**
 * Configure a Discord webhook for the current user.
 * The webhook URL is validated and stored server-side.
 * Only a masked hint is returned - NEVER the full URL.
 */
export async function configureDiscordWebhook(
  webhookUrl: string
): Promise<{ configured: boolean; webhookHint: string }> {
  const result = await apiRequest<{
    configured: boolean;
    webhookHint: string;
  }>('/api/integrations/discord', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl }),
  });

  return result;
}

/**
 * Get Discord webhook configuration status.
 * Returns only masked metadata - NEVER the webhook URL.
 */
export async function getDiscordConfigStatus(): Promise<DiscordConfigStatus> {
  return apiRequest<DiscordConfigStatus>('/api/integrations/discord/status');
}

/**
 * Remove Discord webhook integration.
 */
export async function removeDiscordWebhook(): Promise<void> {
  await apiRequest('/api/integrations/discord', {
    method: 'DELETE',
  });
}

/**
 * Enable or disable Discord notifications.
 */
export async function setDiscordEnabled(enabled: boolean): Promise<void> {
  await apiRequest('/api/integrations/discord/enabled', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * Send a test notification to Discord.
 */
export async function sendDiscordTestNotification(): Promise<{
  delivered: boolean;
  message?: string;
}> {
  try {
    const result = await apiRequest<{ delivered: boolean }>(
      '/api/integrations/discord/test',
      { method: 'POST' }
    );
    return result;
  } catch (error: any) {
    return {
      delivered: false,
      message: error.message || 'Failed to send test notification to Discord.',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Email Configuration                                                 */
/* ------------------------------------------------------------------ */

/**
 * Enable or disable email notifications.
 */
export async function setEmailEnabled(enabled: boolean): Promise<void> {
  await apiRequest('/api/integrations/email/enabled', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/* ------------------------------------------------------------------ */
/* Integration Status                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get comprehensive integration status for all channels.
 */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  return apiRequest<IntegrationStatus>('/api/integrations/status');
}

/**
 * Send test notifications to all enabled channels.
 */
export async function sendTestNotifications(): Promise<{
  email?: { delivered: boolean; message?: string };
  discord?: { delivered: boolean; message?: string };
}> {
  try {
    const result = await apiRequest<{
      results: {
        email?: { delivered: boolean; message?: string };
        discord?: { delivered: boolean; message?: string };
      };
    }>('/api/integrations/test', { method: 'POST' });
    return result.results;
  } catch (error: any) {
    return {
      email: { delivered: false, message: error.message },
      discord: { delivered: false, message: error.message },
    };
  }
}
