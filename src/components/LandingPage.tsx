import React from 'react';
import { Shield, Sparkles, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { signInWithGoogle, error, clearError } = useAuth();

  return (
    <main id="reflectra-landing" className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reflectra</h1>
            <p className="text-xs text-slate-500 font-mono">Milestone 1 · Secure Foundation</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-xs">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Zero Client Secrets · Rule-Enforced Scoping</span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-xl mx-auto px-6 py-12 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium mb-6">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy-First Reflection Journal</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-4 leading-tight">
          Your personal reflections, strictly private and protected.
        </h2>

        <p className="text-base text-slate-600 mb-8 max-w-md leading-relaxed">
          Reflectra protects your journal with hardware-isolated database scoping, revocation-aware token verification, and server-side AI processing.
        </p>

        {error && (
          <div
            id="auth-error-banner"
            className="w-full mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between"
          >
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-rose-600 hover:text-rose-900 text-xs font-semibold ml-3"
            >
              Dismiss
            </button>
          </div>
        )}

        <button
          id="btn-google-signin"
          onClick={signInWithGoogle}
          className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </button>

        <p className="text-xs text-slate-400 mt-4">
          Google Sign-In with Firebase Authentication
        </p>
      </section>

      {/* Footer / Architecture Invariant Notes */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 border-t border-slate-200/80 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>Reflectra · Production & Security Constitution Compliant</span>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Auth: Firebase Identity</span>
          <span>•</span>
          <span>Storage: Isolated /users/{'{uid}'}</span>
        </div>
      </footer>
    </main>
  );
};
