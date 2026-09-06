/**
 * Discord Webhook Service — Phase 14.
 *
 * Handles secure validation, storage, and delivery of Discord webhook
 * notifications. Webhook URLs are treated as SECRETS and are NEVER
 * exposed to the frontend after initial configuration.
 *
 * SECURITY:
 * - Webhook URLs are stored in a server-only Firestore path
 * - Only masked hints (last 4 chars) are returned to the client
 * - URLs are validated server-side (HTTPS only, Discord hostname)
 * - SSRF protection: reject arbitrary URLs
 */

import { getAdminDb } from '../firebaseAdmin.js';
import type { NotificationEventType } from '../../src/types/notifications';

/* ------------------------------------------------------------------ */
/* Discord Webhook Validation                                          */
/* ------------------------------------------------------------------ */

/**
 * Validated Discord webhook URL components.
 */
interface ParsedDiscordWebhook {
  id: string;
  token: string;
  fullUrl: string;
}

/**
 * Discord webhook URL pattern.
 * Format: https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
 */
const DISCORD_WEBHOOK_PATTERN = /^https:\/\/discord\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9_-]+)$/;

/**
 * Maximum webhook URL length to prevent abuse.
 */
const MAX_WEBHOOK_URL_LENGTH = 256;

/**
 * Validate a Discord webhook URL.
 *
 * REQUIREMENTS:
 * - Must use HTTPS
 * - Must match Discord webhook hostname pattern
 * - Must have expected path structure
 * - Rejects arbitrary SSRF targets
 *
 * @param url The webhook URL to validate
 * @returns Parsed webhook components or validation error
 */
export function validateDiscordWebhookUrl(url: string):
  | { valid: true; webhook: ParsedDiscordWebhook }
  | { valid: false; error: string } {
  
  // Basic input validation
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Webhook URL is required.' };
  }

  // Trim and check length
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Webhook URL cannot be empty.' };
  }

  if (trimmed.length > MAX_WEBHOOK_URL_LENGTH) {
    return { valid: false, error: 'Webhook URL is too long.' };
  }

  // Must start with https://
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'Webhook URL must use HTTPS.' };
  }

  // Reject HTTP explicitly
  if (trimmed.startsWith('http://')) {
    return { valid: false, error: 'HTTP webhooks are not allowed. Please use HTTPS.' };
  }

  // Parse and validate Discord webhook pattern
  const match = DISCORD_WEBHOOK_PATTERN.exec(trimmed);
  if (!match) {
    return { 
      valid: false, 
      error: 'Invalid Discord webhook URL format. Expected: https://discord.com/api/webhooks/{id}/{token}' 
    };
  }

  const [, webhookId, webhookToken] = match;

  // Additional validation: ensure no query parameters or fragments that could be abused
  const urlObj = new URL(trimmed);
  if (urlObj.search || urlObj.hash) {
    return { valid: false, error: 'Webhook URL should not contain query parameters or fragments.' };
  }

  return {
    valid: true,
    webhook: {
      id: webhookId,
      token: webhookToken,
      fullUrl: trimmed,
    },
  };
}

/**
 * Generate a masked hint showing only the last 4 characters.
 * Used for UI display after webhook is saved.
 */
export function maskWebhookUrl(url: string): string {
  if (!url || url.length < 8) {
    return '...****';
  }
  const lastFour = url.slice(-4);
  return `...${lastFour}`;
}

/* ------------------------------------------------------------------ */
/* Discord Webhook Storage (Server-Only)                              */
/* ------------------------------------------------------------------ */

/**
 * Path for storing Discord webhook secrets.
 * This path is NOT readable by clients (Firestore rules block it).
 */
function discordSecretDocRef(uid: string) {
  const db = getAdminDb();
  return db.doc(`users/${uid}/secrets/discord`);
}

/**
 * Path for storing Discord configuration flags (client-readable).
 */
function discordConfigDocRef(uid: string) {
  const db = getAdminDb();
  return db.doc(`users/${uid}/preferences/notifications`);
}

/**
 * Store a validated Discord webhook URL securely.
 * The URL is stored in a server-only path that clients cannot read.
 */
