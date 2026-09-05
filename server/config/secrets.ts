/**
 * Google Cloud Secret Manager Integration for Reflectra
 *
 * SECURITY ARCHITECTURE:
 * - Frontend → API Request → Express Backend → Secret Provider → Google Cloud Secret Manager
 * - Secrets are NEVER exposed to the frontend
 * - Secrets are NEVER included in API responses, logs, or error messages
 * - Server-side only: this module must never be imported by frontend code
 *
 * ENVIRONMENT STRATEGY:
 * - Local Development: Uses server-side environment variables (process.env)
 * - Production: Retrieves secrets from Google Cloud Secret Manager
 *
 * CACHING:
 * - In-memory cache to avoid unnecessary Secret Manager API calls
 * - Concurrent requests share the same retrieval operation
 * - Failed retrievals do not permanently poison the cache
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Secret names managed by this application.
 * These correspond to Google Cloud Secret Manager secret IDs.
 */
export const SECRET_NAMES = {
  GEMINI_API_KEY: 'GEMINI_API_KEY',
} as const;

export type SecretName = typeof SECRET_NAMES[keyof typeof SECRET_NAMES];

/**
 * Configuration for secret provider behavior.
 */
interface SecretConfig {
  /** Enable Google Cloud Secret Manager (production) */
  useSecretManager: boolean;
  /** Google Cloud project ID (for Secret Manager resource paths) */
  projectId?: string;
}

/**
 * In-memory cache for secret values.
 * Maps secret names to promises to handle concurrent requests safely.
 */
const SECRET_CACHE = new Map<SecretName, Promise<string>>();

/** Secret Manager client instance (lazy initialization) */
let secretManagerClient: SecretManagerServiceClient | null = null;

/** Configuration state */
let config: SecretConfig | null = null;

/**
 * Initialize the secret provider configuration.
 * Must be called once during server startup.
 *
 * @param options Configuration options
 */
export function initializeSecretProvider(options: {
  useSecretManager?: boolean;
  projectId?: string;
} = {}): void {
  config = {
    useSecretManager: options.useSecretManager ?? (process.env.USE_SECRET_MANAGER === 'true'),
    projectId: options.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT,
  };

  if (config.useSecretManager) {
    console.log('[SecretProvider] Initialized with Google Cloud Secret Manager enabled');
    if (!config.projectId) {
      console.warn('[SecretProvider] Warning: No Google Cloud project ID configured. ' +
        'Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT environment variable.');
    }
  } else {
    console.log('[SecretProvider] Initialized with local environment variable fallback');
  }
}

/**
 * Get the current secret provider configuration.
 */
function getConfig(): SecretConfig {
  if (!config) {
    // Auto-initialize with defaults if not explicitly configured
    initializeSecretProvider();
  }
  return config!;
}

/**
 * Get or create the Secret Manager client.
 * Lazy initialization to avoid loading the SDK in local development.
 */
