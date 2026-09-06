/**
 * Email Delivery Service — Phase 14.
 *
 * Provides a narrow abstraction for sending privacy-safe email reminders.
 *
 * PRIVACY GUARANTEE:
 * Email content is ALWAYS hardcoded and NEVER contains:
 * - Journal/reflection text
 * - Gemini output
 * - Mood analysis
 * - Location data
 * - User identity details beyond delivery requirements
 *
 * PROVIDER STRATEGY:
 * - Production: Placeholder that requires configuration (fails honestly)
 * - Development: Noop provider that logs but doesn't send
 * - Demo: Explicitly labeled simulated delivery
 */

import type { NotificationEventType } from '../../src/types/notifications';

/* ------------------------------------------------------------------ */
/* Email Provider Interface                                            */
/* ------------------------------------------------------------------ */

/**
 * Result of an email delivery attempt.
 */
export interface EmailDeliveryResult {
  delivered: boolean;
  reason?: 'not_configured' | 'provider_unavailable' | 'send_failed' | 'no_email_address';
  message?: string;
}

/**
 * Email provider abstraction.
 */
interface EmailProvider {
  name: string;
  isConfigured: boolean;
  send(to: string, subject: string, text: string): Promise<EmailDeliveryResult>;
}

/* ------------------------------------------------------------------ */
/* Email Content Generation (Hardcoded, Privacy-Safe)                 */
/* ------------------------------------------------------------------ */

/**
 * Map event types to hardcoded email subject and body.
 *
 * PRIVACY: Content is ALWAYS generic. Never AI-generated, never user content.
 */
export function buildEmailContent(eventType: NotificationEventType): {
  subject: string;
  text: string;
} {
  const contents: Record<NotificationEventType, { subject: string; text: string }> = {
    smart_nudge: {
      subject: 'Reflectra Reminder',
      text: `Take a few minutes to check in with yourself today.

Your reflection space is here whenever you're ready.

— The Reflectra Team

---
This is a privacy-safe reminder. Your journal content is never included in emails.
To manage notification preferences, visit your Reflectra settings.`,
    },
    reflection_completed: {
      subject: 'Reflection Saved',
      text: `Your reflection has been saved to your private journal.

You can review it anytime in your Reflectra workspace.

— The Reflectra Team

---
This is a privacy-safe notification. Your journal content is never included in emails.`,
    },
    patternshift_ready: {
      subject: 'PatternShift Insights Ready',
      text: `New longitudinal insights are available in your workspace.

Visit Reflectra to explore patterns and trends in your reflections.

— The Reflectra Team

---
This is a privacy-safe notification. Your analysis content is never included in emails.`,
    },
  };

  return contents[eventType];
}

/* ------------------------------------------------------------------ */
/* Provider Implementations                                            */
/* ------------------------------------------------------------------ */

/**
 * Noop email provider for development.
 * Logs the email but doesn't actually send.
 */
class DevelopmentNoopProvider implements EmailProvider {
  name = 'development_noop';
  isConfigured = true;

  async send(to: string, subject: string, text: string): Promise<EmailDeliveryResult> {
    console.log('[EmailDelivery] DEVELOPMENT NOOP - Would send email:');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body preview: ${text.slice(0, 100)}...`);
    
    return { delivered: true };
  }
}

/**
 * Unconfigured email provider for production without credentials.
 * Fails honestly with a clear configuration message.
 */
class UnconfiguredEmailProvider implements EmailProvider {
  name = 'unconfigured';
  isConfigured = false;

  async send(): Promise<EmailDeliveryResult> {
    return {
      delivered: false,
      reason: 'provider_unavailable',
      message: 'Email delivery is not configured in this environment.',
    };
  }
}

/**
 * Placeholder for a real email provider (e.g., Resend, SendGrid).
 * To implement: add provider-specific credentials and API calls.
 */
class ProductionEmailProvider implements EmailProvider {
  name = 'production';
  isConfigured: boolean;

  constructor() {
    // Check for email provider configuration
    // For now, this is unconfigured until a provider is added
    this.isConfigured = false;
  }

  async send(to: string, subject: string, text: string): Promise<EmailDeliveryResult> {
    // If provider credentials are added, implement actual sending here
    // For now, return unconfigured status
    return {
      delivered: false,
      reason: 'provider_unavailable',
      message: 'Email delivery is not configured in this environment.',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Email Service                                                       */
/* ------------------------------------------------------------------ */

let emailProvider: EmailProvider | null = null;

/**
 * Initialize the email provider based on environment.
 */
export function initializeEmailProvider(): void {
  const nodeEnv = process.env.NODE_ENV;
  
  // In development or demo mode, use noop provider
  const isDemoMode = process.env.VITE_DEMO_MODE === 'true';
  if (nodeEnv !== 'production' || isDemoMode) {
    emailProvider = new DevelopmentNoopProvider();
    console.log('[EmailDelivery] Initialized with development noop provider');
    return;
  }
  
  // In production, use real provider (currently unconfigured)
  emailProvider = new ProductionEmailProvider();
  
  if (!emailProvider.isConfigured) {
    console.log('[EmailDelivery] Initialized with unconfigured provider - email delivery disabled');
  } else {
    console.log('[EmailDelivery] Initialized with production provider');
  }
}

/**
 * Get the current email provider.
 */
function getProvider(): EmailProvider {
  if (!emailProvider) {
    initializeEmailProvider();
  }
  return emailProvider!;
}

/**
 * Check if email delivery is configured and available.
 */
export function isEmailDeliveryConfigured(): boolean {
  return getProvider().isConfigured;
}

/**
 * Send a privacy-safe email notification.
 *
 * @param to Recipient email address
 * @param eventType The type of notification event
 * @returns Delivery result
 */
export async function sendEmailNotification(
  to: string,
  eventType: NotificationEventType
): Promise<EmailDeliveryResult> {
  // Validate email address
  if (!to || typeof to !== 'string' || to.trim().length === 0) {
    return {
      delivered: false,
      reason: 'no_email_address',
      message: 'No email address available for delivery.',
    };
  }

  const provider = getProvider();

  // Check provider configuration
  if (!provider.isConfigured) {
    return {
      delivered: false,
      reason: 'provider_unavailable',
      message: 'Email delivery is not configured in this environment.',
    };
  }

  // Build hardcoded content
  const { subject, text } = buildEmailContent(eventType);

  // Send via provider
  try {
    return await provider.send(to.trim(), subject, text);
  } catch (error: any) {
    console.error('[EmailDelivery] Failed to send email:', error?.message);
    return {
      delivered: false,
      reason: 'send_failed',
      message: 'Failed to send email notification.',
    };
  }
}

/**
 * Send a test email (explicit user-triggered action).
 */
export async function sendTestEmail(to: string): Promise<EmailDeliveryResult> {
  return sendEmailNotification(to, 'smart_nudge');
}

/**
 * Get diagnostic information about email provider status.
 * Never includes sensitive configuration details.
 */
export function getEmailProviderDiagnostics(): {
  provider: string;
  configured: boolean;
} {
  const provider = getProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured,
  };
}
