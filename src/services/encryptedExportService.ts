/**
 * encryptedExportService.ts — Phase 19: Zero-Knowledge Encrypted Export
 *
 * All cryptographic operations happen entirely in the browser using the
 * native Web Crypto API (window.crypto.subtle). No third-party crypto
 * dependency is used.
 *
 * ZERO-KNOWLEDGE GUARANTEES:
 *   - The passphrase and derived key NEVER leave this device.
 *   - The plaintext export is NEVER sent to any backend.
 *   - Salt and IV are freshly generated via crypto.getRandomValues() for
 *     every export — never reused.
 *   - The serialized file contains ONLY ciphertext and NON-SECRET
 *     metadata (algorithm, iteration count, salt, IV).
 *
 * SECURITY NOTES:
 *   - AES-256-GCM authenticates ciphertext; a wrong passphrase derives a
 *     different key and fails GCM tag verification — it never silently
 *     returns corrupted data.
 *   - PBKDF2-SHA-256 iteration count is a centralized, non-user-editable
 *     constant (not scattered magic numbers).
 */

// ---------------------------------------------------------------------------
// Named constants — centralized, never user-editable, never scattered.
// ---------------------------------------------------------------------------

/** Version of the encrypted export file format. Bump on breaking changes. */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * PBKDF2-SHA-256 iteration count. 600,000 is the OWASP recommendation for
 * 2023+. This is a single, central constant that balances modern browser
 * performance with strong key strengthening.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Salt length in bytes. 16 bytes (128 bits) is cryptographically ample. */
export const SALT_LENGTH_BYTES = 16;

/** IV length in bytes for AES-GCM. 12 bytes (96 bits) is the recommended GCM nonce size. */
export const IV_LENGTH_BYTES = 12;

/** AES key length in bits. AES-256 = 256-bit key. */
export const AES_KEY_LENGTH = 256;

/** The canonical format identifier for Reflectra encrypted exports. */
export const EXPORT_FORMAT_ID = 'reflectra-encrypted-export';

/** Minimum passphrase length in characters. */
export const MIN_PASSPHRASE_LENGTH = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The complete, serialized encrypted export file. */
export interface EncryptedExportFile {
  format: typeof EXPORT_FORMAT_ID;
  version: typeof EXPORT_FORMAT_VERSION;
  crypto: {
    algorithm: 'AES-GCM';
    keyDerivation: 'PBKDF2-SHA-256';
    iterations: typeof PBKDF2_ITERATIONS;
    salt: string; // base64
    iv: string; // base64
  };
  ciphertext: string; // base64
}

/**
 * The zero-knowledge export payload envelope that gets encrypted.
 * Only this object's ciphertext is ever stored in the file.
 */
export interface EncryptedExportPayload {
  exportVersion: number;
  exportedAt: string; // ISO 8601
  data: unknown;
}

// ---------------------------------------------------------------------------
// Base64 helpers (browser-safe, no Buffer dependency)
// ---------------------------------------------------------------------------

/**
 * Convert a Uint8Array to a base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks to avoid call-stack limits
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to a Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Passphrase validation
// ---------------------------------------------------------------------------

export interface PassphraseValidationResult {
  valid: boolean;
  /** Human-readable failure reason, or empty when valid. */
  message?: string;
}

/**
 * Validate a passphrase pair (passphrase + confirmation) for export.
 *
 * Rules are deliberately minimal and memory-friendly:
 *   - passphrases must be non-empty
 *   - passphrase must meet MIN_PASSPHRASE_LENGTH
 *   - passphrase and confirmation must match
 *
 * No bizarre complexity rules — we encourage a strong, memorable phrase.
 */
export function validateExportPassphrase(
  passphrase: string,
  confirmation: string
): PassphraseValidationResult {
  if (!passphrase || passphrase.trim().length === 0) {
    return { valid: false, message: 'Please enter a passphrase.' };
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      valid: false,
      message: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    };
  }
  if (passphrase !== confirmation) {
    return { valid: false, message: 'Passphrases do not match.' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Core cryptographic operations
// ---------------------------------------------------------------------------

/**
 * Derive a cryptographic key from a passphrase using PBKDF2-SHA-256.
 *
 * The derived CryptoKey exists only in memory and is never persisted,
 * logged, or transmitted.
 */
async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  try {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      'PBKDF2',
      false, // non-extractable — the raw key material cannot be exported
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH,
      },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );

    return key;
  } finally {
    // Best-effort zeroing of the passphrase bytes in memory.
    passphraseBytes.fill(0);
  }
}

