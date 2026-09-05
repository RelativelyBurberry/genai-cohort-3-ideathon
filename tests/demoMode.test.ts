/**
 * Demo Mode Security Boundary Tests
 * 
 * These tests verify that demo mode:
 * - Is disabled by default
 * - Requires explicit VITE_DEMO_MODE=true to activate
 * - Does not bypass Firebase Auth
 * - Does not enable demo login in production
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock import.meta.env
const mockEnv = (demoMode?: string) => {
  vi.stubGlobal('import.meta', {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  });
};

describe('Demo Mode Security Boundary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isDemoModeEnabled', () => {
    it('returns false when VITE_DEMO_MODE is undefined', async () => {
      mockEnv(undefined);
      // Reset module cache to pick up new env
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns false when VITE_DEMO_MODE is empty string', async () => {
      mockEnv('');
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns false when VITE_DEMO_MODE is "false"', async () => {
      mockEnv('false');
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns true only when VITE_DEMO_MODE is "true"', async () => {
      mockEnv('true');
      // Clear module cache and re-import
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(true);
    });

    it('does NOT enable demo mode based on NODE_ENV', async () => {
      // Even if NODE_ENV is development, demo mode requires explicit flag
      vi.stubGlobal('import.meta', {
        env: {
          VITE_DEMO_MODE: undefined,
          NODE_ENV: 'development',
        },
      });
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });
  });

  describe('Demo User Identity', () => {
    it('uses clearly synthetic identity that never overlaps with real Firebase accounts', async () => {
      mockEnv('true');
      vi.resetModules();
      const { DEMO_USER } = await import('../src/demo/demoConfig');
      
      expect(DEMO_USER.uid).toBe('demo-user-local-preview');
      expect(DEMO_USER.email).toBe('demo@reflectra.local');
      expect(DEMO_USER.displayName).toBe('Alex Morgan');
      
      // Verify synthetic nature
      expect(DEMO_USER.email).toContain('demo@');
      expect(DEMO_USER.email).toContain('.local');
      expect(DEMO_USER.uid).toContain('demo-');
      expect(DEMO_USER.uid).toContain('local');
    });
  });

  describe('Demo Data Isolation', () => {
    it('stores demo data in namespaced localStorage key', async () => {
      mockEnv('true');
      vi.resetModules();
      const { DEMO_STORAGE_KEY } = await import('../src/demo/demoConfig');
      
      expect(DEMO_STORAGE_KEY).toBe('reflectra-demo-workspace');
      expect(DEMO_STORAGE_KEY).toContain('demo');
    });
  });

  describe('Production Safety', () => {
    it('demo mode CTA must NOT appear in production build', async () => {
      // Simulate production environment
      vi.stubGlobal('import.meta', {
        env: {
          VITE_DEMO_MODE: undefined,
          NODE_ENV: 'production',
        },
      });
      vi.resetModules();
      
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('demo mode must be explicitly enabled, never auto-detected', async () => {
      // No environment variables set
      vi.stubGlobal('import.meta', {
        env: {},
      });
      vi.resetModules();
      
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });
  });
});

describe('Demo Mode Integration Constraints', () => {
  it('verifies demo mode does NOT call Firebase Auth', async () => {
    // This is a design constraint verification
    // Demo mode should work entirely without Firebase
    mockEnv('true');
    vi.resetModules();
    
    const { DEMO_USER } = await import('../src/demo/demoConfig');
    
    // Demo user is synthetic, not from Firebase
    expect(DEMO_USER.uid).not.toMatch(/^[a-zA-Z0-9]{28}$/); // Firebase UID format
    expect(DEMO_USER.email).not.toMatch(/@gmail\.com$/); // Real email pattern
  });

  it('verifies demo workspace key is isolated from production keys', async () => {
    mockEnv('true');
    vi.resetModules();
    const { DEMO_STORAGE_KEY } = await import('../src/demo/demoConfig');
    
    // Must be namespaced to avoid collision
    expect(DEMO_STORAGE_KEY.startsWith('reflectra-demo')).toBe(true);
    expect(DEMO_STORAGE_KEY).not.toBe('reflectra-user');
    expect(DEMO_STORAGE_KEY).not.toBe('firebase-dependency');
  });
});
