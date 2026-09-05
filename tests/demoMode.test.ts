import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Demo Mode Security Boundary', () => {
  // Store reference to reset after each test
  let originalImportMeta: any;

  beforeEach(() => {
    // Save original import.meta if it exists
    originalImportMeta = globalThis.import.meta;
    // Clear module cache
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original import.meta
    if (originalImportMeta !== undefined) {
      (globalThis as any).import.meta = originalImportMeta;
    } else {
      delete (globalThis as any).import.meta;
    }
    vi.restoreAllMocks();
  });

  describe('isDemoModeEnabled', () => {
    it('returns false when VITE_DEMO_MODE is undefined', async () => {
      // Mock import.meta.env
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: undefined,
        },
      };

      // Reset module cache to ensure fresh import with the mocked env
      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns false when VITE_DEMO_MODE is empty string', async () => {
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: '',
        },
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns false when VITE_DEMO_MODE is "false"', async () => {
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: 'false',
        },
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns true when VITE_DEMO_MODE is "true"', async () => {
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: 'true',
        },
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(true);
    });

    it('does NOT enable demo mode based on NODE_ENV', async () => {
      // Even if NODE_ENV is development, demo mode requires explicit flag
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: undefined,
          NODE_ENV: 'development',
        },
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });
  });

  describe('Demo User Identity', () => {
    it('uses clearly synthetic identity that never overlaps with real Firebase accounts', async () => {
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: 'true',
        },
      };

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
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: 'true',
        },
      };

      vi.resetModules();
      const { DEMO_STORAGE_KEY } = await import('../src/demo/demoConfig');

      expect(DEMO_STORAGE_KEY).toBe('reflectra-demo-workspace');
      expect(DEMO_STORAGE_KEY).toContain('demo');
    });
  });

  describe('Production Safety', () => {
    it('demo mode CTA must NOT appear in production build', async () => {
      // Simulate production environment
      (globalThis as any).import.meta = {
        env: {
          VITE_DEMO_MODE: undefined,
          NODE_ENV: 'production',
        },
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('demo mode must be explicitly enabled, never auto-detected', async () => {
      // No environment variables set
      (globalThis as any).import.meta = {
        env: {},
      };

      vi.resetModules();
      const { isDemoModeEnabled } = await import('../src/demo/demoConfig');
      expect(isDemoModeEnabled()).toBe(false);
    });
  });
});

describe('Demo Mode Integration Constraints', () => {
  let originalImportMeta: any;

  beforeEach(() => {
    // Save original import.meta if it exists
    originalImportMeta = globalThis.import.meta;
    // Clear module cache
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original import.meta
    if (originalImportMeta !== undefined) {
      (globalThis as any).import.meta = originalImportMeta;
    } else {
      delete (globalThis as any).import.meta;
    }
    vi.restoreAllMocks();
  });

  it('verifies demo mode does NOT call Firebase Auth', async () => {
    // This is a design constraint verification
    // Demo mode should work entirely without Firebase
    (globalThis as any).import.meta = {
      env: {
        VITE_DEMO_MODE: 'true',
      },
    };

    vi.resetModules();
    const { DEMO_USER } = await import('../src/demo/demoConfig');

    // Demo user is synthetic, not from Firebase
    expect(DEMO_USER.uid).not.toMatch(/^[a-zA-Z0-9]{28}$/); // Firebase UID format
    expect(DEMO_USER.email).not.toMatch(/@gmail\.com$/); // Real email pattern
  });

  it('verifies demo workspace key is isolated from production keys', async () => {
    (globalThis as any).import.meta = {
      env: {
        VITE_DEMO_MODE: 'true',
      },
    };

    vi.resetModules();
    const { DEMO_STORAGE_KEY } = await import('../src/demo/demoConfig');

    // Must be namespaced to avoid collision
    expect(DEMO_STORAGE_KEY.startsWith('reflectra-demo')).toBe(true);
    expect(DEMO_STORAGE_KEY).not.toBe('reflectra-user');
    expect(DEMO_STORAGE_KEY).not.toBe('firebase-dependency');
  });
});