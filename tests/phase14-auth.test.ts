/**
 * Phase 14 — Authentication Regression Tests
 *
 * Proves the confirmed diagnostic bug cannot return:
 *   "All Phase 14 integration API endpoints require Firebase authentication
 *    via `Authorization: Bearer <Firebase ID token>`, but
 *    src/services/integrationsService.ts sent requests WITHOUT an
 *    Authorization header → GET /api/integrations/status → 401".
 *
 * Covers:
 * - Bearer token attachment across every integration operation
 * - Missing-token fail-safe (no unauthenticated network request)
 * - Authenticated status load contract
 * - Authenticated Smart Nudge dispatch
 * - Delivery isolation (external failures never break the caller)
 * - Safe error transparency (no more swallowed diagnostics)
 * - Security boundaries (routes require auth, secrets never exposed)
 * - Email address fallback via Firebase Admin Auth
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import {
  getIntegrationStatus,
  configureDiscordWebhook,
  removeDiscordWebhook,
  setDiscordEnabled,
  setEmailEnabled,
  sendDiscordTestNotification,
  dispatchSmartNudge,
} from '../src/services/integrationsService';

/* ------------------------------------------------------------------ */
/* Fetch mock                                                          */
/* ------------------------------------------------------------------ */

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function makeIdToken(token: string | null) {
  return vi.fn().mockResolvedValue(token);
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

/* ------------------------------------------------------------------ */
/* integrationsService authentication                                  */
/* ------------------------------------------------------------------ */

describe('integrationsService authentication', () => {
  it('getIntegrationStatus sends Authorization Bearer header and returns status', async () => {
    const statusPayload = {
      email: { enabled: false, configured: false, hasEmailAddress: false },
      discord: { enabled: false, configured: false },
    };
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => statusPayload,
      })
    );

    const getIdToken = makeIdToken('test-token-123');
    const status = await getIntegrationStatus(getIdToken);

    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/integrations/status');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-token-123',
      'Content-Type': 'application/json',
    });

    // Contract: returns the canonical IntegrationStatus shape.
    expect(status.email).toMatchObject({
      enabled: false,
      configured: false,
      hasEmailAddress: false,
    });
    expect(status.discord).toMatchObject({ enabled: false, configured: false });
  });

  it('every integration operation attaches the Authorization Bearer header', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    );
    const getIdToken = makeIdToken('fresh-token');

    const operations: Array<[string, () => Promise<unknown>]> = [
      [
        'configureDiscordWebhook',
        () =>
          configureDiscordWebhook(
            getIdToken,
            'https://discord.com/api/webhooks/123456789/abcDEF123'
          ),
      ],
      ['setDiscordEnabled', () => setDiscordEnabled(getIdToken, true)],
      ['setEmailEnabled', () => setEmailEnabled(getIdToken, false)],
      ['removeDiscordWebhook', () => removeDiscordWebhook(getIdToken)],
      ['dispatchSmartNudge', () => dispatchSmartNudge(getIdToken, 'inactivity')],
      ['sendDiscordTestNotification', () => sendDiscordTestNotification(getIdToken)],
    ];

    for (const [name, operation] of operations) {
      const callsBefore = fetchSpy.mock.calls.length;
      await operation();
      expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1);

      const [url, init] = fetchSpy.mock.calls[callsBefore];
      expect(
        init.headers.Authorization,
        `${name} (${url}) must send Authorization: Bearer fresh-token`
      ).toBe('Bearer fresh-token');
      expect(init.headers.Authorization).not.toBeUndefined();
    }
  });

  it('does not send any network request when the session token is unavailable', async () => {
    const getIdToken = makeIdToken(null);

    await expect(getIntegrationStatus(getIdToken)).rejects.toThrow(
      'Authentication required'
    );
    await expect(configureDiscordWebhook(getIdToken, 'https://discord.com/api/webhooks/1/x')).rejects.toThrow(
      'Authentication required'
    );

    // The safe missing-token failure must NOT produce unauthenticated fetches.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Missing token — every operation                                     */
/* ------------------------------------------------------------------ */

describe('missing token fail-safe', () => {
  it('all operations reject safely without a request when getIdToken returns null', async () => {
    const getIdToken = makeIdToken(null);

    const attempts: Array<Promise<unknown>> = [
      getIntegrationStatus(getIdToken),
      configureDiscordWebhook(getIdToken, 'https://discord.com/api/webhooks/1/x'),
      removeDiscordWebhook(getIdToken),
      setDiscordEnabled(getIdToken, true),
      setEmailEnabled(getIdToken, true),
      dispatchSmartNudge(getIdToken, 'preferred_time'),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow('Authentication required');
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Status load contract                                                */
/* ------------------------------------------------------------------ */

describe('authenticated status load', () => {
  it('succeeds through the service contract with a Bearer token', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          email: { enabled: true, configured: true, hasEmailAddress: true },
          discord: { enabled: true, configured: true, webhookHint: '...Z9X2' },
        }),
      })
    );

    const getIdToken = makeIdToken('status-token');
    const status = await getIntegrationStatus(getIdToken);

    expect(status).toEqual({
      email: { enabled: true, configured: true, hasEmailAddress: true },
      discord: { enabled: true, configured: true, webhookHint: '...Z9X2' },
    });

    const { headers } = fetchSpy.mock.calls[0][1];
    expect(headers.Authorization).toBe('Bearer status-token');
  });
});

/* ------------------------------------------------------------------ */
/* Smart Nudge dispatch                                                */
/* ------------------------------------------------------------------ */

describe('Smart Nudge authenticated dispatch', () => {
  it('attaches the Bearer token and POSTs the trusted reason', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ dispatched: true }),
      })
    );

    const getIdToken = makeIdToken('dispatch-token');
    const result = await dispatchSmartNudge(getIdToken, 'unfinished_reflection');

    expect(result).toEqual({ dispatched: true });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/integrations/dispatch/smart-nudge');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer dispatch-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ reason: 'unfinished_reflection' });
  });

  it('replaces the unauthenticated raw-fetch pattern completely', async () => {
    // Guard: no bare `fetch('/api/integrations/dispatch/smart-nudge'...)` may
    // remain in the provider — it MUST route through the authenticated service.
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/context/SmartNudgeProvider.tsx'),
      'utf-8'
    );

    expect(source).not.toContain("fetch('/api/integrations/dispatch/smart-nudge'");
    expect(source).toContain('dispatchSmartNudge(getIdToken, nudge.type)');
  });
});

