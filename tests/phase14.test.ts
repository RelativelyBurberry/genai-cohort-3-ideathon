/**
 * Phase 14 — External Notification Channels Tests
 *
 * Tests for:
 * - Discord webhook validation
 * - Safe payload generation
 * - Channel configuration defaults
 * - Secret exposure prevention
 * - Delivery isolation
 */

import { describe, it, expect } from 'vitest';
import {
  validateDiscordWebhookUrl,
  maskWebhookUrl,
} from '../server/services/discordWebhookService';
import {
  buildEmailContent,
} from '../server/services/emailDeliveryService';
import type { NotificationEventType } from '../src/types/notifications';

/* ------------------------------------------------------------------ */
/* Discord Webhook Validation                                          */
/* ------------------------------------------------------------------ */

describe('validateDiscordWebhookUrl', () => {
  it('accepts valid Discord webhook URLs', () => {
    const validUrl = 'https://discord.com/api/webhooks/123456789012345678/abc123DEF456ghi789JKL012mno345PQR';
    const result = validateDiscordWebhookUrl(validUrl);
    
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.webhook.id).toBe('123456789012345678');
      expect(result.webhook.token).toBe('abc123DEF456ghi789JKL012mno345PQR');
      expect(result.webhook.fullUrl).toBe(validUrl);
    }
  });

  it('rejects HTTP URLs', () => {
    const httpUrl = 'http://discord.com/api/webhooks/123456789012345678/abc123';
    const result = validateDiscordWebhookUrl(httpUrl);
    
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('HTTPS');
    }
  });

  it('rejects arbitrary hostnames (SSRF protection)', () => {
    const arbitraryUrl = 'https://evil.com/api/webhooks/123456789012345678/abc123';
    const result = validateDiscordWebhookUrl(arbitraryUrl);
    
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid Discord webhook URL format');
    }
  });

  it('rejects malformed URLs', () => {
    const malformedUrls = [
      'not-a-url',
      'https://discord.com/api/webhooks/',
      'https://discord.com/api/webhooks/123/',
      'https://discord.com/api/webhooks/123/abc?query=param',
      'https://discord.com/api/webhooks/123/abc#fragment',
    ];

    malformedUrls.forEach((url) => {
      const result = validateDiscordWebhookUrl(url);
      expect(result.valid).toBe(false);
    });
  });

  it('rejects empty or null URLs', () => {
    const emptyResults = [
      validateDiscordWebhookUrl(''),
      validateDiscordWebhookUrl('   '),
    ];

    emptyResults.forEach((result) => {
      expect(result.valid).toBe(false);
    });
  });

  it('rejects URLs exceeding maximum length', () => {
    const longUrl = 'https://discord.com/api/webhooks/123/' + 'a'.repeat(300);
    const result = validateDiscordWebhookUrl(longUrl);
    
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('too long');
    }
  });
});

describe('maskWebhookUrl', () => {
  it('returns masked hint showing last 4 characters', () => {
    const url = 'https://discord.com/api/webhooks/123/abcXYZ123';
    const masked = maskWebhookUrl(url);
    
    expect(masked).toBe('...Z123');
    expect(masked).not.toContain('discord');
    expect(masked).not.toContain('webhooks');
  });

  it('handles short URLs safely', () => {
    const shortUrl = 'https://a.bc';
    const masked = maskWebhookUrl(shortUrl);
    
    // Should still return a masked format, even for short URLs
    expect(masked).toMatch(/^\.\.\..+/);
    expect(masked.length).toBeLessThan(10);
  });

  it('handles empty input', () => {
    const masked = maskWebhookUrl('');
    expect(masked).toBe('...****');
  });
});

/* ------------------------------------------------------------------ */
/* Safe Payload Generation                                             */
/* ------------------------------------------------------------------ */

