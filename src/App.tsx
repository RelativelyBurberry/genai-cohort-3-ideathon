import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { DemoProvider, useDemo, useIsDemoSession } from './demo';
import { LandingPage } from './components/landing/LandingPage';
import { AppShell } from './components/AppShell';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const { isDemoSession } = useDemo();

  if (loading) {
    return (
      <div id="loading-state" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-700 animate-spin mb-3" />
        <p className="text-xs font-mono text-slate-500">Initializing Reflectra security boundary...</p>
      </div>
    );
  }

  // Demo session takes precedence when active
  if (isDemoSession) {
    return <AppShell />;
  }

  return user ? <AppShell /> : <LandingPage />;
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
