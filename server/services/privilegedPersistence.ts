/**
 * Privileged Persistence Capability
 *
 * Backend-owned Firestore writes (assistant messages, conversation lifecycle
 * transitions, PatternShift insights) MUST be performed using a privileged
 * server identity (Firebase Admin SDK). They are NEVER authorized via a
 * user's Firebase ID token, because strict Firestore rules intentionally
 * deny client-derived writes to these surfaces.
 *
 * This module is the single source of truth for that authority boundary.
 *
 * Failure mode:
 *   If the runtime identity lacks Firestore IAM for the target database
 *   (e.g. the constrained AI Studio preview sandbox), the Admin SDK call
 *   fails with a `PERMISSION_DENIED` (code 7). That failure is mapped to
 *   `BackendPersistenceUnavailableError` and surfaced as a stable API
 *   error code `BACKEND_PERSISTENCE_UNAVAILABLE`. The handler MUST NOT
 *   fall back to user-token REST, MUST NOT weaken the rules, and MUST
 *   NOT silently swallow the failure.
 */

/**
 * Stable machine-readable error code returned to clients when a
 * backend-owned write cannot complete because the runtime lacks
 * privileged Firestore authority.
 */
export const BACKEND_PERSISTENCE_UNAVAILABLE = 'BACKEND_PERSISTENCE_UNAVAILABLE';

/**
 * Typed error representing the absence of privileged Firestore authority
 * in the current runtime.
 *
 * This error is safe to surface across the API boundary: it carries a
 * stable error code and a generic, non-leaking message. It does NOT
 * expose internal IAM diagnostics, service account names, project IDs,
 * or raw Google permission strings.
 */
export class BackendPersistenceUnavailableError extends Error {
  public readonly code: string = BACKEND_PERSISTENCE_UNAVAILABLE;
  public readonly operation: string;
  public readonly httpStatus: number = 503;

  constructor(operation: string, cause?: unknown) {
    super(
      'Privileged backend persistence is unavailable in the current runtime.'
    );
    this.name = 'BackendPersistenceUnavailableError';
    this.operation = operation;
    // Preserve the underlying cause for internal logging only; it is
    // never returned to the client.
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

/**
 * Stable machine-readable error code returned to callers when a
 * backend-owned Firestore READ cannot complete because the runtime
 * lacks privileged Firestore IAM authority.
 *
 * This is distinct from `BACKEND_PERSISTENCE_UNAVAILABLE` (writes).
 * The PatternShift route uses it to decide when a narrowly scoped,
 * validated client-supplied analysis payload may be used instead of
 * server-side Firestore reads — and ONLY for that verified capability
 * failure, never for arbitrary errors.
 */
export const BACKEND_READ_UNAVAILABLE = 'BACKEND_READ_UNAVAILABLE';

/**
 * Typed error representing the absence of privileged Firestore READ
 * authority in the current runtime (e.g. the constrained AI Studio
 * preview sandbox where the service account lacks Firestore IAM).
 *
 * Safe to surface across the API boundary: it carries a stable error
 * code and a generic, non-leaking message.
 */
export class BackendReadUnavailableError extends Error {
  public readonly code: string = BACKEND_READ_UNAVAILABLE;
  public readonly operation: string;

  constructor(operation: string, cause?: unknown) {
    super(
      'Privileged backend Firestore reads are unavailable in the current runtime.'
    );
    this.name = 'BackendReadUnavailableError';
    this.operation = operation;
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

/**
 * Wrap a backend-owned READ operation so that any Admin SDK permission
 * failure is converted to a `BackendReadUnavailableError`. Other errors
 * are rethrown unchanged so legitimate bugs are never masked.
 *
 * NOTE: This is a verified *infrastructure capability* signal only.
 * Authentication/authorization failures and malformed data are NOT
 * mapped here — they propagate unchanged.
 */
export async function withBackendReadCapability<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAdminPermissionDeniedError(err)) {
      throw new BackendReadUnavailableError(operation, err);
    }
    throw err;
  }
}

/**
 * Classify an error from the Firebase Admin SDK as a privileged-
 * authority failure. Returns true when the error indicates the
 * runtime identity lacks Firestore IAM (e.g. `code === 7`, a numeric
 * status `7` from the gRPC layer, or a `PERMISSION_DENIED` status).
 */
export function isAdminPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as Record<string, any>;

  // gRPC PERMISSION_DENIED surfaces as code 7 from firebase-admin.
  if (e.code === 7) {
    return true;
  }
  if (typeof e.code === 'string' && e.code === '7') {
    return true;
  }
  // Some layers wrap the error; check message conservatively.
  const message = typeof e.message === 'string' ? e.message : '';
  if (
    message.includes('PERMISSION_DENIED') ||
    message.includes('Missing or insufficient permissions')
  ) {
    return true;
  }
  return false;
}

/**
 * Wrap a backend-owned write operation so that any Admin SDK
 * permission failure is converted to a `BackendPersistenceUnavailableError`.
 * Other errors are rethrown unchanged so legitimate bugs are not masked.
 */
export async function withBackendPersistenceCapability<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAdminPermissionDeniedError(err)) {
      throw new BackendPersistenceUnavailableError(operation, err);
    }
    throw err;
  }
}

/**
 * Map a thrown error to the wire-level API response shape for a
 * backend-owned write failure. Centralised so the route layer never
 * has to know about internal error classes.
 */
export function toBackendPersistenceApiResponse(err: unknown, operation: string): {
  status: number;
  body: {
    error: string;
    message: string;
    diagnostics: { operation: string; failureClass: string };
  };
} {
  if (err instanceof BackendPersistenceUnavailableError) {
    return {
      status: err.httpStatus,
      body: {
        error: err.code,
        message:
          'Reflection services are temporarily unavailable. Please try again later.',
        diagnostics: {
          operation: err.operation || operation,
          failureClass: 'backend_persistence_unavailable',
        },
      },
    };
  }

  // Defensive fallback: if some other unexpected error reaches the
  // backend-owned write boundary, do not claim success. Treat as a
  // service-unavailable so the client can surface a clear failure
  // and the user can retry.
  return {
    status: 503,
    body: {
      error: BACKEND_PERSISTENCE_UNAVAILABLE,
      message:
        'Reflection services are temporarily unavailable. Please try again later.',
      diagnostics: {
        operation,
        failureClass: 'backend_persistence_unexpected',
      },
    },
  };
}
