import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, CheckCircle, Server, RefreshCw, AlertCircle, ChevronDown, ChevronUp, BookOpen, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { JournalDashboard } from './journal/JournalDashboard';
import { GuidedReflectionDashboard } from './reflection/GuidedReflectionDashboard';
import { PatternShiftDashboard } from './insights/PatternShiftDashboard';

export const AppShell: React.FC = () => {
  const { user, signOutUser, getIdToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'journal' | 'reflection' | 'insights'>('journal');
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
  useEffect(() => {
    if (user) {
      handleTestBackendAuth();
    }
  }, [user]);

  const firstName = user?.displayName ? user.displayName.split(' ')[0] : 'Reflector';

  return (
    <div id="reflectra-shell" className="h-[100dvh] w-full bg-slate-50 text-slate-800 flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="w-full bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white font-semibold text-sm shadow-xs">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm tracking-tight">Reflectra</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  Vault Secured
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Security Drawer Toggle */}
            <button
              type="button"
              id="btn-toggle-security"
              onClick={() => setShowSecurityDrawer(!showSecurityDrawer)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-600 transition cursor-pointer"
              title="Inspect security boundary & auth verification"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Auth Boundary</span>
              {showSecurityDrawer ? (
                <ChevronUp className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              )}
            </button>

            {/* User Profile & Sign Out */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-semibold text-xs">
                  {firstName.charAt(0)}
                </div>
              )}
              <button
                id="btn-signout"
                onClick={signOutUser}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Security & Auth Verification Drawer */}
        {showSecurityDrawer && (
          <div
            id="security-boundary-drawer"
            className="border-t border-slate-200 bg-slate-100/80 px-4 sm:px-6 py-4 animate-fade-in"
          >
            <div className="max-w-5xl mx-auto space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Backend Authentication & Security Boundary Status</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    UID is derived exclusively from verified Firebase ID token. Client-supplied UIDs are rejected.
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-reverify-auth"
                  onClick={handleTestBackendAuth}
                  disabled={testResult.loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shrink-0"
                >
                  {testResult.loading ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                  ) : (
                    <Server className="w-3 h-3 text-slate-500" />
                  )}
                  <span>{testResult.loading ? 'Verifying...' : 'Re-verify Token'}</span>
                </button>
              </div>

              {testResult.data && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between font-mono">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Verified Token UID: {testResult.data.user?.uid}</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-sans font-medium">HTTP 200 OK</span>
                </div>
              )}

              {testResult.error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Backend Error: {testResult.error}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Journaling Workspace */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Calm Welcome Header & Workspace Switcher */}
        <div className="shrink-0 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Your private reflections are encrypted and isolated under your authenticated UID.
            </p>
          </div>

          {/* Calm Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl border border-slate-300/60 shrink-0">
            <button
              type="button"
              id="tab-journal"
              onClick={() => setActiveTab('journal')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'journal'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Personal Journal</span>
            </button>
            <button
              type="button"
              id="tab-reflection"
              onClick={() => setActiveTab('reflection')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'reflection'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Guided Reflection</span>
            </button>
            <button
              type="button"
              id="tab-insights"
              onClick={() => setActiveTab('insights')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'insights'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span>PatternShift</span>
            </button>
          </div>
        </div>

        {/* Milestone 2, 3 & 5 Workspaces */}
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
          {activeTab === 'journal' ? (
            <JournalDashboard />
          ) : activeTab === 'reflection' ? (
            <GuidedReflectionDashboard />
          ) : (
            <PatternShiftDashboard />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-3 px-6 shrink-0 z-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span>Reflectra · Production-Grade Privacy-First Reflection</span>
          <span className="font-mono text-[11px]">Firestore Path: /users/{user?.uid?.substring(0, 8)}.../entries</span>
        </div>
      </footer>
    </div>
  );
};
