/**
 * Notification Integration Service — Phase 14.
 *
 * Central dispatcher for multi-channel notification delivery.
 * Receives safe notification events and dispatches to enabled channels.
 *
 * ARCHITECTURE:
 *   Smart Nudge Decision (existing engine)
 *            ↓
 *   Safe Notification Event (constrained payload)
 *            ↓
 *   Channel Dispatcher (this service)
 *      ↙        ↓        ↘
 *   Browser    Email    Discord
 *   (Phase13)  (new)    (new)
 *
 * PRIVACY:
 * - Events are constrained types (never raw content)
 * - Email/Discord content is hardcoded
 * - Browser notifications already enforced by Phase 13
 *
 * ISOLATION:
 * - Failure in one channel does not affect others
 * - Each channel has independent error handling
 */

import { getAdminDb } from '../firebaseAdmin.js';
import { sendDiscordNotification, getDiscordConfigStatus } from './discordWebhookService.js';
import { sendEmailNotification, isEmailDeliveryConfigured } from './emailDeliveryService.js';
import type {
  SafeNotificationEvent,
  NotificationEventType,
  ExternalChannelDeliveryResult,
} from '../../src/types/notifications';

/* ------------------------------------------------------------------ */
/* Channel Configuration Retrieval                                     */
/* ------------------------------------------------------------------ */

/**
 * Get channel configuration for a user.
 */
async function getChannelConfig(uid: string): Promise<{
  emailEnabled: boolean;
  discordEnabled: boolean;
  discordConfigured: boolean;
}> {
  try {
    const db = getAdminDb();
    const prefDoc = await db.doc(`users/${uid}/preferences/notifications`).get();
    
    if (!prefDoc.exists) {
      return { emailEnabled: false, discordEnabled: false, discordConfigured: false };
    }

    const data = prefDoc.data();
    return {
      emailEnabled: data?.emailEnabled || false,
      discordEnabled: data?.discordEnabled || false,
      discordConfigured: data?.discordConfigured || false,
    };
  } catch (error: any) {
    console.error('[NotificationIntegration] Failed to get channel config:', error?.message);
    return { emailEnabled: false, discordEnabled: false, discordConfigured: false };
  }
}

/**
 * Get user email from Firebase Auth token or user document.
 */
