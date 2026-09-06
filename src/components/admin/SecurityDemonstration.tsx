/**
 * SecurityDemonstration - Demo Admin Console: Security checks summary
 * 
 * A visually clear section explaining which security checks are
 * ACTUALLY implemented in Reflectra.
 * 
 * IMPORTANT: Only claims checks that are genuinely implemented.
 * Each line maps to a real architectural component:
 * 
 * - ✓ Authentication verified          → requireAuth middleware (Firebase ID token verification)
 * - ✓ Role resolved                    → resolveUserRole (server-side admin email allowlist)
 * - ✓ Route authorization enforced     → AdminRouteBoundary + requireAdmin middleware
 * - ✓ Server authorization boundary    → requireAdmin returns 403 for non-admins
 * - ✓ Cross-user access denied         → Firestore rules isOwner() scoping
 */

import React from 'react';
import { CheckCircle, ShieldCheck, Fingerprint, KeyRound, Route as RouteIcon, Server, Users } from 'lucide-react';

interface SecurityCheck {
  icon: React.ReactNode;
  label: string;
  detail: string;
}

const SECURITY_CHECKS: SecurityCheck[] = [
  {
    icon: <Fingerprint className="admin-security-check-icon" aria-hidden="true" />,
    label: 'Authentication verified',
    detail: 'Firebase ID tokens are cryptographically verified server-side (requireAuth).',
  },
  {
    icon: <ShieldCheck className="admin-security-check-icon" aria-hidden="true" />,
    label: 'Role resolved',
    detail: 'Roles resolved exclusively from the server-side admin email allowlist. Missing role = user.',
  },
  {
    icon: <RouteIcon className="admin-security-check-icon" aria-hidden="true" />,
    label: 'Route authorization enforced',
    detail: 'The admin route is guarded by AdminRouteBoundary AND backend requireAdmin middleware.',
  },
  {
    icon: <Server className="admin-security-check-icon" aria-hidden="true" />,
    label: 'Server authorization boundary active',
    detail: 'Admin-only API endpoints return 403 for non-admin tokens regardless of UI state.',
  },
  {
    icon: <Users className="admin-security-check-icon" aria-hidden="true" />,
    label: 'Cross-user reflection access denied',
    detail: 'Firestore rules scope all reads/writes to the document owner (isOwner).',
  },
];

export const SecurityDemonstration: React.FC = () => {
  return (
    <div className="admin-card admin-security-card" id="admin-security-demo">
      <p className="admin-card-kicker">SECURITY DEMONSTRATION</p>
      <h2 className="admin-card-title">Authorization boundaries in action</h2>
      <p className="admin-card-copy">
        Reflectra enforces these boundaries at multiple layers — not just in the UI.
      </p>

      <ul className="admin-security-checks">
        {SECURITY_CHECKS.map((check) => (
          <li key={check.label} className="admin-security-check">
            <CheckCircle className="admin-security-check-status" aria-hidden="true" />
            <span className="admin-security-check-icon-wrap">{check.icon}</span>
            <span className="admin-security-check-text">
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
          </li>
        ))}
      </ul>

      <div className="admin-security-privacy-note">
        <KeyRound className="admin-security-privacy-icon" aria-hidden="true" />
        <p>
          <strong>Privacy note:</strong> Administrative access demonstrates system
          status indicators only. It never exposes another user's journal entries,
          reflection messages, raw AI prompts/responses, or tokens.
        </p>
      </div>
    </div>
  );
};