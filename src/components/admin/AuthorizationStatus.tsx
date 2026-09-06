/**
 * AuthorizationStatus - Demo Admin Console: Authorization Status section
 * 
 * Shows the currently authenticated user's role and access scope.
 * Makes the RBAC boundary visible during the demo.
 */

import React from 'react';
import { CheckCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useDemo, useIsDemoSession } from '../../demo';

export const AuthorizationStatus: React.FC = () => {
  const { user } = useAuth();
  const { role, roleInfo, roleResolved } = useRole();
  const { demoUser } = useDemo();
  const isDemo = useIsDemoSession();

  const identity = isDemo ? demoUser : user;
  const displayName = identity?.displayName ?? 'Reflectra member';
  const email = identity?.email ?? null;
  
  return (
    <div className="admin-card admin-authorization-card" id="admin-auth-status">
      <p className="admin-card-kicker">AUTHORIZATION STATUS</p>
      <h2 className="admin-card-title">Account authorization</h2>
      
      <div className="admin-auth-grid">
        <div className="admin-auth-item">
          <span className="admin-auth-label">Account</span>
          <span className="admin-auth-value">{displayName}</span>
          {email && <span className="admin-auth-sub">{email}</span>}
        </div>
        
        <div className="admin-auth-item">
          <span className="admin-auth-label">Role</span>
          <span className={`admin-role-badge admin-role-${role.toLowerCase()}`}>
            {role.toUpperCase()}
          </span>
        </div>
        
        <div className="admin-auth-item">
          <span className="admin-auth-label">Authorization</span>
          <span className="admin-auth-value auth-verified">
            <CheckCircle className="admin-auth-icon" aria-hidden="true" />
            {roleResolved ? 'Verified' : 'Pending'}
          </span>
        </div>
        
        <div className="admin-auth-item">
          <span className="admin-auth-label">Access Scope</span>
          <span className={`admin-auth-value ${role === 'admin' ? 'scope-admin' : 'scope-user'}`}>
            {roleInfo.accessScope}
          </span>
        </div>
      </div>

      <div className="admin-auth-note">
        <ShieldCheck className="admin-auth-note-icon" aria-hidden="true" />
        <span>
          {isDemo
            ? 'Demo mode: role is demonstrated locally and never affects production authorization. In production, roles are resolved exclusively server-side from the admin email allowlist.'
            : 'Production: role resolved server-side from the verified Firebase token via the admin email allowlist.'}
        </span>
      </div>
    </div>
  );
};