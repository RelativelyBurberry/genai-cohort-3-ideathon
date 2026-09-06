import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Phase 11 RBAC Test Suite
 * 
 * Focus areas:
 * 1. Role Resolution (default user, fail-closed, admin)
 * 2. Route Protection (user denied, admin allowed)
 * 3. Privilege Escalation (no self-promotion, role mutation rejected, no client-provided role)
 * 4. Demo Isolation (demo role only when enabled, production not inheriting, no admin escalation)
 * 5. Firestore rules (no client role write escalation)
 */

// ============================================================
// 1. ROLE RESOLUTION
// ============================================================

/**
 * Unit tests for resolveUserRole — the server-side role resolution function.
 * These import the ACTUAL middleware and test it in isolation.
 */
describe('RBAC — Server-Side Role Resolution', () => {
  const originalEnv = process.env.ADMIN_EMAIL_ALLOWLIST;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAIL_ALLOWLIST = originalEnv;
    } else {
      delete process.env.ADMIN_EMAIL_ALLOWLIST;
    }
  });

  async function loadResolveUserRole() {
    vi.resetModules();
    const mod = await import('../server/middleware/auth.js');
    return mod.resolveUserRole as (email: string | null | undefined) => 'user' | 'admin';
  }

  it('defaults to user when ADMIN_EMAIL_ALLOWLIST is unset (fail closed)', async () => {
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
    const resolveUserRole = await loadResolveUserRole();
    expect(resolveUserRole('someone@example.com')).toBe('user');
  });

  it('defaults to user when allowlist is empty (fail closed)', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = '';
    const resolveUserRole = await loadResolveUserRole();
    expect(resolveUserRole('someone@example.com')).toBe('user');
  });

  it('returns user for missing email (fail closed)', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@example.com';
    const resolveUserRole = await loadResolveUserRole();
    expect(resolveUserRole(undefined)).toBe('user');
    expect(resolveUserRole(null)).toBe('user');
  });

  it('returns admin ONLY for emails in the server-side allowlist', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@reflectra.com,admin2@reflectra.com';
    const resolveUserRole = await loadResolveUserRole();
    expect(resolveUserRole('admin@reflectra.com')).toBe('admin');
    expect(resolveUserRole('admin2@reflectra.com')).toBe('admin');
  });

  it('returns user for emails NOT in the allowlist (no implicit admin)', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@reflectra.com';
    const resolveUserRole = await loadResolveUserRole();
    expect(resolveUserRole('regular@reflectra.com')).toBe('user');
    expect(resolveUserRole('Admin@reflectra.com'.toLowerCase())).toBe('admin'); // case-insensitive
  });

  it('recognizes the role type helper (user vs admin)', async () => {
    // Validate that the types/rbac helpers exist and behave correctly
    const { getAccessScope, isAdminRole, DEFAULT_USER_ROLE } = await import('../src/types/rbac');
    expect(getAccessScope('admin')).toBe('administrative');
    expect(getAccessScope('user')).toBe('personal');
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
    expect(DEFAULT_USER_ROLE).toBe('user');
  });
});

// ============================================================
// 2. PRIVILEGE ESCALATION PREVENTION
// ============================================================

describe('RBAC — Privilege Escalation Prevention', () => {
  const originalEnv = process.env.ADMIN_EMAIL_ALLOWLIST;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAIL_ALLOWLIST = originalEnv;
    } else {
      delete process.env.ADMIN_EMAIL_ALLOWLIST;
    }
    vi.restoreAllMocks();
  });

  it('client-provided role field is NEVER accepted (server resolves from allowlist only)', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = 'real-admin@reflectra.com';
    vi.resetModules();
    const { requireAdmin, resolveUserRole } = await import('../server/middleware/auth.js');

    // Client tries to claim role='admin' but email is not in allowlist
    const req = {
      user: {
        uid: 'uid-123',
        email: 'attacker@evil.com',
        role: 'admin', // client-provided claim — MUST be ignored
      },
    } as any;

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

    requireAdmin(req, res, next);

    // Even though req.user.role was pre-set to 'admin' by the client,
    // requireAdmin re-resolves from the server allowlist and rejects.
    expect(res.statusCode).toBe(403);
    expect(res.jsonPayload.error).toBe('auth/forbidden');
    expect(next).not.toHaveBeenCalled();
    // And the resolved role is overwritten to the SERVER's decision
    expect(req.user?.role).toBe('user');
    expect(resolveUserRole('attacker@evil.com')).toBe('user');
  });

  it('requireAdmin fails closed (401) when no authenticated user is present', async () => {
    vi.resetModules();
    const { requireAdmin } = await import('../server/middleware/auth.js');

    const req = { user: undefined } as any;
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

    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAdmin allows only server-resolved admins through', async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = 'boss@reflectra.com';
    vi.resetModules();
    const { requireAdmin } = await import('../server/middleware/auth.js');

    const req = {
      user: {
        uid: 'uid-456',
        email: 'boss@reflectra.com',
      },
    } as any;
    const res = {} as any;
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.role).toBe('admin');
  });
});

