import React, { useCallback } from 'react';

interface LandingFinalCTAProps {
  onBegin: () => void;
  isAuthenticating: boolean;
}

export const LandingFinalCTA: React.FC<LandingFinalCTAProps> = ({ onBegin, isAuthenticating }) => {
  return (
    <section className="final-cta" id="begin" aria-labelledby="final-cta-heading">
      <p className="landing-eyebrow-light">Begin wherever you are</p>
      <h2 id="final-cta-heading">
        Give your thoughts
        <br />
        <em>somewhere to go.</em>
      </h2>
      <p className="final-cta-description">
        A few quiet minutes today can become a clearer understanding of tomorrow.
      </p>
      <button
        type="button"
        className="landing-button landing-button-light"
        onClick={onBegin}
        disabled={isAuthenticating}
        aria-label="Begin reflecting — sign in to start your private space"
      >
        {isAuthenticating ? 'Opening sign-in…' : 'Begin reflecting'}
        <span className="arrow" aria-hidden="true">→</span>
      </button>
    </section>
  );
};
