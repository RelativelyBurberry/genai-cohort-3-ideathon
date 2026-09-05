import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';

export interface RateLimitConfig {
  maxRequests: number; // default: 10
  windowSeconds: number; // default: 60
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

export const DEFAULT_AI_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowSeconds: 60,
};

// In-Memory Fallback Rate Limiter for sandbox preview environments where database IAM is blocked
interface InMemoryLimit {
  count: number;
  windowStartMs: number;
}

const inMemoryLimits = new Map<string, InMemoryLimit>();

// Periodically clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [uid, limit] of inMemoryLimits.entries()) {
    if (now - limit.windowStartMs >= 300000) { // Keep entries for up to 5 mins
      inMemoryLimits.delete(uid);
    }
  }
}, 300000);

function checkAndIncrementInMemory(
  uid: string,
  config: RateLimitConfig
): RateLimitResult {
  const nowMs = Date.now();
  const windowDurationMs = config.windowSeconds * 1000;

  let limit = inMemoryLimits.get(uid);

  if (!limit || nowMs - limit.windowStartMs >= windowDurationMs || nowMs < limit.windowStartMs) {
    // New or expired window
    const newLimit = {
      count: 1,
      windowStartMs: nowMs,
    };
    inMemoryLimits.set(uid, newLimit);
    const resetTimeMs = nowMs + windowDurationMs;

    return {
      allowed: true,
      count: 1,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTimeMs,
      retryAfterSeconds: 0,
    };
  }

  const resetTimeMs = limit.windowStartMs + windowDurationMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - nowMs) / 1000));

  if (limit.count >= config.maxRequests) {
    return {
      allowed: false,
      count: limit.count,
      limit: config.maxRequests,
      remaining: 0,
      resetTimeMs,
      retryAfterSeconds,
    };
  }

  limit.count += 1;
  return {
    allowed: true,
    count: limit.count,
    limit: config.maxRequests,
    remaining: config.maxRequests - limit.count,
    resetTimeMs,
    retryAfterSeconds: 0,
  };
}

/**
 * Distributed fixed-window rate limiter backed by Cloud Firestore transactions.
 * Operates on a single document per user: `/users/{uid}/limits/ai_ratelimit`.
 * Fallback to secure in-memory rate limiter in the sandbox environment.
 */
export async function checkAndIncrementRateLimit(
  uid: string,
  config: RateLimitConfig = DEFAULT_AI_RATE_LIMIT,
  customDb?: Firestore
): Promise<RateLimitResult> {
  if (!uid || typeof uid !== 'string') {
    throw new Error('Valid UID is required for rate limit check.');
  }

  // Preview environment detection: If FIREBASE_CHECK_REVOKED is set to false,
  // we bypass the Firestore Admin SDK to avoid permission-denied errors.
  const isPreview = process.env.FIREBASE_CHECK_REVOKED === 'false' && !customDb;
  if (isPreview) {
    console.log(`[RATE_LIMIT] [SANDBOX_PREVIEW] Enforcing in-memory rate limiter for user ${uid}`);
    return checkAndIncrementInMemory(uid, config);
  }

  try {
    const db = customDb || getAdminDb();
    const limitDocRef = db.collection('users').doc(uid).collection('limits').doc('ai_ratelimit');

    const nowMs = Date.now();
    const windowDurationMs = config.windowSeconds * 1000;

    return await db.runTransaction(async (transaction) => {
      const docSnapshot = await transaction.get(limitDocRef);
      const data = docSnapshot.data();

      let windowStartMs = nowMs;
      let currentCount = 0;

      if (docSnapshot.exists && data) {
        const storedStart = data.windowStartMs || (data.windowStart?.toMillis ? data.windowStart.toMillis() : null);
        if (typeof storedStart === 'number') {
          windowStartMs = storedStart;
        }
        if (typeof data.count === 'number') {
          currentCount = data.count;
        }
      }

      const elapsed = nowMs - windowStartMs;

      // Window has expired or is in the future (clock skew guard) -> Reset window
      if (!docSnapshot.exists || elapsed >= windowDurationMs || elapsed < 0) {
        const newCount = 1;
        const resetTimeMs = nowMs + windowDurationMs;

        transaction.set(
          limitDocRef,
          {
            windowStartMs: nowMs,
            count: newCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return {
          allowed: true,
          count: newCount,
          limit: config.maxRequests,
          remaining: Math.max(0, config.maxRequests - newCount),
          resetTimeMs,
          retryAfterSeconds: 0,
        };
      }

      // Window is currently active
      const resetTimeMs = windowStartMs + windowDurationMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - nowMs) / 1000));

      if (currentCount >= config.maxRequests) {
        // Limit exceeded; do NOT increment count
        return {
          allowed: false,
          count: currentCount,
          limit: config.maxRequests,
          remaining: 0,
          resetTimeMs,
          retryAfterSeconds,
        };
      }

      // Within limit; increment count atomically
      const newCount = currentCount + 1;
      transaction.update(limitDocRef, {
        count: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        allowed: true,
        count: newCount,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - newCount),
        resetTimeMs,
        retryAfterSeconds: 0,
      };
    });
  } catch (err: any) {
    const isPermissionDenied = err?.code === 7 || err?.message?.includes('PERMISSION_DENIED');
    if (isPermissionDenied) {
      console.warn(`[RATE_LIMIT] Firestore Admin transaction failed with PERMISSION_DENIED. Falling back to secure in-memory rate limiting for user ${uid}.`);
      return checkAndIncrementInMemory(uid, config);
    }
    throw err;
  }
}