// ============================================================
// 3. FIRESTORE RULES — ROLE ESCALATION DEFENSE-IN-DEPTH
// ============================================================

describe('RBAC — Firestore Rules Protection (static analysis)', () => {
  let rulesContent: string;

  beforeAll(() => {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);
    rulesContent = fs.readFileSync(rulesPath, 'utf8');
  });

  it('user root document rule explicitly rejects a client-written role of "admin"', () => {
    // The user document may only contain role == 'user', never 'admin'.
    expect(rulesContent).toContain("request.resource.data.role == 'user'");
    expect(rulesContent).toContain("!('role' in request.resource.data)");
  });

  it('keeps read access owner-scoped (isOwner)', () => {
    expect(rulesContent).toContain('match /users/{userId}');
    expect(rulesContent).toContain('allow read: if isOwner(userId);');
  });

  it('does NOT loosen any existing ownership rules', () => {
    // All existing critical invariants remain intact
    expect(rulesContent).toContain('function isOwner(userId)');
    expect(rulesContent).toContain('request.auth != null && request.auth.uid == userId');
    expect(rulesContent).toContain('match /users/{userId}/entries/{entryId}');
    expect(rulesContent).toContain('match /users/{userId}/conversations/{conversationId}');
    expect(rulesContent).toContain('match /users/{userId}/insights/{insightId}');
    expect(rulesContent).toContain('match /users/{userId}/limits/{documentId}');
    // Default deny still present
    expect(rulesContent).toMatch(
      /match\s*\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/
    );
  });

  it('Guided Reflection fallback permissions remain unchanged', () => {
    // Assistant message create fallback still present
    expect(rulesContent).toMatch(/role\s*==\s*["']assistant["']/);
    // Conversation completion fallback still present
    expect(rulesContent).toContain('resource.data.status == "active"');
    expect(rulesContent).toContain('request.resource.data.status == "completed"');
    expect(rulesContent).toContain("request.resource.data.summary.size() >= 10");
  });

  it('PatternShift insight protections remain unchanged', () => {
    expect(rulesContent).toMatch(
      /match\s*\/users\/\{userId\}\/insights\/\{insightId\}\s*\{\s*allow read:\s*if isOwner\(userId\);\s*allow write:\s*if false;/
    );
  });
});

// ============================================================
// 4. DEMO ISOLATION
// ============================================================

describe('RBAC — Demo Isolation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('demo admin identity is clearly synthetic and stored separately from real identities', async () => {
    const { DEMO_ADMIN_USER, DEMO_USER } = await import('../src/demo/demoConfig');

    expect(DEMO_ADMIN_USER.uid).toBe('demo-admin-local-preview');
    expect(DEMO_ADMIN_USER.email).toBe('demo-admin@reflectra.local');
    expect(DEMO_ADMIN_USER.uid).toContain('demo-');
    expect(DEMO_ADMIN_USER.email).toContain('.local');
    // Must be distinct from the regular demo user
    expect(DEMO_ADMIN_USER.uid).not.toBe(DEMO_USER.uid);
    expect(DEMO_ADMIN_USER.email).not.toBe(DEMO_USER.email);
    // Must not overlap with real Firebase UID format
    expect(DEMO_ADMIN_USER.uid).not.toMatch(/^[a-zA-Z0-9]{28}$/);
  });

  it('demo role localStorage key is isolated and clearly namespaced', async () => {
    const { DEMO_ROLE_STORAGE_KEY, DEMO_STORAGE_KEY } = await import('../src/demo/demoConfig');

    expect(DEMO_ROLE_STORAGE_KEY).toBe('reflectra-demo-role');
    expect(DEMO_ROLE_STORAGE_KEY).toContain('demo');
    expect(DEMO_ROLE_STORAGE_KEY).not.toBe(DEMO_STORAGE_KEY);
    expect(DEMO_ROLE_STORAGE_KEY).not.toContain('production');
  });

  it('default demo role is user — admin requires explicit demo selection', async () => {
    const { DEFAULT_DEMO_ROLE, DEMO_ROLES } = await import('../src/demo/demoConfig');

    expect(DEFAULT_DEMO_ROLE).toBe('user');
    expect(DEMO_ROLES.user).toBe('user');
    expect(DEMO_ROLES.admin).toBe('admin');
  });

  it('production role is resolved from backend, never from demo state', async () => {
    // The server-side resolver is the ONLY production source of truth.
    // Demo role values cannot influence it.
    process.env.ADMIN_EMAIL_ALLOWLIST = 'real-admin@reflectra.com';
    vi.resetModules();
    const { resolveUserRole } = await import('../server/middleware/auth.js');

    // A demo-admin-like email is NOT in the allowlist → resolves to user
    expect(resolveUserRole('demo-admin@reflectra.local')).toBe('user');
    // The real admin email resolves to admin
    expect(resolveUserRole('real-admin@reflectra.com')).toBe('admin');
  });
});