function getSecretManagerClient(): SecretManagerServiceClient {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

/**
 * Retrieve a secret value from Google Cloud Secret Manager.
 *
 * @param secretName The secret ID (e.g., 'GEMINI_API_KEY')
 * @returns The secret value as a string
 * @throws Error if retrieval fails
 */
async function fetchSecretFromManager(secretName: SecretName): Promise<string> {
  const cfg = getConfig();

  if (!cfg.projectId) {
    throw new Error(
      `SECRET_MANAGER_ERROR: Cannot retrieve secret '${secretName}' without Google Cloud project ID. ` +
      'Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT environment variable.'
    );
  }

  const client = getSecretManagerClient();
  const secretPath = `projects/${cfg.projectId}/secrets/${secretName}/versions/latest`;

  try {
    const [response] = await client.accessSecretVersion({ name: secretPath });

    if (!response.payload?.data) {
      throw new Error(`SECRET_MANAGER_ERROR: Secret '${secretName}' has no payload data`);
    }

    // Convert Uint8Array or Buffer to string
    const secretValue = typeof response.payload.data === 'string'
      ? response.payload.data
      : Buffer.from(response.payload.data as Uint8Array).toString('utf-8');

    if (!secretValue || secretValue.trim().length === 0) {
      throw new Error(`SECRET_MANAGER_ERROR: Secret '${secretName}' is empty`);
    }

    return secretValue.trim();
  } catch (error: any) {
    // Sanitize error message - never expose secret values or sensitive details
    const sanitizedMessage = error.message?.includes('SECRET_MANAGER_ERROR')
      ? error.message
      : `Failed to retrieve secret '${secretName}' from Secret Manager`;

    console.error(`[SecretProvider] ${sanitizedMessage}`);

    throw new Error(`SECRET_MANAGER_ERROR: ${sanitizedMessage}`);
  }
}

/**
 * Retrieve a secret value from local environment variables.
 *
 * @param secretName The secret ID (e.g., 'GEMINI_API_KEY')
 * @returns The secret value as a string
 * @throws Error if the environment variable is not set
 */
function getSecretFromEnv(secretName: SecretName): string {
  const value = process.env[secretName];

  if (!value || value.trim().length === 0) {
    throw new Error(
      `SECRET_CONFIG_ERROR: Server environment variable '${secretName}' is not configured. ` +
      'Set the variable in your .env file or enable Secret Manager with USE_SECRET_MANAGER=true.'
    );
  }

  return value.trim();
}

/**
 * Get a secret value.
 *
 * This is the main entry point for secret retrieval.
 * - In production (USE_SECRET_MANAGER=true): retrieves from Google Cloud Secret Manager
 * - In local development: retrieves from server-side environment variables
 *
 * Features:
 * - Lazy retrieval
 * - In-memory caching
 * - Promise-safe concurrent access (multiple calls share the same retrieval operation)
 * - Failed retrievals do not permanently poison the cache
 *
 * @param secretName The secret ID (e.g., 'GEMINI_API_KEY')
 * @returns Promise resolving to the secret value
 */
export async function getSecret(secretName: SecretName): Promise<string> {
  const cfg = getConfig();

  // Check cache first
  const cached = SECRET_CACHE.get(secretName);
  if (cached) {
    return cached;
  }

  // Create the retrieval promise
  const retrievalPromise = (async (): Promise<string> => {
    try {
      if (cfg.useSecretManager) {
        return await fetchSecretFromManager(secretName);
      } else {
        return getSecretFromEnv(secretName);
      }
    } catch (error) {
      // Remove failed promise from cache to allow retry
      SECRET_CACHE.delete(secretName);
      throw error;
    }
  })();

  // Cache the promise (not the value) to handle concurrent requests
  SECRET_CACHE.set(secretName, retrievalPromise);

  return retrievalPromise;
}

/**
 * Clear the secret cache.
 * Useful for testing or forced refresh scenarios.
 */
export function clearSecretCache(): void {
  SECRET_CACHE.clear();
}

/**
 * Check if Secret Manager is enabled.
 */
export function isSecretManagerEnabled(): boolean {
  return getConfig().useSecretManager;
}

/**
 * Verify that required secrets are available.
 * Returns a map of secret names to availability status.
 *
 * SECURITY: Never returns secret values, only boolean status.
 */
export async function verifySecretsAvailability(
  secretNames: SecretName[] = [SECRET_NAMES.GEMINI_API_KEY]
): Promise<Record<SecretName, boolean>> {
  const results: Record<string, boolean> = {};

  for (const name of secretNames) {
    try {
      await getSecret(name);
      results[name] = true;
    } catch {
      results[name] = false;
    }
  }

  return results as Record<SecretName, boolean>;
}

/**
 * Get diagnostic information about the secret provider.
 *
 * SECURITY: Never includes secret values or sensitive configuration.
 */
export function getSecretProviderDiagnostics(): {
  provider: 'secret-manager' | 'environment';
  projectId?: string;
  cacheSize: number;
} {
  const cfg = getConfig();

  return {
    provider: cfg.useSecretManager ? 'secret-manager' : 'environment',
    projectId: cfg.useSecretManager ? cfg.projectId : undefined,
    cacheSize: SECRET_CACHE.size,
  };
}