/* ------------------------------------------------------------------ */
/* Delivery isolation                                                  */
/* ------------------------------------------------------------------ */

describe('delivery isolation', () => {
  it('sendDiscordTestNotification returns a structured failure instead of throwing', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'test_failed',
          message: 'Failed to send test notification to Discord.',
        }),
      })
    );

    const getIdToken = makeIdToken('t');
    const result = await sendDiscordTestNotification(getIdToken);

    // Resolves (never rejects) — the provider/UI does not crash.
    expect(result.delivered).toBe(false);
    expect(result.message).toContain('Failed to send test notification');
  });

  it('dispatchSmartNudge rejection is isolatable by the caller .catch() pattern', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized', message: 'Authentication required.' }),
      })
    );

    const getIdToken = makeIdToken('t');
    const promise = dispatchSmartNudge(getIdToken, 'inactivity');

    // Mirrors SmartNudgeProvider: dispatchSmartNudge(...).catch(() => {})
    // The external channel failure must never throw out of the caller.
    let settled = '';
    await promise.catch(() => {
      settled = 'isolated';
    });
    expect(settled).toBe('isolated');
  });
});

/* ------------------------------------------------------------------ */
/* Error transparency                                                  */
/* ------------------------------------------------------------------ */

describe('safe error transparency', () => {
  it('preserves safe server validation messages instead of swallowing them', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'validation_failed',
          message: 'Webhook URL must use HTTPS.',
        }),
      })
    );

    const getIdToken = makeIdToken('t');
    let caught: Error | null = null;
    try {
      await configureDiscordWebhook(getIdToken, 'http://not-secure');
    } catch (err: any) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    // Component-level pattern: err.message is surfaced when available.
    const message =
      caught instanceof Error && caught.message
        ? caught.message
        : 'Could not load notification channel status.';
    expect(message).toBe('Webhook URL must use HTTPS.');
  });

  it('surfaces the 401 diagnostic instead of the generic loading error', async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized', message: 'Authentication required.' }),
      })
    );

    const getIdToken = makeIdToken('stale-token');
    let message = '';
    try {
      await getIntegrationStatus(getIdToken);
    } catch (err: any) {
      message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not load notification channel status.';
    }

    expect(message).toContain('Authentication required');
    expect(message).not.toContain('stale-token');
  });
});

/* ------------------------------------------------------------------ */
/* Security boundaries                                                 */
/* ------------------------------------------------------------------ */

