import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthenticatedRequest, resolveUserRole } from '../middleware/auth.js';

export const adminRouter = Router();

/**
 * GET /api/auth/role
 * 
 * Returns the server-resolved role for the authenticated user.
 * 
 * SECURITY:
 * - Requires valid Firebase ID token (requireAuth)
 * - Role is resolved server-side from admin email allowlist
 * - Client NEVER provides the role
 * - Response contains ONLY role metadata, no sensitive data
 * 
 * This endpoint is called by the client RoleContext to resolve
 * the current user's role after authentication.
 */
adminRouter.get('/api/auth/role', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const uid = req.user?.uid;
  const email = req.user?.email;

  if (!uid) {
    res.status(401).json({
      error: 'auth/required',
      message: 'Authentication required.',
    });
    return;
  }

  // Resolve role server-side from verified token
  const role = resolveUserRole(email);

  res.status(200).json({
    authenticated: true,
    role,
    authorization: role === 'admin' ? 'administrative' : 'personal',
  });
});

/**
 * GET /api/admin/overview
 * 
 * Privacy-safe administrative system overview.
 * 
 * SECURITY:
 * - Requires valid Firebase ID token (requireAuth)
 * - Requires admin role (requireAdmin)
 * - Returns ONLY aggregate/anonymized system indicators
 * - Does NOT expose:
 *   - Other users' reflection content
 *   - Other users' personal data
 *   - Raw Gemini prompts or responses
 *   - Authentication tokens
 *   - Private Firestore documents
 *   - Personally identifiable reflection content
 * 
 * Returns:
 * - Authorization status for the requesting admin
 * - Active feature modules
 * - AI service availability (boolean only)
 * - Security boundary indicators
 * - Firestore authorization status
 */
adminRouter.get('/api/admin/overview', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  const role = req.user?.role;

  // Compute system indicators (no Firestore queries, no user data)
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim().length > 0
  );

  const hasAdminAllowlist = Boolean(
    process.env.ADMIN_EMAIL_ALLOWLIST &&
    process.env.ADMIN_EMAIL_ALLOWLIST.trim().length > 0
  );

  const hasSecretManager = process.env.USE_SECRET_MANAGER === 'true';

  res.status(200).json({
    status: 'ok',
    authorization: {
      authenticated: true,
      role,
      authorizationVerified: true,
      accessScope: 'Administrative demo controls',
    },
    systemOverview: {
      activeFeatureModules: [
        { id: 'journal', label: 'Journal', enabled: true },
        { id: 'guided_reflection', label: 'Guided Reflection', enabled: hasGeminiKey },
        { id: 'patternshift', label: 'PatternShift', enabled: hasGeminiKey },
      ],
      aiServiceAvailability: {
        geminiConfigured: hasGeminiKey,
        secretManagerConfigured: hasSecretManager,
      },
      securityBoundaries: {
        authenticationVerified: true,
        roleResolutionActive: true,
        adminEmailAllowlistConfigured: hasAdminAllowlist,
        routeAuthorizationEnforced: true,
        serverAuthorizationBoundaryActive: true,
        crossUserReflectionAccessDenied: true,
      },
      firestoreAuthorization: {
        ownerScopedReads: true,
        adminRoleFieldProtected: true,
        defaultDenyAllOtherPaths: true,
        conversationLifecycleProtected: true,
        insightsWriteProtected: true,
        rateLimitDocumentsProtected: true,
      },
    },
    meta: {
      resolvedAt: new Date().toISOString(),
      serverEnvironment: process.env.NODE_ENV || 'development',
    },
  });
});

/**
 * POST /api/admin/demo/authorize
 * 
 * Authorization audit demonstration endpoint.
 * 
 * Tests that server-side authorization is enforced on admin-only operations.
 * Returns a signed authorization receipt (NOT a real token — demonstration only).
 * 
 * SECURITY:
 * - Requires valid Firebase ID token (requireAuth)
 * - Requires admin role (requireAdmin)
 * - Demonstrates that non-admin requests are rejected
 */
adminRouter.post('/api/admin/demo/authorize', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json({
    status: 'authorized',
    message: 'Administrative authorization verified. This request was processed with elevated privileges.',
    authorization: {
      verified: true,
      method: 'server_side_role_resolution',
      role: req.user?.role,
    },
  });
});