async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const db = getAdminDb();
    const userDoc = await db.doc(`users/${uid}`).get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      return data?.email || null;
    }
    
    return null;
  } catch (error: any) {
    console.error('[NotificationIntegration] Failed to get user email:', error?.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Channel Dispatcher                                                  */
/* ------------------------------------------------------------------ */

/**
 * Result of dispatching to all enabled channels.
 */
export interface DispatchResult {
  /** Browser notification result (from Phase 13, included for completeness) */
  browser?: { dispatched: boolean; reason?: string };
  /** Email delivery result */
  email?: ExternalChannelDeliveryResult;
  /** Discord delivery result */
  discord?: ExternalChannelDeliveryResult;
}

/**
 * Dispatch a safe notification event to all enabled external channels.
 *
 * This is called AFTER the Smart Nudge engine has decided a notification
 * should happen. The dispatcher handles multi-channel delivery.
 *
 * ISOLATION: Each channel is independent. A failure in one does not
 * affect others or throw an exception that would crash the caller.
 *
 * @param uid User ID
 * @param event Safe notification event (constrained type)
 * @returns Results for each channel
 */
export async function dispatchToExternalChannels(
  uid: string,
  event: SafeNotificationEvent
): Promise<DispatchResult> {
  const result: DispatchResult = {};

  // Get channel configuration
  const config = await getChannelConfig(uid);

  // Dispatch to Discord (isolated)
  if (config.discordEnabled && config.discordConfigured) {
    try {
      const discordResult = await sendDiscordNotification(uid, event.type);
      result.discord = discordResult.delivered
        ? { delivered: true, channel: 'discord' }
        : { delivered: false, channel: 'discord', reason: discordResult.reason };
    } catch (error: any) {
      console.error('[NotificationIntegration] Discord dispatch failed:', error?.message);
      result.discord = {
        delivered: false,
        channel: 'discord',
        reason: 'send_failed',
      };
    }
  }

  // Dispatch to Email (isolated)
  if (config.emailEnabled) {
    try {
      const email = await getUserEmail(uid);
      if (email) {
        const emailResult = await sendEmailNotification(email, event.type);
        result.email = emailResult;
      } else {
        result.email = {
          delivered: false,
          channel: 'email',
          reason: 'no_email_address',
        };
      }
    } catch (error: any) {
      console.error('[NotificationIntegration] Email dispatch failed:', error?.message);
      result.email = {
        delivered: false,
        channel: 'email',
        reason: 'send_failed',
      };
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Event-Specific Dispatch Functions                                   */
/* ------------------------------------------------------------------ */

/**
 * Dispatch a Smart Nudge notification.
 * Called from SmartNudgeProvider after browser delivery succeeds.
 */
export async function dispatchSmartNudge(
  uid: string,
  reason: 'unfinished_reflection' | 'preferred_time' | 'inactivity'
): Promise<DispatchResult> {
  const event: SafeNotificationEvent = {
    type: 'smart_nudge',
    reason,
  };

  return dispatchToExternalChannels(uid, event);
}

/**
 * Dispatch a reflection completed notification.
 * Called from the reflection route after successful completion.
 */
export async function dispatchReflectionCompleted(uid: string): Promise<DispatchResult> {
  const event: SafeNotificationEvent = {
    type: 'reflection_completed',
  };

  return dispatchToExternalChannels(uid, event);
}

/**
 * Dispatch a PatternShift ready notification.
 * Called from the PatternShift route after successful analysis.
 */
export async function dispatchPatternShiftReady(uid: string): Promise<DispatchResult> {
  const event: SafeNotificationEvent = {
    type: 'patternshift_ready',
  };

  return dispatchToExternalChannels(uid, event);
}

/* ------------------------------------------------------------------ */
/* Test Dispatch (User-Triggered)                                      */
/* ------------------------------------------------------------------ */

/**
 * Send test notifications to all enabled channels.
 * This is an explicit user action from Settings and does NOT
 * affect anti-spam tracking.
 */
export async function dispatchTestNotifications(uid: string): Promise<{
  email?: ExternalChannelDeliveryResult;
  discord?: ExternalChannelDeliveryResult;
}> {
  const result: DispatchResult = {};

  const config = await getChannelConfig(uid);

  // Test Discord
  if (config.discordEnabled && config.discordConfigured) {
    try {
      const discordResult = await sendDiscordNotification(uid, 'smart_nudge');
      result.discord = discordResult.delivered
        ? { delivered: true, channel: 'discord' }
        : { delivered: false, channel: 'discord', reason: discordResult.reason };
    } catch (error: any) {
      result.discord = {
        delivered: false,
        channel: 'discord',
        reason: 'send_failed',
      };
    }
  }

  // Test Email
  if (config.emailEnabled) {
    try {
      const email = await getUserEmail(uid);
      if (email) {
        const emailResult = await sendEmailNotification(email, 'smart_nudge');
        result.email = emailResult;
      } else {
        result.email = {
          delivered: false,
          channel: 'email',
          reason: 'no_email_address',
        };
      }
    } catch (error: any) {
      result.email = {
        delivered: false,
        channel: 'email',
        reason: 'send_failed',
      };
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get notification integration status for diagnostics.
 */
export async function getNotificationIntegrationStatus(uid: string): Promise<{
  email: {
    enabled: boolean;
    configured: boolean;
    hasEmailAddress: boolean;
  };
  discord: {
    enabled: boolean;
    configured: boolean;
    webhookHint?: string;
  };
}> {
  const config = await getChannelConfig(uid);
  const email = await getUserEmail(uid);
  const discordStatus = await getDiscordConfigStatus(uid);

  return {
    email: {
      enabled: config.emailEnabled,
      configured: isEmailDeliveryConfigured(),
      hasEmailAddress: Boolean(email),
    },
    discord: {
      enabled: discordStatus.enabled,
      configured: discordStatus.configured,
      webhookHint: discordStatus.webhookHint,
    },
  };
}
