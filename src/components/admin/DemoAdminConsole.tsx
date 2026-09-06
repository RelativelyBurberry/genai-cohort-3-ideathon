/**
 * DemoAdminConsole - Reflectra Demo Admin Console
 * 
 * A compact, polished admin-only experience for demonstrating
 * Reflectra's role-based access control at a hackathon.
 * 
 * Access is protected by AdminRouteBoundary (client presentation
 * boundary) AND requireAdmin middleware (backend authoritative boundary).
 * 
 * Privacy-safe: displays only aggregate, anonymized system status.
 * NEVER displays:
 * - Another user's journal/reflection content
 * - Raw Gemini prompts or responses
 * - Authentication tokens
 * - Private Firestore documents
 * - Personally identifiable reflection content
 */

import React, { useState } from 'react';
import { Shield, ShieldCheck, UserRound, ChevronDown, ChevronUp } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useIsDemoSession, useDemo, DEMO_ROLES, type DemoRole } from '../../demo';
import { AdminRouteBoundary } from './AdminRouteBoundary';
import { AuthorizationStatus } from './AuthorizationStatus';
import { AuthorizationBoundaryDemo } from './AuthorizationBoundaryDemo';
import { PrivacySafeSystemOverview } from './PrivacySafeSystemOverview';
import { SecurityDemonstration } from './SecurityDemonstration';

interface DemoAdminConsoleProps {
  onGoBack?: () => void;
}

export const DemoAdminConsole: React.FC<DemoAdminConsoleProps> = ({ onGoBack }) => {
  const { isAdmin, role } = useRole();
  const isDemo = useIsDemoSession();
  const { demoRole, setDemoRole } = useDemo();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  // In demo mode, allow switching between USER and ADMIN demo roles.
  // This is a CLIENT-SIDE DEMONSTRATION ONLY and never affects
  // production authorization, which is resolved server-side.
  const renderRoleSwitcher = () => {
    if (!isDemo) return null;

    const selectRole = (nextRole: DemoRole) => {
      setDemoRole(nextRole);
      setShowRoleSwitcher(false);
    };

    return (
      <div className="admin-demo-role-switcher" id="admin-demo-role-switcher">
        <div className="admin-demo-role-header">
          <span className="admin-demo-role-title">
            <Shield className="admin-demo-role-icon" aria-hidden="true" />
            Demo role switcher
          </span>
          <button
            type="button"
            className="admin-demo-role-toggle"
            onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
            aria-expanded={showRoleSwitcher}
            aria-label="Toggle demo role switcher"
          >
            {showRoleSwitcher ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
        </div>
        <p className="admin-demo-role-note">
          Demonstration only. Roles are resolved server-side in production and cannot be
          changed from the client.
        </p>
        {showRoleSwitcher && (
          <div className="admin-demo-role-options">
            <button
              type="button"
              className={`admin-demo-role-option ${demoRole === DEMO_ROLES.user ? 'selected' : ''}`}
              onClick={() => selectRole(DEMO_ROLES.user)}
            >
              <UserRound className="admin-demo-role-option-icon" aria-hidden="true" />
              <span>
                <strong>USER</strong>
                <small>Regular user · personal reflections only</small>
              </span>
            </button>
            <button
              type="button"
              className={`admin-demo-role-option ${demoRole === DEMO_ROLES.admin ? 'selected' : ''}`}
              onClick={() => selectRole(DEMO_ROLES.admin)}
            >
              <ShieldCheck className="admin-demo-role-option-icon" aria-hidden="true" />
              <span>
                <strong>ADMIN</strong>
                <small>Administrative demo controls</small>
              </span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminRouteBoundary onGoBack={onGoBack}>
      <div className="admin-console" id="admin-console">
        <div className="page-wrap admin-page-wrap">
          {/* Header */}
          <header className="admin-console-header">
            <p className="eyebrow">DEMO ADMIN CONSOLE</p>
            <h1>
              Administrative <em>controls</em>
            </h1>
            <p>
              Role-based access control demonstration. This console is visible only to
              accounts with verified administrative access.
            </p>
          </header>

          {/* Demo role switcher (demo sessions only) */}
          {renderRoleSwitcher()}

          {/* Role visibility & authorization status */}
          <AuthorizationStatus />

          {/* Authorization boundary demonstration */}
          <AuthorizationBoundaryDemo />

          {/* Privacy-safe system overview */}
          <PrivacySafeSystemOverview />

          {/* Security demonstration */}
          <SecurityDemonstration />

          {/* Footer: access scope disclosure */}
          <div className="admin-console-footer">
            <div className="admin-console-footer-badge">
              <ShieldCheck className="admin-console-footer-icon" aria-hidden="true" />
              <span>
                <strong>ROLE {role.toUpperCase()}</strong>
                <small>
                  {isAdmin
                    ? 'Administrative demo controls enabled'
                    : 'Personal reflections only'}
                </small>
              </span>
            </div>
            <p className="admin-console-footer-note">
              Reflectra admin console · privacy-safe aggregate status only · no user
              reflection content is exposed.
            </p>
          </div>
        </div>
      </div>
    </AdminRouteBoundary>
  );
};