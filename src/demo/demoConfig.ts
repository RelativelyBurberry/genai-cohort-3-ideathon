/**
 * Demo Mode Configuration
 * 
 * SECURITY: Demo mode is gated by VITE_DEMO_MODE environment variable.
 * It is DISABLED by default and must be explicitly enabled.
 * 
 * Demo mode:
 * - Does NOT create Firebase tokens
 * - Does NOT call backend APIs
 * - Does NOT write to production Firestore
 * - Does NOT invoke Gemini
 * - Uses only local synthetic data
 * 
 * DEMO ROLE SWITCHING:
 * Demo role switching is a CLIENT-SIDE DEMONSTRATION ONLY.
 * It NEVER affects production authorization which is resolved
 * exclusively server-side from the admin email allowlist.
 * Demo roles are stored in a SEPARATE localStorage key and
 * are never sent to any backend endpoint.
 */

/**
 * Check if demo mode is explicitly enabled via environment variable.
 * Returns false if VITE_DEMO_MODE is absent, empty, or "false".
 */
export function isDemoModeEnabled(): boolean {
  // Vite exposes env vars on import.meta.env
  // @ts-ignore - Vite provides these types at build time
  const flag = import.meta.env.VITE_DEMO_MODE;
  return flag === 'true';
}

/**
 * Demo user identity - clearly synthetic, never overlaps with real Firebase accounts.
 */
export const DEMO_USER = {
  uid: 'demo-user-local-preview',
  displayName: 'Alex Morgan',
  email: 'demo@reflectra.local',
  photoURL: null,
} as const;

/**
 * Demo ADMIN identity - clearly synthetic demo admin context.
 * Used ONLY in demo sessions to demonstrate the admin experience.
 * This is CLIENT-SIDE DEMO DATA ONLY.
 * It does NOT affect production authorization.
 */
export const DEMO_ADMIN_USER = {
  uid: 'demo-admin-local-preview',
  displayName: 'Alex Morgan (Demo Admin)',
  email: 'demo-admin@reflectra.local',
  photoURL: null,
} as const;

/**
 * Demo roles available for switching during a demo session.
 * These are DEMONSTRATION-ONLY roles for the client-side UI.
 * Production authorization ALWAYS resolves roles from the
 * server-side admin email allowlist, never from these values.
 */
export const DEMO_ROLES = {
  user: 'user',
  admin: 'admin',
} as const;

export type DemoRole = typeof DEMO_ROLES[keyof typeof DEMO_ROLES];

/**
 * LocalStorage key for demo role selection.
 * Namespaced SEPARATELY from workspace data to emphasize
 * that this is demonstration-only state.
 */
export const DEMO_ROLE_STORAGE_KEY = 'reflectra-demo-role';

/**
 * Default demo role: authenticated users default to 'user'.
 * Admin must be explicitly selected.
 */
export const DEFAULT_DEMO_ROLE: DemoRole = 'user';

/**
 * Load the demo role from localStorage (defaults to user).
 */
export function loadDemoRole(): DemoRole {
  try {
    const stored = localStorage.getItem(DEMO_ROLE_STORAGE_KEY);
    if (stored === 'admin' || stored === 'user') {
      return stored as DemoRole;
    }
  } catch (err) {
    console.warn('[demoConfig] Failed to load demo role:', err);
  }
  return DEFAULT_DEMO_ROLE;
}

/**
 * Save the demo role to localStorage.
 * This is DEMONSTRATION-ONLY state and never used for real authorization.
 */
export function saveDemoRole(role: DemoRole): void {
  try {
    localStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
  } catch (err) {
    console.warn('[demoConfig] Failed to save demo role:', err);
  }
}

/**
 * Reset demo role to default (user).
 */
export function resetDemoRole(): void {
  try {
    localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
  } catch (err) {
    console.warn('[demoConfig] Failed to reset demo role:', err);
  }
}

/**
 * LocalStorage key for demo workspace persistence.
 * Namespaced to avoid collision with production data.
 */
export const DEMO_STORAGE_KEY = 'reflectra-demo-workspace';

/**
 * Reset demo workspace to initial fixture state.
 */
export function resetDemoWorkspace(): void {
  localStorage.removeItem(DEMO_STORAGE_KEY);
}
