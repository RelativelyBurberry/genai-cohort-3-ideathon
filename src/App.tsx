import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { DemoProvider, useDemo, useIsDemoSession, DEMO_USER } from './demo';
import { LandingPage } from './components/landing/LandingPage';
import { AppShell } from './components/AppShell';
import { SmartNudgeProvider } from './context/SmartNudgeProvider';

function AppContent() {
  const { user, loading } = useAuth();
  const { isDemoSession } = useDemo();

  if (loading) {
    return (
      <div id="loading-state" className="reflectra-boot-loader">
        <div className="boot-constellation" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <p className="boot-copy">Making space for your reflections…</p>
        <p className="boot-hint">Reflectra · private by design</p>
      </div>
    );
  }

  // Demo session takes precedence when active
  if (isDemoSession) {
    return (
      <SmartNudgeProvider uid={DEMO_USER.uid}>
        <AppShell />
      </SmartNudgeProvider>
    );
  }

  return user ? (
    <SmartNudgeProvider uid={user.uid}>
      <AppShell />
    </SmartNudgeProvider>
  ) : (
    <LandingPage />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DemoProvider>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </DemoProvider>
    </AuthProvider>
  );
}
