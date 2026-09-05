import React, { useState, useCallback } from 'react';

interface LandingNavProps {
  onBegin: () => void;
}

/**
 * Landing page navigation.
 * Brand wordmark, section anchor links, and primary auth CTA.
 * The "Begin reflecting" CTA invokes the parent's `onBegin` which
 * triggers the real signInWithGoogle flow via AuthContext.
 */
export const LandingNav: React.FC<LandingNavProps> = ({ onBegin }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const scrollToTop = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('landing-top');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    closeMenu();
  }, [closeMenu]);

  const scrollTo = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    closeMenu();
  }, [closeMenu]);

  const handleBegin = useCallback(() => {
    closeMenu();
    onBegin();
  }, [closeMenu, onBegin]);

  return (
    <nav className="landing-nav" aria-label="Main navigation">
      <a
        className="landing-logo"
        href="#landing-top"
        onClick={scrollToTop}
        aria-label="Reflectra home"
      >
        <span className="landing-logo-dot" aria-hidden="true" />
        reflectra
      </a>

      <ul className={`landing-links ${menuOpen ? 'is-open' : ''}`} role="list">
        <li>
          <a href="#how-it-works" onClick={scrollTo('how-it-works')}>
            How it works
          </a>
        </li>
        <li>
          <a href="#experiences" onClick={scrollTo('experiences')}>
            Your space
          </a>
        </li>
        <li>
          <a href="#privacy" onClick={scrollTo('privacy')}>
            Privacy
          </a>
        </li>
      </ul>

      <button
        type="button"
        className="landing-nav-cta"
        onClick={handleBegin}
        aria-label="Begin reflecting — sign in to Reflectra"
      >
        Begin reflecting <span aria-hidden="true">→</span>
      </button>

      <button
        type="button"
        className="landing-menu"
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? 'Close' : 'Menu'}
      </button>
    </nav>
  );
};
