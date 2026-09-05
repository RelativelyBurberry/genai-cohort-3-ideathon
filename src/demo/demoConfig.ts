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
