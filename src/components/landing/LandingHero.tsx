import React, { useCallback } from 'react';
import { GoogleIcon } from './GoogleIcon';
import { useDemo } from '../../demo';

interface LandingHeroProps {
  onBegin: () => void;
  isAuthenticating: boolean;
}

/**
 * Editorial hero section.
 * - Large serif headline with italic accent
 * - Restrained supporting copy
 * - Layered paper visual composition inspired by v0
 * - Primary CTA → real signInWithGoogle via parent
 * - Secondary CTA → smooth-scroll to "how it works"
 * - Demo CTA → only when VITE_DEMO_MODE=true (development only)
 */
export const LandingHero: React.FC<LandingHeroProps> = ({ onBegin, isAuthenticating }) => {
  const { isDemoMode, startDemoSession } = useDemo();
  
  const scrollToHow = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section className="landing-hero" id="landing-top" aria-labelledby="hero-headline">
      <div className="hero-copy">
        <p className="landing-eyebrow">A private space for self-reflection</p>
        <h1 id="hero-headline">
          Make space
          <br />
          for <em>what matters.</em>
        </h1>
        <p className="hero-description">
          Reflectra helps you slow down, put thoughts into words, and notice the
          patterns quietly taking shape over time.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="landing-button"
            onClick={onBegin}
            disabled={isAuthenticating}
            aria-label="Begin reflecting — continue with Google"
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            <span>{isAuthenticating ? 'Opening sign-in…' : 'Continue with Google'}</span>
            <span className="arrow" aria-hidden="true">→</span>
          </button>
          {isDemoMode && (
            <button
              type="button"
              className="landing-button landing-button-demo"
              onClick={startDemoSession}
              aria-label="Explore demo workspace without signing in"
            >
              <span>Explore Demo</span>
              <span className="arrow" aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            className="landing-text-link"
            onClick={scrollToHow}
          >
            Explore how it works <span aria-hidden="true">↘</span>
          </button>
        </div>
      </div>

      <div
        className="hero-art"
        role="img"
        aria-label="Layered paper composition representing memories and quiet reflection"
      >
        <div className="paper paper-back" aria-hidden="true" />
        <div className="paper paper-mid" aria-hidden="true">
          <span>
            things I want
            <br />
            to remember
          </span>
          <i className="paper-mid-attr">03</i>
        </div>
        <div className="paper paper-front" aria-hidden="true">
          <p className="paper-front-eyebrow">REFLECTRA / NOTE 01</p>
          <h2 className="paper-front-title">
            There is more
            <br />
            to notice here.
          </h2>
          <p className="paper-front-body">Write it down before it passes.</p>
        </div>
        <div className="hero-art-caption">a place to return to yourself</div>
      </div>
    </section>
  );
};
