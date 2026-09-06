/**
 * Integrations Service — Phase 14.
 *
 * Frontend service for external notification channel configuration.
 * Handles Discord webhook setup and email preferences.
 *
 * AUTHENTICATION:
 * Every backend call is routed through the internal `apiRequest` helper,
 * which obtains a FRESH Firebase ID token from the supplied `getIdToken`
 * getter and attaches it as `Authorization: Bearer <token>`. If no token
 * can be acquired the request fails safely BEFORE any network call.
 *
 * SECURITY:
 * - Discord webhook URLs are NEVER stored locally
 * - Only masked hints are returned from the backend
 * - All webhook operations require authentication
 */

import type { SmartNudgeType } from '../types/notifications';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Token getter pattern — matches the project's established convention
 * (see patternShiftService). Returns the current Firebase ID token, or
 * null when the session is not authenticated.
 */
export type IdTokenGetter = () => Promise<string | null>;

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
/* API Helper — centralized authentication                             */
/* ------------------------------------------------------------------ */

/**
 * Authenticated JSON request against the integrations API.
 *
 * - Obtains a fresh token via `getIdToken` (never a stale captured token).
 * - Fails safely (throws) before any network call when authentication is
 *   unavailable.
 * - Attaches `Authorization: Bearer <token>` on every request.
 * - Preserves safe server-provided error messages; never leaks stack
 *   traces, tokens, or webhook URLs.
 */
async function apiRequest<T>(
  getIdToken: IdTokenGetter,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();
  if (!token) {
    const err = new Error(
      'Authentication required: Unable to acquire session token.'
    );
    (err as any).statusCode = 401;
    throw err;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Could not reach the notification service. Please try again.');
  }

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
  getIdToken: IdTokenGetter,
  webhookUrl: string
): Promise<{ configured: boolean; webhookHint: string }> {
  return apiRequest<{ configured: boolean; webhookHint: string }>(
    getIdToken,
    '/api/integrations/discord',
    {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }
  );
}

/**
 * Get Discord webhook configuration status.
 * Returns only masked metadata - NEVER the webhook URL.
 */
export async function getDiscordConfigStatus(
  getIdToken: IdTokenGetter
): Promise<DiscordConfigStatus> {
  return apiRequest<DiscordConfigStatus>(
    getIdToken,
    '/api/integrations/discord/status'
  );
}

/**
 * Remove Discord webhook integration.
 */
export async function removeDiscordWebhook(
  getIdToken: IdTokenGetter
): Promise<void> {
  await apiRequest(getIdToken, '/api/integrations/discord', {
    method: 'DELETE',
  });
}

/**
 * Enable or disable Discord notifications.
 */
export async function setDiscordEnabled(
  getIdToken: IdTokenGetter,
  enabled: boolean
): Promise<void> {
  await apiRequest(getIdToken, '/api/integrations/discord/enabled', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * Send a test notification to Discord.
 * Errors are captured and returned as a structured result — they never
 * propagate to crash the caller (delivery isolation).
 */
export async function sendDiscordTestNotification(
  getIdToken: IdTokenGetter
): Promise<{
  delivered: boolean;
  message?: string;
}> {
  try {
    const result = await apiRequest<{ delivered: boolean }>(
      getIdToken,
      '/api/integrations/discord/test',
      { method: 'POST' }
    );
    return result;
  } catch (error: any) {
    return {
      delivered: false,
      message: error?.message || 'Failed to send test notification to Discord.',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Email Configuration                                                 */
/* ------------------------------------------------------------------ */

/**
 * Enable or disable email notifications.
 */
export async function setEmailEnabled(
  getIdToken: IdTokenGetter,
  enabled: boolean
): Promise<void> {
  await apiRequest(getIdToken, '/api/integrations/email/enabled', {
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
export async function getIntegrationStatus(
  getIdToken: IdTokenGetter
): Promise<IntegrationStatus> {
  return apiRequest<IntegrationStatus>(getIdToken, '/api/integrations/status');
}

/**
 * Send test notifications to all enabled channels.
 * Errors are captured per-channel and never propagate to crash the
 * caller (delivery isolation).
 */
export async function sendTestNotifications(
  getIdToken: IdTokenGetter
): Promise<{
  email?: { delivered: boolean; message?: string };
  discord?: { delivered: boolean; message?: string };
}> {
  try {
    const result = await apiRequest<{
      results: {
        email?: { delivered: boolean; message?: string };
        discord?: { delivered: boolean; message?: string };
      };
    }>(getIdToken, '/api/integrations/test', { method: 'POST' });
    return result.results;
  } catch (error: any) {
    return {
      email: { delivered: false, message: error?.message },
      discord: { delivered: false, message: error?.message },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Smart Nudge External Dispatch                                       */
/* ------------------------------------------------------------------ */

/**
 * Dispatch a Smart Nudge to external channels.
 *
 * This is a fire-and-forget delivery AFTER the Smart Nudge engine has
 * decided a notification should fire and the browser delivery path has
 * already succeeded. Failures are isolated at the call site
 * (`.catch(() => {})`) so the browser/in-app nudge is never affected.
 *
 * @param getIdToken Token getter for the authenticated session
 * @param reason Valid SmartNudgeType produced by the deterministic engine
 */
export async function dispatchSmartNudge(
  getIdToken: IdTokenGetter,
  reason: SmartNudgeType
): Promise<{ dispatched: boolean; reason?: string }> {
  return apiRequest<{ dispatched: boolean; reason?: string }>(
    getIdToken,
    '/api/integrations/dispatch/smart-nudge',
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}