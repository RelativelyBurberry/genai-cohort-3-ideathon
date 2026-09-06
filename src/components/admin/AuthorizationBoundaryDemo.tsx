/**
 * AuthorizationBoundaryDemo - Demo Admin Console: Authorization Boundary Demonstration
 * 
 * Provides a visible demonstration of the authorization boundary working:
 * - USER attempting admin access → DENIED
 * - ADMIN accessing console → ALLOWED
 * 
 * Includes a live test that calls the protected backend endpoint
 * to prove server-side enforcement (production mode only).
 */

import React, { useState, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Lock, KeyRound, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useIsDemoSession } from '../../demo';

interface TestState {
  loading: boolean;
  result: 'allowed' | 'denied' | null;
  statusCode: number | null;
  message: string | null;
  attempted: boolean;
}

export const AuthorizationBoundaryDemo: React.FC = () => {
  const { getIdToken } = useAuth();
  const { role } = useRole();
  const isDemo = useIsDemoSession();

  const [userTest, setUserTest] = useState<TestState>({
    loading: false,
    result: null,
    statusCode: null,
    message: null,
    attempted: false,
  });

  const [adminTest, setAdminTest] = useState<TestState>({
    loading: false,
    result: null,
    statusCode: null,
    message: null,
    attempted: false,
  });

  /**
   * Demonstrate that attempting to call the admin-only endpoint
   * as the CURRENT role resolves correctly OR is rejected.
   */
  const runAuthorizationTest = useCallback(async (target: 'current' | 'simulatedAdmin') => {
    if (isDemo) {
      // Demo mode: simulate the boundary client-side ONLY.
      // This NEVER sends anything to a real backend.
      const set = target === 'current' ? setUserTest : setAdminTest;
      if (target === 'current') {
        // In demo mode, the resolved role determines the simulation result
        const isAdminRole = role === 'admin';
        setUserTest({
          loading: false,
          result: isAdminRole ? 'allowed' : 'denied',
          statusCode: isAdminRole ? 200 : 403,
          message: isAdminRole
            ? 'Demo simulation: admin role granted access.'
            : 'Demo simulation: user role denied access (would return 403 server-side).',
          attempted: true,
        });
      } else {
        setAdminTest({
          loading: false,
          result: null,
          statusCode: null,
          message: 'Demo mode: simulated admin context would be allowed. Real backend authorization is enforced in production.',
          attempted: true,
        });
      }
      return;
    }

    // Production mode: make a real backend call to prove server-side enforcement
    const set = target === 'current' ? setUserTest : setAdminTest;
    set({ loading: true, result: null, statusCode: null, message: null, attempted: true });

    try {
      const token = await getIdToken(false);
      if (!token) {
        set({ loading: false, result: 'denied', statusCode: 401, message: 'No authentication token available.', attempted: true });
        return;
      }

      const response = await fetch('/api/admin/demo/authorize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json().catch(() => null);

      if (response.ok) {
        set({
          loading: false,
          result: 'allowed',
          statusCode: response.status,
          message: json?.message || 'Administrative authorization verified.',
          attempted: true,
        });
      } else {
        set({
          loading: false,
          result: 'denied',
          statusCode: response.status,
          message: json?.message || `Access denied (HTTP ${response.status}).`,
          attempted: true,
        });
      }
    } catch (err: any) {
      set({
        loading: false,
        result: 'denied',
        statusCode: 500,
        message: err?.message || 'Authorization test failed.',
        attempted: true,
      });
    }
  }, [getIdToken, isDemo, role]);

  return (
    <div className="admin-card admin-boundary-demo" id="admin-boundary-demo">
      <p className="admin-card-kicker">AUTHORIZATION BOUNDARY DEMONSTRATION</p>
      <h2 className="admin-card-title">Prove the boundary</h2>
      <p className="admin-card-copy">
        Directly test whether the current session can call an admin-only operation.
        This validates server-side enforcement — not just hidden UI.
      </p>

      <div className="admin-demo-tests">
        {/* Test: current role */}
        <div className="admin-demo-test">
          <div className="admin-demo-test-header">
            <KeyRound className="admin-demo-test-icon" aria-hidden="true" />
            <span className="admin-demo-test-label">
              Test 1 · Authenticated admin operation as <strong>{role.toUpperCase()}</strong>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary admin-demo-test-button"
            onClick={() => runAuthorizationTest('current')}
            disabled={userTest.loading}
          >
            {userTest.loading ? (
              <RefreshCw className="admin-demo-test-spinner" aria-hidden="true" />
            ) : (
              <ShieldCheck className="admin-demo-test-button-icon" aria-hidden="true" />
            )}
            {userTest.loading ? 'Verifying…' : 'Run authorization test'}
          </button>
          {userTest.attempted && !userTest.loading && (
            <div className={`admin-demo-result admin-demo-result-${userTest.result === 'allowed' ? 'allowed' : 'denied'}`}>
              {userTest.result === 'allowed' ? (
                <CheckCircle className="admin-demo-result-icon" aria-hidden="true" />
              ) : (
                <XCircle className="admin-demo-result-icon" aria-hidden="true" />
              )}
              <span>
                <strong>HTTP {userTest.statusCode}</strong> — {userTest.message}
              </span>
            </div>
          )}
        </div>

        {/* Boundary explanation */}
        <div className="admin-demo-boundary">
          <div className="admin-demo-boundary-line">
            <span className="admin-demo-boundary-icon-wrap">
              <Lock className="admin-demo-boundary-icon" aria-hidden="true" />
            </span>
            <span>
              <strong>The server authorization boundary</strong> lives in the{' '}
              <code>requireAdmin</code> middleware. Even if the UI were bypassed,
              the backend independently rejects any non-admin token with HTTP 403.
            </span>
          </div>
          <div className="admin-demo-boundary-line">
            <span className="admin-demo-boundary-icon-wrap">
              <ShieldAlert className="admin-demo-boundary-icon" aria-hidden="true" />
            </span>
            <span>
              A regular <strong>USER</strong> who navigates directly to this console
              sees the Restricted Area denial — and receives no admin data.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};