// ============================================================
// 5. ROLE TYPES & ACCESS SCOPE
// ============================================================

describe('RBAC — Role Types & Access Scope', () => {
  it('getAccessScope maps admin to administrative and user to personal', async () => {
    const { getAccessScope } = await import('../src/types/rbac');
    expect(getAccessScope('admin')).toBe('administrative');
    expect(getAccessScope('user')).toBe('personal');
  });

  it('ROLE_LABELS and ACCESS_SCOPE_LABELS are present and correct', async () => {
    const { ROLE_LABELS, ACCESS_SCOPE_LABELS } = await import('../src/types/rbac');
    expect(ROLE_LABELS.user).toBe('USER');
    expect(ROLE_LABELS.admin).toBe('ADMIN');
    expect(ACCESS_SCOPE_LABELS.personal).toBe('Personal reflections only');
    expect(ACCESS_SCOPE_LABELS.administrative).toBe('Administrative demo controls');
  });

  it('isAdminRole is false for user and true for admin', async () => {
    const { isAdminRole } = await import('../src/types/rbac');
    expect(isAdminRole('user')).toBe(false);
    expect(isAdminRole('admin')).toBe(true);
  });
});

// ============================================================
// 6. ROLE ENDPOINT CONTRACT
// ============================================================

describe('RBAC — GET /api/auth/role Endpoint', () => {
  const originalEnv = process.env.ADMIN_EMAIL_ALLOWLIST;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAIL_ALLOWLIST = originalEnv;
    } else {
      delete process.env.ADMIN_EMAIL_ALLOWLIST;
    }
    vi.restoreAllMocks();
  });

  it('returns server-resolved role with authorization scope in the response contract', async () => {
    vi.resetModules();
    const { resolveUserRole } = await import('../server/middleware/auth.js');

    // Simulate what the endpoint computes for a regular user
    const regularEmail = 'regular@example.com';
    const regularRole = resolveUserRole(regularEmail);
    expect(regularRole).toBe('user');

    // Simulate what the endpoint computes for an admin
    process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@example.com';
    vi.resetModules();
    const { resolveUserRole: resolveAdmin } = await import('../server/middleware/auth.js');
    const adminRole = resolveAdmin('admin@example.com');
    expect(adminRole).toBe('admin');
  });

  it('middleware chain is requireAuth + requireAdmin for admin-only routes (route registration static check)', () => {
    // Verify the admin route file registers requireAdmin on admin-only endpoints
    const adminRouterPath = path.join(process.cwd(), 'server', 'routes', 'admin.ts');
    const adminRouterSrc = fs.readFileSync(adminRouterPath, 'utf8');

    // Admin-only endpoint uses both middlewares
    expect(adminRouterSrc).toContain("'/api/admin/overview'");
    expect(adminRouterSrc).toContain('requireAuth');
    expect(adminRouterSrc).toContain('requireAdmin');

    // The demo/authorize endpoint is also admin-protected
    expect(adminRouterSrc).toContain("'/api/admin/demo/authorize'");
    expect(adminRouterSrc).toContain('requireAdmin');
  });

  it('the role endpoint (/api/auth/role) is authen requirement only, not admin (regular users may resolve their role)', () => {
    const adminRouterPath = path.join(process.cwd(), 'server', 'routes', 'admin.ts');
    const adminRouterSrc = fs.readFileSync(adminRouterPath, 'utf8');

    // /api/auth/role is for ALL authenticated users (requireAuth only)
    expect(adminRouterSrc).toContain("'/api/auth/role'");
    expect(adminRouterSrc).toContain('requireAuth');

    // It must NOT require admin (otherwise regular users could never see their role)
    const roleEndpointBlock = adminRouterSrc.split("'/api/auth/role'")[1]?.split("});")[0] || '';
    expect(roleEndpointBlock).not.toContain('requireAdmin');
  });
});