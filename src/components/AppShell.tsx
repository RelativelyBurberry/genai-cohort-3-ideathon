import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, CheckCircle, Server, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useIsDemoSession } from '../demo';
import { AppSidebar, type AppView } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import { HomeDashboard } from './HomeDashboard';
import { JournalDashboard } from './journal/JournalDashboard';
import { GuidedReflectionDashboard } from './reflection/GuidedReflectionDashboard';
import { PatternShiftDashboard } from './insights/PatternShiftDashboard';
import { SettingsView } from './SettingsView';
import { DemoAdminConsole } from './admin/DemoAdminConsole';

/**
 * AppShell - Editorial sidebar application shell
 * 
 * Replaces the previous tab-switcher with a v0-inspired sidebar navigation.
 * 
 * Features:
 * - Fixed sidebar navigation on desktop
 * - Responsive mobile topbar with drawer navigation
 * - View state management (no React Router)
 * - Security drawer preserved from original implementation
 * - Real authenticated user data from AuthContext
 * - Demo mode support (no backend calls, no auth verification)
 */
export const AppShell: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const isDemo = useIsDemoSession();
  const [activeView, setActiveView] = useState<AppView>('home');
  const [showSecurityDrawer, setShowSecurityDrawer] = useState(false);
  const [testResult, setTestResult] = useState<{
    loading: boolean;
    data: any | null;
    error: string | null;
  }>({
    loading: false,
    data: null,
    error: null,
  });

  const handleTestBackendAuth = async () => {
    setTestResult({ loading: true, data: null, error: null });
    try {
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Unable to acquire Firebase ID token from client session.');
      }

      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || json.error || `HTTP ${response.status}`);
      }

      setTestResult({ loading: false, data: json, error: null });
    } catch (err: any) {
      setTestResult({ loading: false, data: null, error: err.message || 'Verification request failed' });
    }
  };

  // Run backend verification on initial mount to keep security boundary active
  // Skip in demo mode (no backend, no Firebase tokens)
  useEffect(() => {
    if (isDemo) return;
    if (user) {
      handleTestBackendAuth();
    }
  }, [user, isDemo]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'home':
        return <HomeDashboard onNavigate={setActiveView} />;
      case 'journal':
        return <JournalDashboard />;
      case 'reflection':
        return <GuidedReflectionDashboard />;
      case 'patternshift':
        return <PatternShiftDashboard />;
      case 'admin':
        return <DemoAdminConsole onGoBack={() => setActiveView('home')} />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeDashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <div id="reflectra-shell" className="app-shell">
      {/* Desktop Sidebar */}
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />

      {/* Main Content Area */}
      <section className="content-area">
        {/* Mobile Topbar */}
        <AppTopbar activeView={activeView} onViewChange={setActiveView} />

        {/* Security Drawer Toggle (desktop only) */}
        <div className="security-drawer-toggle-desktop">
          <button
            type="button"
            id="btn-toggle-security"
            onClick={() => setShowSecurityDrawer(!showSecurityDrawer)}
            className="security-toggle-button"
            title="Inspect security boundary & auth verification"
          >
            <ShieldCheck className="security-icon" />
            <span>Auth Boundary</span>
            {showSecurityDrawer ? (
              <ChevronUp className="chevron-icon" />
            ) : (
              <ChevronDown className="chevron-icon" />
            )}
          </button>
        </div>

        {/* Collapsible Security & Auth Verification Drawer */}
        {showSecurityDrawer && (
          <div id="security-boundary-drawer" className="security-drawer">
            <div className="security-drawer-content">
              <div className="security-header">
                <div className="security-header-text">
                  <h4>
                    <ShieldCheck className="security-icon-inline" />
                    <span>Backend Authentication & Security Boundary Status</span>
                  </h4>
                  <p>
                    UID is derived exclusively from verified Firebase ID token. Client-supplied UIDs are rejected.
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-reverify-auth"
                  onClick={handleTestBackendAuth}
                  disabled={testResult.loading}
                  className="security-reverify-button"
                >
                  {testResult.loading ? (
                    <RefreshCw className="reverify-icon spinning" />
                  ) : (
                    <Server className="reverify-icon" />
                  )}
                  <span>{testResult.loading ? 'Verifying...' : 'Re-verify Token'}</span>
                </button>
              </div>

              {testResult.data && (
                <div className="security-success">
                  <CheckCircle className="success-icon" />
                  <span>Verified Token UID: {testResult.data.user?.uid}</span>
                  <span className="success-badge">HTTP 200 OK</span>
                </div>
              )}

              {testResult.error && (
                <div className="security-error">
                  <AlertCircle className="error-icon" />
                  <span>Backend Error: {testResult.error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Workspace */}
        <main className="workspace" role="main">
          {renderActiveView()}
        </main>
      </section>
    </div>
  );
};
