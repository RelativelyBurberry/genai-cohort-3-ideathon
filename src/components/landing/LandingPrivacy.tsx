import React from 'react';

const privacyPoints = [
  'Your reflections stay inside your authenticated account.',
  'No public sharing, no social feed, no audience.',
  'Assistant messages are written by Reflectra, never by anyone else.',
  'Designed for reflection, not diagnosis or measurement.',
];

export const LandingPrivacy: React.FC = () => {
  return (
    <section
      className="privacy-section"
      id="privacy"
      aria-labelledby="privacy-heading"
    >
      <div>
        <p className="landing-eyebrow-light">Your inner world, kept yours</p>
        <h2 id="privacy-heading">
          Some things
          <br />
          <em>are meant to</em>
          <br />
          stay yours.
        </h2>
      </div>
      <div className="privacy-copy">
        <p className="privacy-copy-intro">
          Reflectra is designed around personal ownership. Your reflections
          belong to you and remain isolated within your authenticated
          account — visible to you, and only to you.
        </p>
        <ul role="list">
          {privacyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
