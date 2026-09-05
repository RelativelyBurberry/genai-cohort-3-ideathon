import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndIncrementRateLimit, RateLimitConfig } from '../server/services/rateLimiter';

/**
 * Mock Firestore database and transaction manager
 * to thoroughly test the distributed rate limiter algorithm.
 * Serializes transactions to accurately reflect Firestore's ACID transaction isolation.
 */
class MockFirestore {
  storage: Map<string, any> = new Map();
  private transactionLock: Promise<void> = Promise.resolve();

  collection(collName: string) {
    return {
      doc: (docId: string) => ({
        collection: (subCollName: string) => ({
          doc: (subDocId: string) => {
            const key = `${collName}/${docId}/${subCollName}/${subDocId}`;
            return {
              key,
              path: key,
            };
          },
        }),
      }),
    };
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const execute = async () => {
      const transaction = {
        get: async (docRef: any) => {
          const data = this.storage.get(docRef.key);
          return {
            exists: !!data,
            data: () => (data ? { ...data } : undefined),
          };
        },
        set: (docRef: any, data: any, options?: any) => {
          const existing = options?.merge ? this.storage.get(docRef.key) || {} : {};
          this.storage.set(docRef.key, { ...existing, ...data });
        },
        update: (docRef: any, data: any) => {
          const existing = this.storage.get(docRef.key) || {};
          this.storage.set(docRef.key, { ...existing, ...data });
        },
      };

      return await updateFunction(transaction);
    };

    // Serialize transaction execution to mirror Firestore's atomic serializable isolation
    const currentLock = this.transactionLock;
    let release: () => void;
    this.transactionLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await currentLock;
      return await execute();
    } finally {
      release!();
    }
  }
}

describe('Distributed Fixed-Window Rate Limiter Service', () => {
  let mockDb: any;
  const config: RateLimitConfig = {
    maxRequests: 3,
    windowSeconds: 60,
  };

  beforeEach(() => {
    mockDb = new MockFirestore();
  });

  it('rejects invalid or empty UIDs', async () => {
    await expect(checkAndIncrementRateLimit('', config, mockDb)).rejects.toThrow(
      'Valid UID is required'
    );
  });

  it('allows the first request and initializes the window', async () => {
    const res = await checkAndIncrementRateLimit('user-123', config, mockDb);

    expect(res.allowed).toBe(true);
    expect(res.count).toBe(1);
    expect(res.limit).toBe(3);
    expect(res.remaining).toBe(2);
    expect(res.retryAfterSeconds).toBe(0);
    expect(res.resetTimeMs).toBeGreaterThan(Date.now());
  });

  it('increments counter sequentially within the active window', async () => {
    const res1 = await checkAndIncrementRateLimit('user-123', config, mockDb);
    expect(res1.count).toBe(1);
    expect(res1.remaining).toBe(2);

    const res2 = await checkAndIncrementRateLimit('user-123', config, mockDb);
    expect(res2.count).toBe(2);
    expect(res2.remaining).toBe(1);

    const res3 = await checkAndIncrementRateLimit('user-123', config, mockDb);
    expect(res3.count).toBe(3);
    expect(res3.remaining).toBe(0);
  });

  it('rejects requests exceeding the maxRequests limit', async () => {
    // Consume quota
    await checkAndIncrementRateLimit('user-123', config, mockDb);
    await checkAndIncrementRateLimit('user-123', config, mockDb);
    await checkAndIncrementRateLimit('user-123', config, mockDb);

    // 4th request must be denied
    const res4 = await checkAndIncrementRateLimit('user-123', config, mockDb);
    expect(res4.allowed).toBe(false);
    expect(res4.count).toBe(3);
    expect(res4.remaining).toBe(0);
    expect(res4.retryAfterSeconds).toBeGreaterThan(0);
    expect(res4.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('isolates rate limits between distinct user UIDs', async () => {
    // User A consumes 3 requests
    await checkAndIncrementRateLimit('user-A', config, mockDb);
    await checkAndIncrementRateLimit('user-A', config, mockDb);
    const resA3 = await checkAndIncrementRateLimit('user-A', config, mockDb);
    expect(resA3.remaining).toBe(0);

    // User A's 4th is blocked
    const resA4 = await checkAndIncrementRateLimit('user-A', config, mockDb);
    expect(resA4.allowed).toBe(false);

    // User B should have full quota independent of User A
    const resB1 = await checkAndIncrementRateLimit('user-B', config, mockDb);
    expect(resB1.allowed).toBe(true);
    expect(resB1.count).toBe(1);
    expect(resB1.remaining).toBe(2);
  });

  it('resets counter when the window duration has elapsed', async () => {
    // First consume limit
    await checkAndIncrementRateLimit('user-123', config, mockDb);
    await checkAndIncrementRateLimit('user-123', config, mockDb);
    await checkAndIncrementRateLimit('user-123', config, mockDb);

    // Manually age the window start time by 65 seconds
    const docKey = 'users/user-123/limits/ai_ratelimit';
    const stored = mockDb.storage.get(docKey);
    mockDb.storage.set(docKey, {
      ...stored,
      windowStartMs: Date.now() - 65 * 1000,
    });

    // Next request should reset window and allow request
    const resReset = await checkAndIncrementRateLimit('user-123', config, mockDb);
    expect(resReset.allowed).toBe(true);
    expect(resReset.count).toBe(1);
    expect(resReset.remaining).toBe(2);
  });

  it('handles simulated concurrent requests without race condition leaks', async () => {
    // Run 5 requests in parallel with limit=3
    const promises = [
      checkAndIncrementRateLimit('user-concurrent', config, mockDb),
      checkAndIncrementRateLimit('user-concurrent', config, mockDb),
      checkAndIncrementRateLimit('user-concurrent', config, mockDb),
      checkAndIncrementRateLimit('user-concurrent', config, mockDb),
      checkAndIncrementRateLimit('user-concurrent', config, mockDb),
    ];

    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    // Exactly 3 allowed and 2 rejected
    expect(allowed.length).toBe(3);
    expect(rejected.length).toBe(2);
  });
});
