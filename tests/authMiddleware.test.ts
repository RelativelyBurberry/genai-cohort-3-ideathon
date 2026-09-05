import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireAuth, AuthenticatedRequest, isRevocationCheckEnabled } from '../server/middleware/auth';
import * as adminHelper from '../server/firebaseAdmin';

describe('Auth Middleware (requireAuth) & Configuration', () => {
  const originalEnv = process.env.FIREBASE_CHECK_REVOKED;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FIREBASE_CHECK_REVOKED = originalEnv;
    } else {
      delete process.env.FIREBASE_CHECK_REVOKED;
    }
  });

  describe('isRevocationCheckEnabled() helper', () => {
    it('defaults to true when FIREBASE_CHECK_REVOKED is undefined (secure production baseline)', () => {
      delete process.env.FIREBASE_CHECK_REVOKED;
      expect(isRevocationCheckEnabled()).toBe(true);
    });

    it('returns true when FIREBASE_CHECK_REVOKED is set to "true"', () => {
      process.env.FIREBASE_CHECK_REVOKED = 'true';
      expect(isRevocationCheckEnabled()).toBe(true);
    });

    it('returns false when FIREBASE_CHECK_REVOKED is explicitly set to "false"', () => {
      process.env.FIREBASE_CHECK_REVOKED = 'false';
      expect(isRevocationCheckEnabled()).toBe(false);
    });
  });

  describe('Common Token Rejections (both modes)', () => {
    it('rejects requests missing the Authorization header with 401', async () => {
      const req = { headers: {} } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/missing-token');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects requests with malformed Bearer headers with 401', async () => {
      const req = { headers: { authorization: 'Basic 12345' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/missing-token');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects empty Bearer tokens with 401', async () => {
      const req = { headers: { authorization: 'Bearer   ' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/malformed-token');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Mode: Production Revocation-Aware (FIREBASE_CHECK_REVOKED=true)', () => {
    beforeEach(() => {
      process.env.FIREBASE_CHECK_REVOKED = 'true';
    });

    it('calls verifyIdToken(token, true) and derives UID exclusively from verified token', async () => {
      const fakeAuth = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'verified-prod-uid-100',
          email: 'user@example.com',
        }),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer valid-prod-token' } } as AuthenticatedRequest;
      const res = {} as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(fakeAuth.verifyIdToken).toHaveBeenCalledTimes(1);
      expect(fakeAuth.verifyIdToken).toHaveBeenCalledWith('valid-prod-token', true);
      expect(req.user?.uid).toBe('verified-prod-uid-100');
      expect(req.user?.email).toBe('user@example.com');
      expect(next).toHaveBeenCalled();
    });

    it('catches revoked tokens and returns auth/token-revoked error (401)', async () => {
      const revokedError: any = new Error('Token revoked');
      revokedError.code = 'auth/id-token-revoked';

      const fakeAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(revokedError),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer revoked-token' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/token-revoked');
      expect(next).not.toHaveBeenCalled();
    });

    it('catches expired tokens and returns auth/token-expired error (401)', async () => {
      const expiredError: any = new Error('Token expired');
      expiredError.code = 'auth/id-token-expired';

      const fakeAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(expiredError),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer expired-token' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/token-expired');
      expect(next).not.toHaveBeenCalled();
    });

    it('does NOT silently fall back to verifyIdToken(token, false) if revocation check fails', async () => {
      const internalError: any = new Error('Identity Toolkit lookup failed');
      internalError.code = 'auth/internal-error';

      const fakeAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(internalError),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer some-token' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      // Must be rejected with 401 and not retried with false
      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/invalid-token');
      expect(fakeAuth.verifyIdToken).toHaveBeenCalledTimes(1);
      expect(fakeAuth.verifyIdToken).toHaveBeenCalledWith('some-token', true);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Mode: Preview Compatibility (FIREBASE_CHECK_REVOKED=false)', () => {
    beforeEach(() => {
      process.env.FIREBASE_CHECK_REVOKED = 'false';
    });

    it('calls verifyIdToken(token, false) and derives UID exclusively from verified token', async () => {
      const fakeAuth = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'verified-preview-uid-200',
          email: 'preview-user@example.com',
        }),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer preview-token' } } as AuthenticatedRequest;
      const res = {} as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(fakeAuth.verifyIdToken).toHaveBeenCalledTimes(1);
      expect(fakeAuth.verifyIdToken).toHaveBeenCalledWith('preview-token', false);
      expect(req.user?.uid).toBe('verified-preview-uid-200');
      expect(req.user?.email).toBe('preview-user@example.com');
      expect(next).toHaveBeenCalled();
    });

    it('rejects expired tokens with auth/token-expired (401) in preview mode', async () => {
      const expiredError: any = new Error('Token expired');
      expiredError.code = 'auth/id-token-expired';

      const fakeAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(expiredError),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer expired-preview-token' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/token-expired');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects invalid/forged tokens with auth/invalid-token (401) in preview mode', async () => {
      const invalidError: any = new Error('Invalid signature');
      invalidError.code = 'auth/argument-error';

      const fakeAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(invalidError),
      };
      vi.spyOn(adminHelper, 'getAdminAuth').mockReturnValue(fakeAuth as any);

      const req = { headers: { authorization: 'Bearer forged-token' } } as AuthenticatedRequest;
      const res = {
        statusCode: 200,
        jsonPayload: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.jsonPayload = payload;
          return this;
        },
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.jsonPayload.error).toBe('auth/invalid-token');
      expect(next).not.toHaveBeenCalled();
    });
  });
});
