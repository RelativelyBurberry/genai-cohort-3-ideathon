import { Request, Response, NextFunction } from 'express';
import { getAdminAuth } from '../firebaseAdmin.js';

export type UserRole = 'user' | 'admin';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role?: UserRole;
  };
  token?: string;
}

/**
 * Resolves whether session revocation checking is enabled.
 * Default behavior is secure: Defaults to true (production mode) unless explicitly set to 'false'.
 */
export function isRevocationCheckEnabled(): boolean {
  if (process.env.FIREBASE_CHECK_REVOKED !== undefined) {
    return process.env.FIREBASE_CHECK_REVOKED.trim().toLowerCase() === 'true';
  }
  // Secure default for production environments
  return true;
}

/**
 * Startup-safe logger that reports ONLY whether token revocation checking is enabled or disabled.
 * Never logs tokens, credentials, or sensitive headers.
 */
export function logAuthConfigStartup(): void {
  const checkRevoked = isRevocationCheckEnabled();
  if (checkRevoked) {
    console.log(
      '[AUTH_CONFIG] Firebase Token Verification Mode: PRODUCTION_REVOCATION_AWARE (checkRevoked=true)'
    );
  } else {
    console.warn(
      '[AUTH_CONFIG] Firebase Token Verification Mode: PREVIEW_COMPATIBILITY_MODE (checkRevoked=false). ' +
      'Revocation lookup bypassed due to ambient ADC project boundaries in AI Studio Preview. ' +
      'Cryptographic RS256 token verification remains strictly enforced.'
    );
  }
}

/**
 * Environment-aware Firebase ID token verification middleware.
 * Enforces authenticated identity by deriving UID exclusively from the verified token.
 * Rejects missing, malformed, expired, invalid, or revoked tokens safely.
 *
 * In Production (FIREBASE_CHECK_REVOKED=true):
 *   Executes full verification including Identity Toolkit revocation check.
 * In Preview Compatibility Mode (FIREBASE_CHECK_REVOKED=false):
 *   Executes full cryptographic verification (RS256 signature, issuer, audience, expiration)
 *   without requiring Identity Toolkit service account credentials.
 *
 * Does NOT silently fall back if revocation checking fails when checkRevoked=true.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'auth/missing-token',
      message: 'Authorization header with Bearer token is required.',
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      error: 'auth/malformed-token',
      message: 'Bearer token format is malformed.',
    });
    return;
  }

  const checkRevoked = isRevocationCheckEnabled();

  try {
    const auth = getAdminAuth();
    // Cryptographic verification of signature, issuer, audience, and expiration.
    // If checkRevoked is true, also queries Identity Toolkit API for revocation status.
    const decodedToken = await auth.verifyIdToken(token, checkRevoked);

    if (!decodedToken || !decodedToken.uid) {
      res.status(401).json({
        error: 'auth/invalid-token',
        message: 'Invalid identity payload in token.',
      });
      return;
    }

    // Attach verified user identity exclusively derived from token
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
    req.token = token;

    next();
  } catch (err: any) {
    const errorCode = err?.code || 'auth/unauthorized';
    const errorMessage = err?.message || 'Authentication failed.';

    // Privacy-safe error logging: log ONLY error code, sanitized message, and mode
    console.error('[AUTH_VERIFICATION_FAILURE]', {
      code: errorCode,
      message: errorMessage,
      checkRevoked,
    });

    if (errorCode === 'auth/id-token-revoked') {
      res.status(401).json({
        error: 'auth/token-revoked',
        message: 'User session has been revoked. Please sign in again.',
      });
      return;
    }

    if (errorCode === 'auth/id-token-expired') {
      res.status(401).json({
        error: 'auth/token-expired',
        message: 'Authentication token has expired. Please refresh credentials.',
      });
      return;
    }

    // Generic safe error response - never log raw tokens or expose internal stacks
    res.status(401).json({
      error: 'auth/invalid-token',
      message: 'Authentication failed. Please sign in again.',
    });
  }
}

// ============================================================
// RBAC: Role Resolution & Admin Authorization
// ============================================================

/**
 * Resolves the admin email allowlist from the server-side environment variable.
 * NEVER VITE_ prefixed. NEVER exposed to the client.
 * 
 * Format: ADMIN_EMAIL_ALLOWLIST="admin1@example.com,admin2@example.com"
 * 
 * SECURITY: This list is the authoritative source of admin role assignment.
 * A user's role is determined EXCLUSIVELY by membership in this server-side list.
 * Absence of entries means ALL authenticated users are regular 'user's.
 * Absence of the env var means NO users are admins (fail-safe).
 */
function getAdminEmailAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!raw || !raw.trim()) {
    return new Set();
  }
  return new Set(
    raw.split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Resolve the role for a verified, authenticated user.
 * 
 * SECURITY:
 * - Role is resolved EXCLUSIVELY from the server-side allowlist.
 * - The client NEVER provides or controls the role.
 * - A missing or empty allowlist means ALL authenticated users are 'user'.
 * - Absence of a role NEVER implies admin access (fail closed).
 * 
 * This function MUST be called only after requireAuth has verified
 * the Firebase ID token and populated req.user.
 */
export function resolveUserRole(email: string | undefined | null): UserRole {
  if (!email) {
    return 'user';
  }
  const allowlist = getAdminEmailAllowlist();
  return allowlist.has(email.toLowerCase()) ? 'admin' : 'user';
}

/**
 * Middleware: requireAdmin
 * 
 * Must be used AFTER requireAuth in the middleware chain.
 * Verifies that the authenticated user has admin privileges
 * based on server-side role resolution.
 * 
 * SECURITY:
 * - Fails closed: if auth is missing, returns 401
 * - Fails closed: if role is not admin, returns 403
 * - Never trusts client-provided role fields
 * - Never trusts Firestore-writable role fields
 * - Role is resolved from server-side environment configuration
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Fail closed if authentication context is missing
  if (!req.user || !req.user.uid) {
    res.status(401).json({
      error: 'auth/required',
      message: 'Authentication required for administrative access.',
    });
    return;
  }

  // Resolve role server-side from verified token email
  const role = resolveUserRole(req.user.email);

  // Attach resolved role to request
  req.user.role = role;

  if (role !== 'admin') {
    // Privacy-safe: do NOT reveal that admin exists or what the allowlist is
    console.warn('[ADMIN_AUTHORIZATION_DENIED]', {
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      role,
    });

    res.status(403).json({
      error: 'auth/forbidden',
      message: 'Your account does not have permission to access administrative controls.',
    });
    return;
  }

  next();
}
