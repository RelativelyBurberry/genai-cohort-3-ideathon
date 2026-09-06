/**
 * AdminRouteBoundary - Explicit protected route boundary for admin access
 * 
 * SECURITY MODEL:
 * This component is the CLIENT-SIDE presentation boundary only.
 * The AUTHORITATIVE authorization boundary is the backend
 * requireAdmin middleware which validates roles server-side.
 * 
 * A regular user attempting to navigate directly to the admin route:
 * - Is denied access
 * - Receives a clear authorization message
 * - Does NOT receive admin data
 * - Does NOT silently become an admin
 * 
 * Even if the client boundary is bypassed, the backend still rejects
 * unprivileged requests with 403.
 */

import React from 'react';
import { ShieldAlert, ShieldCheck, Lock, ArrowLeft } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import type { UserRole } from '../../types/rbac';

export interface AdminRouteBoundaryProps {
  /** What to render when the user IS an admin */
  children: React.ReactNode;
  /** Callback to return to a safe view (e.g., home) */
  onGoBack?: () => void;
}

/**
 * AdminRouteBoundary - Guards a route requiring admin role
 * 
 * - role === 'admin'  → renders children (the admin console)
 * - role !== 'admin'  → renders a Restricted Area denial screen
 * - role unresolved   → renders a loading state (never flashes admin content)
 */
export const AdminRouteBoundary: React.FC<AdminRouteBoundaryProps> = ({ children, onGoBack }) => {
  const { role, roleResolved, loading } = useRole();

  // While role is resolving, never render admin content
  if (loading || !roleResolved) {
    return (
      <div className="admin-boundary admin-boundary-loading">
        <div className="admin-boundary-card">
          <div className="admin-boundary-icon">
            <ShieldCheck className="admin-boundary-icon-svg" />
          </div>
          <h2>Verifying authorization…</h2>
          <p>Confirming your access level before showing administrative controls.</p>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="admin-boundary admin-boundary-denied">
        <div className="admin-boundary-card">
          <div className="admin-boundary-icon admin-boundary-icon-denied">
            <ShieldAlert className="admin-boundary-icon-svg" />
          </div>
          <p className="admin-boundary-eyebrow">RESTRICTED AREA</p>
          <h2>Access denied</h2>
          <p>
            Your account does not have permission
            <br />
            to access administrative controls.
          </p>
          <div className="admin-boundary-details">
            <span>
              <Lock className="admin-boundary-detail-icon" aria-hidden="true" />
              Resolved role: <strong>{(role as UserRole).toUpperCase()}</strong>
            </span>
            <span className="admin-boundary-detail-divider" aria-hidden="true">•</span>
            <span>Authorization verified server-side</span>
          </div>
          {onGoBack && (
            <button type="button" className="btn btn-secondary" onClick={onGoBack}>
              <ArrowLeft className="admin-boundary-back-icon" aria-hidden="true" />
              Return to your workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  // Authorized: render the protected children
  return <>{children}</>;
};