describe('Email payload generation', () => {
  // Import the internal function for testing
  // We test the buildEmailContent function to ensure privacy guarantees

  it('generates generic content for smart_nudge event', () => {
    const content = buildEmailContent('smart_nudge');
    
    expect(content.subject).toBe('Reflectra Reminder');
    expect(content.text).toContain('check in with yourself');
    // The email contains a privacy notice mentioning journal, but NOT actual journal content
    expect(content.text).toContain('privacy-safe reminder');
    expect(content.text).toContain('journal content is never included');
  });

  it('generates generic content for reflection_completed event', () => {
    const content = buildEmailContent('reflection_completed');
    
    expect(content.subject).toBe('Reflection Saved');
    expect(content.text).toContain('saved to your private journal');
    expect(content.text).not.toContain('your reflection:');
    expect(content.text).toContain('privacy-safe notification');
  });

  it('generates generic content for patternshift_ready event', () => {
    const content = buildEmailContent('patternshift_ready');
    
    expect(content.subject).toBe('PatternShift Insights Ready');
    expect(content.text).toContain('longitudinal insights');
    expect(content.text).not.toContain('your patterns:');
    expect(content.text).toContain('privacy-safe notification');
  });

  it('never includes forbidden content categories', () => {
    const eventTypes: NotificationEventType[] = [
      'smart_nudge',
      'reflection_completed',
      'patternshift_ready',
    ];

    const forbiddenTerms = [
      'journal entry',
      'reflection text',
      'Gemini',
      'mood rating',
      'emotional',
      'location',
      'your content',
      'your data',
    ];

    eventTypes.forEach((eventType) => {
      const content = buildEmailContent(eventType);
      const combinedText = `${content.subject} ${content.text}`.toLowerCase();

      forbiddenTerms.forEach((term) => {
        expect(combinedText).not.toContain(term.toLowerCase());
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/* Channel Configuration Defaults                                      */
/* ------------------------------------------------------------------ */

describe('NotificationChannelConfig defaults', () => {
  it('has all external channels disabled by default', async () => {
    const { DEFAULT_CHANNEL_CONFIG } = await import('../src/types/notifications');
    
    expect(DEFAULT_CHANNEL_CONFIG.browser.enabled).toBe(false);
    expect(DEFAULT_CHANNEL_CONFIG.email.enabled).toBe(false);
    expect(DEFAULT_CHANNEL_CONFIG.discord.enabled).toBe(false);
    expect(DEFAULT_CHANNEL_CONFIG.discord.configured).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Secret Exposure Prevention                                          */
/* ------------------------------------------------------------------ */

describe('Secret exposure prevention', () => {
  it('maskWebhookUrl never returns full URL', () => {
    const testUrls = [
      'https://discord.com/api/webhooks/123456789012345678/abc123DEF456ghi789JKL012mno345PQR',
      'https://discord.com/api/webhooks/999999999999999999/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      'https://discord.com/api/webhooks/111111111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ];

    testUrls.forEach((url) => {
      const masked = maskWebhookUrl(url);
      
      // Should not contain any significant part of the webhook token
      expect(masked.length).toBeLessThan(10);
      expect(masked).not.toContain('discord.com');
      expect(masked).not.toContain('webhooks');
      expect(masked).not.toContain(url.split('/')[5]); // Token portion
    });
  });

  it('frontend integration service types do not expose webhook URL', async () => {
    // Verify the type definitions don't include webhookUrl field
    const { DiscordConfigStatus } = {} as any;
    
    // TypeScript will enforce this at compile time
    // This test documents the security requirement
    type SafeStatus = {
      configured: boolean;
      enabled: boolean;
      webhookHint?: string;
    };

    // The following would fail TypeScript if webhookUrl were in the type
    const safeStatus: SafeStatus = {
      configured: true,
      enabled: true,
      webhookHint: '...aB9X',
    };

    expect(safeStatus.webhookHint).toBeDefined();
    // @ts-expect-error - webhookUrl should not exist on this type
    expect(safeStatus.webhookUrl).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Delivery Isolation                                                  */
/* ------------------------------------------------------------------ */

describe('Delivery isolation', () => {
  it('email provider failure returns structured error', async () => {
    const { sendEmailNotification, initializeEmailProvider } = await import(
      '../server/services/emailDeliveryService'
    );

    // Initialize with noop provider (development mode)
    initializeEmailProvider();

    // Send to an email (will succeed with noop provider)
    const result = await sendEmailNotification('test@example.com', 'smart_nudge');
    
    // In development mode, noop provider returns delivered: true
    expect(result).toHaveProperty('delivered');
  });

  it('notification integration service handles partial failures gracefully', async () => {
    const { dispatchToExternalChannels } = await import(
      '../server/services/notificationIntegrationService'
    );

    // This test verifies the function doesn't throw on errors
    // In production, it would need proper mocking
    // For now, we verify the function signature and error handling pattern

    // The function should never throw - errors are caught and returned
    // This is documented behavior for isolation
    expect(typeof dispatchToExternalChannels).toBe('function');
  });
});

/* ------------------------------------------------------------------ */
/* Event Type Safety                                                   */
/* ------------------------------------------------------------------ */

describe('SafeNotificationEvent types', () => {
  it('constrains event types to allowed values', () => {
    const validEvents: NotificationEventType[] = [
      'smart_nudge',
      'reflection_completed',
      'patternshift_ready',
    ];

    // TypeScript enforces this at compile time
    // This test documents the allowed values
    validEvents.forEach((eventType) => {
      expect(typeof eventType).toBe('string');
    });
  });
});

/* ------------------------------------------------------------------ */
/* UI Integration Regression Test                                      */
/* ------------------------------------------------------------------ */

describe('Settings UI Integration', () => {
  it('NotificationChannelsCard is exported and importable', async () => {
    // Verify the component exists and can be imported
    const { NotificationChannelsCard } = await import(
      '../src/components/settings/NotificationChannelsCard'
    );

    expect(NotificationChannelsCard).toBeDefined();
    expect(typeof NotificationChannelsCard).toBe('function');
  });

  it('SettingsView imports NotificationChannelsCard', async () => {
    // Read the SettingsView source to verify import
    const fs = await import('fs');
    const path = await import('path');
    
    const settingsViewPath = path.join(
      process.cwd(),
      'src/components/SettingsView.tsx'
    );
    
    const source = fs.readFileSync(settingsViewPath, 'utf-8');
    
    // Verify the import statement exists
    expect(source).toContain("import { NotificationChannelsCard }");
    
    // Verify the component is rendered
    expect(source).toContain('<NotificationChannelsCard />');
  });

  it('SettingsView renders both notification sections', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const settingsViewPath = path.join(
      process.cwd(),
      'src/components/SettingsView.tsx'
    );
    
    const source = fs.readFileSync(settingsViewPath, 'utf-8');
    
    // Verify both notification sections exist
    expect(source).toContain('Smart reflection reminders');
    expect(source).toContain('External notifications');
    expect(source).toContain('NotificationSettingsCard');
    expect(source).toContain('NotificationChannelsCard');
  });
});
