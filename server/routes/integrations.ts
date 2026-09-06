/**
 * Integration Routes — Phase 14.
 *
 * Authenticated endpoints for external notification channel configuration.
 *
 * Discord Webhook API:
 *   POST   /api/integrations/discord        - Configure webhook
 *   GET    /api/integrations/discord/status - Get masked status
 *   DELETE /api/integrations/discord        - Remove integration
 *   POST   /api/integrations/discord/test   - Send test message
 *
 * SECURITY:
 * - All endpoints require Firebase ID token authentication
 * - Webhook URLs are NEVER returned after configuration
 * - Only masked hints (last 4 chars) are exposed to the client
 */

import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  storeDiscordWebhook,
  getDiscordConfigStatus,
  removeDiscordWebhook,
  setDiscordEnabled,
  sendDiscordTestNotification,
} from '../services/discordWebhookService.js';
import {
  dispatchTestNotifications,
  getNotificationIntegrationStatus,
  setEmailNotificationPreference,
} from '../services/notificationIntegrationService.js';

export const integrationsRouter = Router();

/* ------------------------------------------------------------------ */
/* Discord Webhook Configuration                                       */
/* ------------------------------------------------------------------ */

/**
 * POST /api/integrations/discord
 *
 * Configure a Discord webhook for the authenticated user.
 * The webhook URL is validated and stored securely (never returned).
 */
integrationsRouter.post(
  '/api/integrations/discord',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { webhookUrl } = req.body || {};

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      res.status(400).json({
        error: 'invalid_request',
        message: 'webhookUrl is required and must be a string.',
      });
      return;
    }

    const result = await storeDiscordWebhook(uid, webhookUrl);

    if (!result.success) {
      res.status(400).json({
        error: 'validation_failed',
        message: result.error,
      });
      return;
    }

    // Return only the masked hint - NEVER the full URL
    res.status(200).json({
      status: 'configured',
      configured: true,
      webhookHint: result.webhookHint,
    });
  }
);

/**
 * GET /api/integrations/discord/status
 *
 * Get Discord webhook configuration status.
 * Returns ONLY masked metadata - NEVER the webhook URL.
 */
integrationsRouter.get(
  '/api/integrations/discord/status',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const status = await getDiscordConfigStatus(uid);

    // Return safe metadata only
    res.status(200).json({
      configured: status.configured,
      enabled: status.enabled,
      webhookHint: status.webhookHint || undefined,
    });
  }
);

/**
 * DELETE /api/integrations/discord
 *
 * Remove Discord webhook integration.
 */
integrationsRouter.delete(
  '/api/integrations/discord',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const result = await removeDiscordWebhook(uid);

    if (!result.success) {
      res.status(500).json({
        error: 'deletion_failed',
        message: 'Failed to remove Discord integration.',
      });
      return;
    }

    res.status(200).json({
      status: 'removed',
      configured: false,
      enabled: false,
    });
  }
);

/**
 * POST /api/integrations/discord/test
 *
 * Send a test notification to Discord.
 * This is an explicit user action and does NOT affect anti-spam tracking.
 */
integrationsRouter.post(
  '/api/integrations/discord/test',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const result = await sendDiscordTestNotification(uid);

    if (!result.delivered) {
      res.status(400).json({
        error: 'test_failed',
        reason: result.reason,
        message: result.message || 'Failed to send test notification to Discord.',
      });
      return;
    }

    res.status(200).json({
      status: 'test_sent',
      delivered: true,
    });
  }
);

/**
 * PATCH /api/integrations/discord/enabled
 *
 * Enable or disable Discord notifications without removing the webhook.
 */
integrationsRouter.patch(
  '/api/integrations/discord/enabled',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { enabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        error: 'invalid_request',
        message: 'enabled must be a boolean.',
      });
      return;
    }

    // Verify webhook is configured before enabling
    if (enabled) {
      const status = await getDiscordConfigStatus(uid);
      if (!status.configured) {
        res.status(400).json({
          error: 'not_configured',
          message: 'Discord webhook must be configured before enabling.',
        });
        return;
      }
    }

    const result = await setDiscordEnabled(uid, enabled);

    if (!result.success) {
      res.status(500).json({
        error: 'update_failed',
        message: 'Failed to update Discord notification state.',
      });
      return;
    }

    res.status(200).json({
      status: 'updated',
      enabled,
    });
  }
);

/* ------------------------------------------------------------------ */
/* Email Configuration                                                 */
/* ------------------------------------------------------------------ */

/**
 * PATCH /api/integrations/email/enabled
 *
 * Enable or disable email notifications.
 * Email address comes from Firebase Auth (no separate storage).
 */
integrationsRouter.patch(
  '/api/integrations/email/enabled',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { enabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        error: 'invalid_request',
        message: 'enabled must be a boolean.',
      });
      return;
    }

    // Update email preference via notification service
    const result = await setEmailNotificationPreference(uid, enabled);

    if (!result.success) {
      res.status(500).json({
        error: 'update_failed',
        message: 'Failed to update email notification preference.',
      });
      return;
    }

    res.status(200).json({
      status: 'updated',
      enabled,
    });
  }
);

/* ------------------------------------------------------------------ */
/* Integration Status                                                  */
/* ------------------------------------------------------------------ */

/**
 * GET /api/integrations/status
 *
 * Get comprehensive integration status for all channels.
 */
integrationsRouter.get(
  '/api/integrations/status',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const verifiedEmail = req.user?.email || null;
    const status = await getNotificationIntegrationStatus(uid, verifiedEmail);

    res.status(200).json(status);
  }
);

/**
 * POST /api/integrations/dispatch/smart-nudge
 *
 * Dispatch Smart Nudge to external channels (Phase 14).
 * Called from frontend after successful browser delivery.
 * Fire-and-forget; errors are isolated.
 */
integrationsRouter.post(
  '/api/integrations/dispatch/smart-nudge',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const { reason } = req.body || {};

    // Validate reason is a valid SmartNudgeType
    const validReasons = ['unfinished_reflection', 'preferred_time', 'inactivity'] as const;
    type SmartNudgeReason = typeof validReasons[number];
    
    if (!reason || !validReasons.includes(reason)) {
      // Still return 200 to avoid frontend errors - just skip dispatch
      res.status(200).json({ dispatched: false, reason: 'invalid_nudge_type' });
      return;
    }

    const verifiedEmail = req.user?.email || null;
    // Dispatch to external channels (non-blocking in practice, but we await for response)
    const { dispatchSmartNudge } = await import('../services/notificationIntegrationService.js');
    
    // Fire-and-forget - we don't wait for external channel results
    dispatchSmartNudge(uid, reason as SmartNudgeReason, verifiedEmail).catch((err) => {
      console.warn('[SmartNudgeDispatch] External channel dispatch failed (non-fatal):', err?.message);
    });

    res.status(200).json({ dispatched: true });
  }
);

/**
 * POST /api/integrations/test
 *
 * Send test notifications to all enabled channels.
 * This is an explicit user action and does NOT affect anti-spam tracking.
 */
integrationsRouter.post(
  '/api/integrations/test',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }

    const verifiedEmail = req.user?.email || null;
    const results = await dispatchTestNotifications(uid, verifiedEmail);

    res.status(200).json({
      status: 'test_dispatched',
      results,
    });
  }
);
