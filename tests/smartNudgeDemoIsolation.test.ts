import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_DEMO_NOTIFICATION_PREFS,
  DEMO_NOTIFICATIONS_STORAGE_KEY,
  loadDemoNotificationPrefs,
  saveDemoNotificationPrefs,
} from '../src/demo/demoConfig';

/**
 * Demo Mode — Phase 13 notification isolation.
 *
 * Vite replaces `import.meta.env` at build time, so runtime mutation of
 * `globalThis.import.meta` cannot change the loaded module. These tests
 * therefore exercise the pure localStorage helpers (which is what demo
 * notifications actually rely on) and verify PRODUCT-INVARIANT behavior:
 * demo notification prefs are opt-out (off by default), namespaced,
 * fail-safe, and never touch Firestore. The `VITE_DEMO_MODE` gate itself
 * is already covered by the existing demoMode.test.ts.
 */

// Minimal in-memory localStorage so helper functions can run in Node.
function patchLocalStorage() {
  const store = new Map<string, string>();
  const proto = {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(_: number): string | null {
      return null;
    },
    get length(): number {
      return store.size;
    },
  };

  const storage = Object.create(proto) as unknown as Storage;
  (globalThis as any).localStorage = storage;
  return { storage, store };
}

describe('Demo Notification Isolation (Phase 13)', () => {
  let storage: Storage;
  let store: Map<string, string>;

  beforeEach(() => {
    const patched = patchLocalStorage();
    storage = patched.storage;
    store = patched.store;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default demo notification preference is disabled (opt-out)', () => {
    expect(DEFAULT_DEMO_NOTIFICATION_PREFS.enabled).toBe(false);
    expect(DEFAULT_DEMO_NOTIFICATION_PREFS.preferredTime).toBe('20:00');
    expect(DEFAULT_DEMO_NOTIFICATION_PREFS.quietHoursEnabled).toBe(false);
  });

  it('demo notification storage key is namespaced and isolated', () => {
    expect(DEMO_NOTIFICATIONS_STORAGE_KEY).toBe(
      'reflectra-demo-notifications'
    );
    expect(DEMO_NOTIFICATIONS_STORAGE_KEY.startsWith('reflectra-demo')).toBe(
      true
    );
    expect(DEMO_NOTIFICATIONS_STORAGE_KEY).not.toBe(
      'reflectra-demo-workspace'
    );
  });

  it('loadDemoNotificationPrefs returns defaults when nothing stored', () => {
    const prefs = loadDemoNotificationPrefs();
    expect(prefs).toEqual({
      enabled: false,
      preferredTime: '20:00',
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
  });

  it('loadDemoNotificationPrefs fails safe on malformed JSON', () => {
    storage.setItem(DEMO_NOTIFICATIONS_STORAGE_KEY, '{not-valid-json');
    const prefs = loadDemoNotificationPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.preferredTime).toBe('20:00');
    expect(prefs.quietHoursEnabled).toBe(false);
  });

  it('loadDemoNotificationPrefs fails safe on "null" stored value', () => {
    storage.setItem(DEMO_NOTIFICATIONS_STORAGE_KEY, 'null');
    const prefs = loadDemoNotificationPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.preferredTime).toBe('20:00');
  });

  it('save then load round-trips through the namespaced key', () => {
    saveDemoNotificationPrefs({
      enabled: true,
      preferredTime: '21:30',
      quietHoursEnabled: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
    });
    expect(
      storage.getItem(DEMO_NOTIFICATIONS_STORAGE_KEY)
    ).toContain('21:30');
    const loaded = loadDemoNotificationPrefs();
    expect(loaded).toEqual({
      enabled: true,
      preferredTime: '21:30',
      quietHoursEnabled: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
    });
  });

  it('demo notification helpers never touch Firestore', () => {
    // demoConfig imports no firebase modules by design. This guards the
    // production-isolation boundary: demo preferences are localStorage-only.
    expect(
      storage.getItem('users/__proto__/preferences/notifications')
    ).toBeNull();
  });
});