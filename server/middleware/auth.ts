import { Request, Response, NextFunction } from 'express';
import { getAdminAuth } from '../firebaseAdmin.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
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
