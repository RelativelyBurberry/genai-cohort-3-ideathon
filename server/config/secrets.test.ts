import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for Secret Provider Abstraction
 *
 * These tests verify:
 * 1. Local environment mode reads server-side environment variables
 * 2. Secret Manager enabled mode uses Secret Manager provider
 * 3. Caching: multiple calls for same secret do not repeatedly invoke provider
 * 4. Concurrent access: parallel calls share the same retrieval operation
 * 5. Failure handling: failed retrieval does not permanently poison cache
 * 6. Security: secret values are never returned by public APIs
 *
 * SECURITY: Tests use mocks - never require real credentials or secrets.
 */

// Create a shared mock function that can be accessed both in the mock and in tests
const mockAccessSecretVersion = vi.fn();

// Mock the Google Cloud Secret Manager SDK before importing the module
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class MockSecretManagerServiceClient {
    accessSecretVersion = mockAccessSecretVersion;
  },
}));

// Import after mocking
import {
  initializeSecretProvider,
  getSecret,
  clearSecretCache,
  isSecretManagerEnabled,
  verifySecretsAvailability,
  getSecretProviderDiagnostics,
  SECRET_NAMES,
} from './secrets.js';

describe('Secret Provider', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment for each test
    vi.resetModules();
    process.env = { ...originalEnv };

    // Clear cache before each test
    clearSecretCache();

    // Reset mock
    mockAccessSecretVersion.mockReset();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
    clearSecretCache();
  });

  describe('Local Environment Mode', () => {
    it('reads secret from server-side environment variable when Secret Manager is disabled', async () => {
      // Setup
      process.env.GEMINI_API_KEY = 'test-api-key-local';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify
      expect(secret).toBe('test-api-key-local');
      expect(isSecretManagerEnabled()).toBe(false);
    });

    it('throws error when environment variable is not set', async () => {
      // Setup
      delete process.env.GEMINI_API_KEY;
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute & Verify
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow(
        'SECRET_CONFIG_ERROR'
      );
    });

    it('trims whitespace from environment variable', async () => {
      // Setup
      process.env.GEMINI_API_KEY = '  test-api-key-with-spaces  ';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify
      expect(secret).toBe('test-api-key-with-spaces');
    });

    it('rejects empty environment variable', async () => {
      // Setup
      process.env.GEMINI_API_KEY = '   ';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute & Verify
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow(
        'SECRET_CONFIG_ERROR'
      );
    });
  });

  describe('Secret Manager Mode', () => {
    it('returns secret from Secret Manager when enabled', async () => {
      // Setup
      const mockSecretValue = 'test-api-key-from-secret-manager';
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      mockAccessSecretVersion.mockResolvedValueOnce([
        {
          payload: {
            data: mockSecretValue,
          },
        },
      ]);

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify
      expect(secret).toBe(mockSecretValue);
      expect(isSecretManagerEnabled()).toBe(true);
    });

    it('calls Secret Manager with correct resource path', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project-123';

      mockAccessSecretVersion.mockResolvedValueOnce([
        {
          payload: {
            data: 'secret-value',
          },
        },
      ]);

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project-123' });

      // Execute
      await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project-123/secrets/GEMINI_API_KEY/versions/latest',
      });
    });

    it('throws error when project ID is missing', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCP_PROJECT;

      initializeSecretProvider({ useSecretManager: true });

      // Execute & Verify
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow(
        'SECRET_MANAGER_ERROR'
      );
    });

    it('handles Secret Manager API errors gracefully', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      mockAccessSecretVersion.mockRejectedValueOnce(
        new Error('Permission denied')
      );

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute & Verify
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow(
        'SECRET_MANAGER_ERROR'
      );
    });
  });

  describe('Caching Behavior', () => {
    it('caches secret value after first retrieval', async () => {
      // Setup
      process.env.GEMINI_API_KEY = 'cached-api-key';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute - multiple calls
      const secret1 = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      const secret2 = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      const secret3 = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify - all calls return same value
      expect(secret1).toBe('cached-api-key');
      expect(secret2).toBe('cached-api-key');
      expect(secret3).toBe('cached-api-key');
    });

    it('does not call Secret Manager multiple times for cached secret', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      mockAccessSecretVersion.mockResolvedValueOnce([
        {
          payload: {
            data: 'secret-from-manager',
          },
        },
      ]);

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute - multiple calls
      await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify - Secret Manager called only once
      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(1);
    });

    it('removes failed promise from cache to allow retry', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      // First call fails
      mockAccessSecretVersion.mockRejectedValueOnce(
        new Error('Temporary failure')
      );

      // Second call succeeds
      mockAccessSecretVersion.mockResolvedValueOnce([
        {
          payload: {
            data: 'success-after-retry',
          },
        },
      ]);

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute - first call fails
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow();

      // Execute - second call succeeds (proves cache was cleared)
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      expect(secret).toBe('success-after-retry');

      // Verify - Secret Manager called twice (once for failure, once for retry)
      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(2);
    });

    it('does not permanently poison the cache for the synchronous env-var path', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'false';
      delete process.env.GEMINI_API_KEY;
      initializeSecretProvider({ useSecretManager: false });

      // First call fails synchronously (missing env var)
      await expect(getSecret(SECRET_NAMES.GEMINI_API_KEY)).rejects.toThrow(
        'SECRET_CONFIG_ERROR'
      );

      // Configuration repaired
      process.env.GEMINI_API_KEY = 'repaired-key';

      // Second call must succeed — the rejected promise must NOT have
      // been left in the cache (this bug previously forced a server
      // restart after configuring the secret).
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      expect(secret).toBe('repaired-key');
    });
  });

  describe('Concurrent Access', () => {
    it('shares the same retrieval operation for concurrent requests', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      // Simulate slow retrieval
      mockAccessSecretVersion.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    payload: {
                      data: 'concurrent-secret',
                    },
                  },
                ]),
              100
            )
          )
      );

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute - concurrent requests
      const [secret1, secret2, secret3] = await Promise.all([
        getSecret(SECRET_NAMES.GEMINI_API_KEY),
        getSecret(SECRET_NAMES.GEMINI_API_KEY),
        getSecret(SECRET_NAMES.GEMINI_API_KEY),
      ]);

      // Verify - all requests return same value
      expect(secret1).toBe('concurrent-secret');
      expect(secret2).toBe('concurrent-secret');
      expect(secret3).toBe('concurrent-secret');

      // Verify - Secret Manager called only once (shared operation)
      expect(mockAccessSecretVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security Guarantees', () => {
    it('never exposes secret values in diagnostics', async () => {
      // Setup
      process.env.GEMINI_API_KEY = 'super-secret-key-12345';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute
      await getSecret(SECRET_NAMES.GEMINI_API_KEY);
      const diagnostics = getSecretProviderDiagnostics();

      // Verify
      expect(diagnostics).toHaveProperty('provider');
      expect(diagnostics).toHaveProperty('cacheSize');
      expect(diagnostics).not.toHaveProperty('secretValue');
      expect(diagnostics).not.toHaveProperty('GEMINI_API_KEY');
      expect(JSON.stringify(diagnostics)).not.toContain('super-secret-key-12345');
    });

    it('verifySecretsAvailability returns boolean status only', async () => {
      // Setup
      process.env.GEMINI_API_KEY = 'another-secret-key';
      process.env.USE_SECRET_MANAGER = 'false';

      initializeSecretProvider({ useSecretManager: false });

      // Execute
      const availability = await verifySecretsAvailability([SECRET_NAMES.GEMINI_API_KEY]);

      // Verify
      expect(availability).toHaveProperty('GEMINI_API_KEY');
      expect(typeof availability.GEMINI_API_KEY).toBe('boolean');
      expect(availability.GEMINI_API_KEY).toBe(true);
      expect(JSON.stringify(availability)).not.toContain('another-secret-key');
    });

    it('sanitizes error messages to avoid leaking secrets', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      // Simulate error with sensitive data in message
      mockAccessSecretVersion.mockRejectedValueOnce(
        new Error('API key sk-1234567890abcdef is invalid')
      );

      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute
      try {
        await getSecret(SECRET_NAMES.GEMINI_API_KEY);
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        // Verify error message does not contain secret
        expect(error.message).not.toContain('sk-1234567890abcdef');
        expect(error.message).toContain('SECRET_MANAGER_ERROR');
      }
    });
  });

  describe('Configuration', () => {
    it('reads USE_SECRET_MANAGER from environment when explicitly initialized', async () => {
      // Setup - use explicit initialization with environment variable
      process.env.USE_SECRET_MANAGER = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

      // Initialize with explicit true
      initializeSecretProvider({ useSecretManager: true, projectId: 'test-project' });

      // Execute
      const enabled = isSecretManagerEnabled();

      // Verify
      expect(enabled).toBe(true);
    });

    it('defaults to environment mode when USE_SECRET_MANAGER is not set', async () => {
      // Setup
      delete process.env.USE_SECRET_MANAGER;
      process.env.GEMINI_API_KEY = 'default-mode-key';

      // Execute - auto-initialize
      initializeSecretProvider();
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify
      expect(isSecretManagerEnabled()).toBe(false);
      expect(secret).toBe('default-mode-key');
    });

    it('supports explicit configuration override', async () => {
      // Setup
      process.env.USE_SECRET_MANAGER = 'true'; // Environment says true
      process.env.GEMINI_API_KEY = 'override-key';

      // Initialize with explicit false (override)
      initializeSecretProvider({ useSecretManager: false });

      // Execute
      const secret = await getSecret(SECRET_NAMES.GEMINI_API_KEY);

      // Verify - uses environment variable despite USE_SECRET_MANAGER=true in env
      expect(isSecretManagerEnabled()).toBe(false);
      expect(secret).toBe('override-key');
    });
  });
});
