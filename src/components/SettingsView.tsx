import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDemo, useIsDemoSession } from '../demo';
import { AccountCard } from './settings/AccountCard';
import { WorkspaceCard } from './settings/WorkspaceCard';
import { PrivacySection } from './settings/PrivacySection';
import { SecuritySection } from './settings/SecuritySection';
import { DemoWorkspaceCard } from './settings/DemoWorkspaceCard';

/**
 * SettingsView - Calm, editorial account & preferences area.
 *
 * Composition:
 *   1. Page header (eyebrow / display heading / supporting copy)
 *   2. Preview workspace notice (demo sessions only)
 *   3. Your Account        - identity from the active session
 *   4. Your Workspace      - informational summary of Reflectra features
 *   5. Privacy & Data      - honest, non-exaggerated privacy explanation
 *   6. Security            - plain-language architectural safeguards
 *   7. Appearance          - honest statement; no fake preference controls
 *   8. Data portability    - informational only, no dead export button
 *   9. Account Actions     - sign-out / leave-preview via existing auth flow
 *
 * The component owns no authentication, storage, or service logic. Sign-out
 * delegates to the existing session mechanisms:
 *   Production → signOutUser() from AuthContext
 *   Demo       → exitDemoSession() from DemoContext
 */
export const SettingsView: React.FC = () => {
  const { signOutUser } = useAuth();
  const { exitDemoSession, resetDemoWorkspace } = useDemo();
  const isDemo = useIsDemoSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isDemo) {
      // Demo sessions leave via the demo flow - never touches Firebase.
      exitDemoSession();
      return;
    }
    try {
      setIsSigningOut(true);
      await signOutUser();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="settings-view">
      <div className="page-wrap narrow settings-page">
        {/* Page header */}
        <header className="page-heading">
          <p className="eyebrow">Your space</p>
          <h1>
            Your <em>settings</em>
          </h1>
          <p>
            A few details about your account, your workspace, and how
            Reflectra works for you.
          </p>
        </header>

        {/* Preview workspace notice — demo sessions only */}
        {isDemo && <DemoWorkspaceCard onReset={resetDemoWorkspace} />}

        {/* Your Account */}
        <section className="settings-section" aria-labelledby="settings-account-heading">
          <h2 id="settings-account-heading" className="settings-section-heading">
            Your account
          </h2>
          <AccountCard />
        </section>

        {/* Your Workspace */}
        <section className="settings-section" aria-labelledby="settings-workspace-heading">
          <h2 id="settings-workspace-heading" className="settings-section-heading">
            Your workspace
          </h2>
          <WorkspaceCard />
        </section>

        {/* Privacy & Data */}
        <section className="settings-section" aria-labelledby="settings-privacy-heading">
          <h2 id="settings-privacy-heading" className="settings-section-heading">
            Privacy &amp; data
          </h2>
          <PrivacySection />
        </section>

        {/* Security */}
        <section className="settings-section" aria-labelledby="settings-security-heading">
          <h2 id="settings-security-heading" className="settings-section-heading">
            Security
          </h2>
          <SecuritySection />
        </section>

        {/* Appearance — honest statement, no fake preference controls */}
        <section className="settings-section" aria-labelledby="settings-appearance-heading">
          <h2 id="settings-appearance-heading" className="settings-section-heading">
            Appearance
          </h2>
          <div className="settings-card settings-appearance-card">
            <p className="settings-card-copy">
              Reflectra currently uses a warm, light workspace designed for
              long-form reflection.
            </p>
            <p className="settings-card-note">
              More appearance options may arrive thoughtfully — not
              automatically.
            </p>
          </div>
        </section>

        {/* Data portability — informational only, no dead export button */}
        <section className="settings-section" aria-labelledby="settings-portability-heading">
          <h2 id="settings-portability-heading" className="settings-section-heading">
            Data portability
          </h2>
          <div className="settings-card settings-portability-card">
            <p className="settings-card-copy">
              We're designing thoughtful ways to help you understand and
              manage your personal reflection data.
            </p>
          </div>
        </section>

        {/* Account Actions */}
        <section
          className="settings-section settings-section-actions"
          aria-labelledby="settings-actions-heading"
        >
          <h2 id="settings-actions-heading" className="settings-section-heading">
            Account actions
          </h2>
          <div className="settings-card settings-signout-card">
            <p className="settings-signout-copy">
              {isDemo
                ? 'Leave the preview and return to the introduction.'
                : 'End this session on this device. Your workspace stays exactly as you left it.'}
            </p>
            <button
              type="button"
              className="btn btn-primary settings-signout-button"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="settings-signout-icon" aria-hidden="true" />
              <span>{isDemo ? 'Leave preview' : 'Sign out of Reflectra'}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
