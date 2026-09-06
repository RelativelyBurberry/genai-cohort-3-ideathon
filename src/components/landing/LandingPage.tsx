import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LandingNav } from './LandingNav';
import { LandingHero } from './LandingHero';
import { LandingExperiences } from './LandingExperiences';
import { LandingPrivacy } from './LandingPrivacy';
import { LandingPhilosophy } from './LandingPhilosophy';
import { LandingFinalCTA } from './LandingFinalCTA';
import { LandingFooter } from './LandingFooter';
import { Reveal } from '../ui/Reveal';

/**
 * Main landing page composition.
 * Uses existing AuthContext for authentication — no mock auth introduced.
 * All CTAs route through the real signInWithGoogle flow.
 */
export const LandingPage: React.FC = () => {
  const { signInWithGoogle, error, clearError } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Track authentication state to show loading feedback
  const handleBegin = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      await signInWithGoogle();
    } catch {
      // Errors are handled by AuthContext
    } finally {
      // The auth state change will trigger re-render
      // If auth failed, error will be set; if succeeded, app redirects
      setIsAuthenticating(false);
    }
  }, [signInWithGoogle]);

  // Dismiss auth error
  const dismissError = useCallback(() => {
    clearError();
  }, [clearError]);

  return (
    <main className="landing-shell" role="main">
      {/* Error banner — appears above hero if auth error occurs */}
      {error && (
        <div
          className="landing-auth-error"
          role="alert"
          aria-live="polite"
        >
          <span>{error}</span>
          <button
            type="button"
            className="landing-auth-error-dismiss"
            onClick={dismissError}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <LandingNav onBegin={handleBegin} />

      <LandingHero onBegin={handleBegin} isAuthenticating={isAuthenticating} />

      <Reveal as="section" className="quiet-statement" id="how-it-works" aria-labelledby="quiet-heading">
        <p className="landing-eyebrow">The practice of noticing</p>
        <h2 id="quiet-heading">
          Your thoughts are more than
          <br />
          <em>moments in isolation.</em>
        </h2>
        <p className="quiet-statement-follow">
          Over time, small reflections can reveal rhythms you might otherwise miss.
        </p>
      </Reveal>

      <Reveal delay={40}>
        <LandingExperiences />
      </Reveal>

      <Reveal delay={60}>
        <LandingPrivacy />
      </Reveal>

      <Reveal delay={40}>
        <LandingPhilosophy />
      </Reveal>

      <Reveal delay={40}>
        <LandingFinalCTA onBegin={handleBegin} isAuthenticating={isAuthenticating} />
      </Reveal>

      <LandingFooter />
    </main>
  );
};