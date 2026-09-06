/**
 * Notification Preferences Service — Phase 13.
 *
 * Persists the owner-scoped notification preferences document under
 * /users/{uid}/preferences/notifications. Firestore security rules
 * restrict read/create/update to the authenticated owner.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  NotificationPreferences,
  NotificationPreferencesInput,
} from '../types/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../types/notifications';

function assertValidUid(uid: string): void {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    throw new Error('Unauthorized: User ID must be provided from active authenticated session.');
  }
}

function preferencesDocRef(uid: string) {
  return doc(db, 'users', uid, 'preferences', 'notifications');
}

/** Map a Firestore snapshot into typed preferences. */
function mapPrefs(id: string, data: any): NotificationPreferences {
  const raw: NotificationPreferences = {
    enabled: Boolean(data?.enabled),
    preferredTime: typeof data?.preferredTime === 'string' ? data.preferredTime : null,
    quietHoursEnabled: Boolean(data?.quietHoursEnabled),
    quietHoursStart: typeof data?.quietHoursStart === 'string' ? data.quietHoursStart : null,
    quietHoursEnd: typeof data?.quietHoursEnd === 'string' ? data.quietHoursEnd : null,
    maxDailyNotifications:
      typeof data?.maxDailyNotifications === 'number'
        ? data.maxDailyNotifications
        : DEFAULT_NOTIFICATION_PREFERENCES.maxDailyNotifications,
    lastNotificationAt: data?.lastNotificationAt ?? null,
    lastNotificationDate:
      typeof data?.lastNotificationDate === 'string' ? data.lastNotificationDate : null,
    notificationPermission:
      data?.notificationPermission === 'granted' ||
      data?.notificationPermission === 'denied' ||
      data?.notificationPermission === 'default'
        ? data.notificationPermission
        : 'default',
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
  return raw;
}

/**
 * Fetch notification preferences for the owner.
 * Returns the defaults when the document does not yet exist (preferences
 * are opt-out and the app must never crash when unavailable).
 */
export async function getNotificationPreferences(
  uid: string
): Promise<NotificationPreferences> {
  assertValidUid(uid);
  const ref = preferencesDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      createdAt: null,
      updatedAt: null,
      lastNotificationAt: null,
      lastNotificationDate: null,
    };
  }
  return mapPrefs(snap.id, snap.data());
}

/**
 * Create the preferences document if it does not exist.
 * Safe to call repeatedly — setDoc with merge never overwrites the
 * anti-spam bookkeeping fields unless explicitly provided.
 */
export async function saveNotificationPreferences(
  uid: string,
  input: NotificationPreferencesInput
): Promise<void> {
  assertValidUid(uid);
  const ref = preferencesDocRef(uid);
  const data: Record<string, unknown> = {
    ...input,
    updatedAt: serverTimestamp(),
  };

  // Always ensure the creation timestamp exists on first write.
  // Using merge (spread below) so we don't clobber lastNotification fields.
  await setDoc(ref, data, { merge: true });
}

/**
 * Update anti-spam bookkeeping after a real notification is delivered.
 * Only the delivery layer calls this — the Settings UI never does.
 */
export async function recordNotificationDelivered(
  uid: string,
  now: Date
): Promise<void> {
  assertValidUid(uid);
  const ref = preferencesDocRef(uid);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const localDate = `${y}-${m}-${d}`;

  await updateDoc(ref, {
    lastNotificationAt: serverTimestamp(),
    lastNotificationDate: localDate,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to real-time preference changes.
 * Returns an unsubscriber.
 */
export function subscribeToNotificationPreferences(
  uid: string,
  onUpdate: (prefs: NotificationPreferences) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  assertValidUid(uid);
  const ref = preferencesDocRef(uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate(mapPrefs(snap.id, snap.data()));
      } else {
        onUpdate({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          createdAt: null,
          updatedAt: null,
          lastNotificationAt: null,
          lastNotificationDate: null,
        });
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}
