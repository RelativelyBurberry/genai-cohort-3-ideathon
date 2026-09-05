import React from 'react';

export const LandingPhilosophy: React.FC = () => {
  return (
    <section className="philosophy-section" aria-labelledby="philosophy-heading">
      <p className="landing-eyebrow">A quieter kind of technology</p>
      <blockquote id="philosophy-heading">
        "Reflection isn&apos;t about finding
        <br />
        <em>the right answer.</em>"
      </blockquote>
      <p className="philosophy-follow">
        It&apos;s about learning to ask yourself better questions.
      </p>
    </section>
  );
};