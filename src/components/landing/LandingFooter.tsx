import React, { useCallback } from 'react';

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const scrollToTop = (e: React.MouseEvent) => {
  e.preventDefault();
  const el = document.getElementById('landing-top');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

export const LandingFooter: React.FC = () => {
  return (
    <footer className="landing-footer" aria-label="Site footer">
      <a
        className="landing-logo"
        href="#landing-top"
        onClick={scrollToTop}
        aria-label="Reflectra — back to top"
      >
        <span className="landing-logo-dot" aria-hidden="true" />
        reflectra
      </a>
      <div className="landing-footer-links">
        <a href="#privacy" onClick={scrollTo('privacy')}>
          Privacy
        </a>
        <a href="#landing-top" onClick={scrollToTop}>
          About
        </a>
      </div>
      <p className="landing-footer-meta">
        Privacy-first reflection · © 2026 Reflectra · Built for reflection, not diagnosis.
      </p>
    </footer>
  );
};