export async function storeDiscordWebhook(
  uid: string,
  webhookUrl: string
): Promise<{ success: true; webhookHint: string } | { success: false; error: string }> {
  try {
    // Validate the webhook URL
    const validation = validateDiscordWebhookUrl(webhookUrl);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const webhookHint = maskWebhookUrl(webhookUrl);

    // Store the webhook URL in a server-only path
    const secretRef = discordSecretDocRef(uid);
    await secretRef.set({
      webhookUrl: validation.webhook.fullUrl,
      webhookId: validation.webhook.id,
      configuredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update the client-readable config to indicate configured state
    const configRef = discordConfigDocRef(uid);
    await configRef.set({
      discordEnabled: true,
      discordConfigured: true,
      discordWebhookHint: webhookHint,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true, webhookHint };
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to store webhook:', error?.message);
    return { success: false, error: 'Failed to store webhook configuration.' };
  }
}

/**
 * Retrieve the Discord webhook URL (server-side only).
 * This is NEVER called from client code.
 */
export async function getDiscordWebhookUrl(uid: string): Promise<string | null> {
  try {
    const secretRef = discordSecretDocRef(uid);
    const doc = await secretRef.get();
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return data?.webhookUrl || null;
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to retrieve webhook:', error?.message);
    return null;
  }
}

/**
 * Get Discord configuration status (safe for client consumption).
 * NEVER returns the webhook URL.
 */
export async function getDiscordConfigStatus(uid: string): Promise<{
  configured: boolean;
  enabled: boolean;
  webhookHint?: string;
}> {
  try {
    const configRef = discordConfigDocRef(uid);
    const doc = await configRef.get();
    
    if (!doc.exists) {
      return { configured: false, enabled: false };
    }

    const data = doc.data();
    return {
      configured: data?.discordConfigured || false,
      enabled: data?.discordEnabled || false,
      webhookHint: data?.discordWebhookHint || undefined,
    };
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to get config status:', error?.message);
    return { configured: false, enabled: false };
  }
}

/**
 * Remove Discord webhook integration.
 */
export async function removeDiscordWebhook(uid: string): Promise<{ success: boolean }> {
  try {
    // Delete the secret
    const secretRef = discordSecretDocRef(uid);
    await secretRef.delete();

    // Update the config flags
    const configRef = discordConfigDocRef(uid);
    await configRef.set({
      discordEnabled: false,
      discordConfigured: false,
      discordWebhookHint: null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to remove webhook:', error?.message);
    return { success: false };
  }
}

/**
 * Update Discord enabled/disabled state (does not delete webhook).
 */
export async function setDiscordEnabled(
  uid: string,
  enabled: boolean
): Promise<{ success: boolean }> {
  try {
    const configRef = discordConfigDocRef(uid);
    await configRef.set({
      discordEnabled: enabled,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to update enabled state:', error?.message);
    return { success: false };
  }
}

/* ------------------------------------------------------------------ */
/* Discord Message Delivery                                            */
/* ------------------------------------------------------------------ */

/**
 * Generic Discord message content (never contains user data).
 */
interface DiscordMessage {
  content: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    footer?: { text: string };
  }>;
}

/**
 * Map event types to hardcoded, privacy-safe Discord messages.
 *
 * PRIVACY: These messages NEVER contain:
 * - Journal/reflection text
 * - Gemini output
 * - Mood analysis
 * - Location data
 * - User identity details
 */
function buildDiscordMessage(eventType: NotificationEventType): DiscordMessage {
  const messages: Record<NotificationEventType, DiscordMessage> = {
    smart_nudge: {
      content: '🔔 **Reflectra Reminder**',
      embeds: [{
        description: 'Take a moment to check in with yourself when you\'re ready.',
        color: 0x7C3AED, // Purple brand color
        footer: { text: 'Reflectra' },
      }],
    },
    reflection_completed: {
      content: '✅ **Reflection Completed**',
      embeds: [{
        description: 'Your reflection has been saved to your private journal.',
        color: 0x10B981, // Green
        footer: { text: 'Reflectra' },
      }],
    },
    patternshift_ready: {
      content: '📊 **PatternShift Insights Ready**',
      embeds: [{
        description: 'New longitudinal insights are available in your workspace.',
        color: 0x3B82F6, // Blue
        footer: { text: 'Reflectra' },
      }],
    },
  };

  return messages[eventType];
}

/**
 * Send a notification to Discord via webhook.
 *
 * @param uid User ID (to retrieve webhook URL)
 * @param eventType The type of notification event
 * @returns Delivery result
 */
export async function sendDiscordNotification(
  uid: string,
  eventType: NotificationEventType
): Promise<{ delivered: true } | { delivered: false; reason: string }> {
  try {
    // Get the webhook URL
    const webhookUrl = await getDiscordWebhookUrl(uid);
    if (!webhookUrl) {
      return { delivered: false, reason: 'not_configured' };
    }

    // Build the message
    const message = buildDiscordMessage(eventType);

    // Send to Discord with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[DiscordWebhook] Discord API error:', response.status, response.statusText);
        return { delivered: false, reason: 'send_failed' };
      }

      return { delivered: true };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[DiscordWebhook] Request timeout');
        return { delivered: false, reason: 'send_failed' };
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[DiscordWebhook] Failed to send notification:', error?.message);
    return { delivered: false, reason: 'send_failed' };
  }
}

/**
 * Send a test notification to Discord (explicit user-triggered action).
 */
export async function sendDiscordTestNotification(
  uid: string
): Promise<{ delivered: true } | { delivered: false; reason: string; message?: string }> {
  // Verify webhook exists
  const webhookUrl = await getDiscordWebhookUrl(uid);
  if (!webhookUrl) {
    return { 
      delivered: false, 
      reason: 'not_configured',
      message: 'Discord webhook is not configured.',
    };
  }

  // Send test message
  const result = await sendDiscordNotification(uid, 'smart_nudge');
  
  if (!result.delivered) {
    return {
      ...result,
      message: 'Failed to send test notification to Discord.',
    };
  }

  return { delivered: true };
}
