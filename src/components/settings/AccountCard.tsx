import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';

/**
 * AccountCard - Profile identity for the Settings page.
 *
 * Production: renders the authenticated Firebase user.
 * Demo: renders the synthetic demo identity from DemoContext.
 *
 * No authentication logic lives here - it only reads identity state.
 */

/**
 * Resolve a display name when Firebase provides none.
 * Falls back to the email local-part, then a neutral label.
 */
function resolveDisplayName(
  displayName: string | null | undefined,
  email: string | null | undefined
): string {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Reflectra member';
}

/**
 * Derive initials for the avatar fallback (max two characters).
 */
function resolveInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const AccountCard: React.FC = () => {
  const { user } = useAuth();
  const { demoUser } = useDemo();
  const isDemo = useIsDemoSession();

  const displayName = isDemo
    ? demoUser?.displayName ?? null
    : user?.displayName ?? null;
  const email = isDemo ? demoUser?.email ?? null : user?.email ?? null;
  const photoURL = isDemo ? null : user?.photoURL ?? null;

  const resolvedName = resolveDisplayName(displayName, email);
  const initials = resolveInitials(resolvedName);

  return (
    <div className="settings-card settings-account-card">
      {photoURL ? (
        <img
          src={photoURL}
          alt={`${resolvedName} profile photo`}
          className="settings-avatar"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="settings-avatar settings-avatar-fallback" aria-hidden="true">
          {initials}
        </div>
      )}

      <div className="settings-account-identity">
        <p className="settings-account-name">{resolvedName}</p>
        <p className="settings-account-email">{email ?? 'Email not available'}</p>
        <p className={`settings-account-status${isDemo ? ' preview' : ''}`}>
          <span className="settings-status-dot" aria-hidden="true" />
          {isDemo ? 'Preview session' : 'Signed in'}
        </p>
      </div>
    </div>
  );
};