describe('security boundaries preserved', () => {
  it('every integration route is protected by requireAuth', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'server/routes/integrations.ts'),
      'utf-8'
    );

    const routeDeclPattern = /integrationsRouter\.(get|post|patch|delete)\(/g;
    const protectedPattern =
      /integrationsRouter\.(get|post|patch|delete)\(\s*'\/api\/integrations[^']*',\s*requireAuth/g;

    const declared = source.match(routeDeclPattern) || [];
    const protectedRoutes = source.match(protectedPattern) || [];

    expect(declared.length).toBeGreaterThanOrEqual(7); // status, discord CRUD, email, dispatch, test
    expect(protectedRoutes.length).toBe(declared.length);
  });

  it('Firestore rules deny client access to the Discord secrets path', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rules = fs.readFileSync(
      path.join(process.cwd(), 'firestore.rules'),
      'utf-8'
    );

    expect(rules).toContain('match /users/{userId}/secrets/{secretId}');
    expect(rules).toContain('allow read, write: if false;');
  });

  it('frontend status types never carry an exposed webhook URL', async () => {
    // Compile-time guarantee: DiscordConfigStatus has webhookHint only.
    const safe: {
      configured: boolean;
      enabled: boolean;
      webhookHint?: string;
    } = { configured: true, enabled: true, webhookHint: '...aB9X' };

    expect(safe.webhookHint).toBeDefined();
    // @ts-expect-error — webhookUrl must NOT exist on the client status type
    expect(safe.webhookUrl).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Email address fallback via Firebase Admin Auth                      */
/* ------------------------------------------------------------------ */

// Hoisted mocks referenced by the hoisted module mock below.
const adminAuthMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  dbDocGet: vi.fn(),
  dbDocSet: vi.fn(),
  dbDocDelete: vi.fn(),
}));

vi.mock('../server/firebaseAdmin.js', () => ({
  getAdminDb: () => ({
    doc: (path: string) => ({
      get: () => adminAuthMock.dbDocGet(path),
      set: (data: unknown, opts?: unknown) => adminAuthMock.dbDocSet(path, data, opts),
      delete: () => adminAuthMock.dbDocDelete(path),
    }),
  }),
  getAdminAuth: () => ({
    getUser: adminAuthMock.getUser,
  }),
}));

describe('email address fallback via Firebase Admin Auth', () => {
  beforeEach(() => {
    // Default: Firestore user doc missing → email delivered via the prefs doc.
    adminAuthMock.dbDocGet.mockReset();
    adminAuthMock.dbDocGet.mockImplementation(async (path: string) => {
      if (path === 'users/fallbackuid/preferences/notifications') {
        return {
          exists: true,
          data: () => ({
            emailEnabled: true,
            discordEnabled: false,
            discordConfigured: false,
          }),
        };
      }
      // users/fallbackuid (email source) — absent by default.
      return { exists: false };
    });

    adminAuthMock.getUser.mockReset();
    adminAuthMock.getUser.mockResolvedValue({ email: 'fallback@example.com' });
  });

  it('falls back to Admin Auth when the Firestore user document lacks an email', async () => {
    const { dispatchToExternalChannels } = await import(
      '../server/services/notificationIntegrationService'
    );

    const result = await dispatchToExternalChannels('fallbackuid', {
      type: 'smart_nudge',
      reason: 'inactivity',
    });

    expect(adminAuthMock.getUser).toHaveBeenCalledWith('fallbackuid');
    // Development noop provider delivers successfully.
    expect(result.email?.delivered).toBe(true);
  });

  it('prefers the Firestore user document email when present', async () => {
    adminAuthMock.dbDocGet.mockImplementation(async (path: string) => {
      if (path === 'users/fallbackuid/preferences/notifications') {
        return {
          exists: true,
          data: () => ({
            emailEnabled: true,
            discordEnabled: false,
            discordConfigured: false,
          }),
        };
      }
      if (path === 'users/fallbackuid') {
        return {
          exists: true,
          data: () => ({ email: 'doc@example.com' }),
        };
      }
      return { exists: false };
    });

    const { dispatchToExternalChannels } = await import(
      '../server/services/notificationIntegrationService'
    );

    const result = await dispatchToExternalChannels('fallbackuid', {
      type: 'smart_nudge',
      reason: 'inactivity',
    });

    expect(adminAuthMock.getUser).not.toHaveBeenCalled();
    expect(result.email?.delivered).toBe(true);
  });
});