/**
 * Encrypt a plaintext payload under a passphrase, producing a complete
 * serialized EncryptedExportFile.
 *
 * @param plaintext The JSON-stringifiable payload to encrypt.
 * @param passphrase The user passphrase (exists only in memory).
 * @returns The serialized encrypted export file.
 *
 * A fresh random salt AND a fresh random IV are generated for every call.
 */
export async function createEncryptedExport(
  plaintext: unknown,
  passphrase: string
): Promise<EncryptedExportFile> {
  // Validate passphrase defensively even though the UI pre-validates.
  const validation = validateExportPassphrase(passphrase, passphrase);
  if (!validation.valid) {
    throw new Error(validation.message || 'Invalid passphrase.');
  }

  // 1. Fresh random salt for key derivation (every export).
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));

  // 2. PBKDF2-SHA-256 key derivation.
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  // 3. Fresh random IV (every encryption operation — never reused with a key).
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));

  // 4. Serialize the plaintext payload.
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(plaintext));

  let ciphertext: Uint8Array;
  try {
    // 5. AES-256-GCM encryption.
    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      key,
      plaintextBytes
    );

    ciphertext = new Uint8Array(ciphertextBuffer);
  } finally {
    // Best-effort zeroing of the plaintext bytes in memory.
    plaintextBytes.fill(0);
  }

  // 6. Package ciphertext + non-secret metadata.
  return {
    format: EXPORT_FORMAT_ID,
    version: EXPORT_FORMAT_VERSION,
    crypto: {
      algorithm: 'AES-GCM',
      keyDerivation: 'PBKDF2-SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(ciphertext),
  };
}

/**
 * Decrypt an EncryptedExportFile under a passphrase.
 *
 * This is used primarily for testing/format verification and is NOT
 * exposed as an import/restore UI in Phase 19.
 *
 * A wrong passphrase produces a GCM authentication failure and throws —
 * it never silently returns corrupted data.
 */
export async function decryptEncryptedExport(
  encryptedFile: EncryptedExportFile,
  passphrase: string
): Promise<unknown> {
  // Validate format.
  if (
    !encryptedFile ||
    encryptedFile.format !== EXPORT_FORMAT_ID ||
    encryptedFile.version !== EXPORT_FORMAT_VERSION
  ) {
    throw new Error('Unsupported or malformed encrypted export format.');
  }

  const { salt, iv, iterations } = encryptedFile.crypto;

  // Restore salt and IV.
  const saltBytes = base64ToBytes(salt);
  const ivBytes = base64ToBytes(iv);

  // Re-derive the key from the passphrase + stored salt.
  const key = await deriveKeyFromPassphraseWithIterations(
    passphrase,
    saltBytes,
    iterations
  );

  // Decrypt.
  const ciphertextBytes = base64ToBytes(encryptedFile.ciphertext);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as BufferSource,
      },
      key,
      ciphertextBytes as BufferSource
    );

    const decoder = new TextDecoder();
    const plaintextJson = decoder.decode(plaintextBuffer);
    return JSON.parse(plaintextJson);
  } catch (err) {
    // AES-GCM authentication failure — wrong passphrase or corrupted file.
    throw new Error(
      'Decryption failed. The passphrase is incorrect or the file is corrupted.'
    );
  }
}

/**
 * Version of deriveKeyFromPassphrase that respects the iteration count
 * stored in the file (for forward/backward format compatibility during
 * decryption).
 */
async function deriveKeyFromPassphraseWithIterations(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  try {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt as BufferSource,
        iterations,
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH,
      },
      false,
      ['encrypt', 'decrypt']
    );

    return key;
  } finally {
    // Best-effort zeroing of the passphrase bytes in memory.
    passphraseBytes.fill(0);
  }
}
