import React from 'react';

interface Experience {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  visual: 'journal' | 'conversation' | 'patterns';
  note: string;
}

const experiences: Experience[] = [
  {
    number: '01',
    eyebrow: 'PERSONAL JOURNAL',
    title: 'Write without an audience.',
    description:
      'A quiet space to capture thoughts, moments, and feelings exactly as they are.',
    visual: 'journal',
    note: 'Your words. Your space.',
  },
  {
    number: '02',
    eyebrow: 'GUIDED REFLECTION',
    title: 'Sometimes the right question changes everything.',
    description:
      'A calm, adaptive conversation designed to help you put words to what is present and sit with it a little longer.',
    visual: 'conversation',
    note: 'A thoughtful pause.',
  },
  {
    number: '03',
    eyebrow: 'PATTERNSHIFT',
    title: 'See the patterns between the pages.',
    description:
      'Notice recurring themes, rhythms, and changes in your personal reflections over time — gently, and without judgment.',
    visual: 'patterns',
    note: 'Notice with curiosity.',
  },
];

const ExperienceVisual: React.FC<{ visual: Experience['visual'] }> = ({ visual }) => {
  if (visual === 'journal') {
    return (
      <div className="journal-paper" aria-hidden="true">
        <p className="journal-paper-eyebrow">A QUIET MORNING</p>
        <strong className="journal-paper-title">A small noticing</strong>
        <p className="journal-paper-body">
          I noticed how much better the day felt when I did not rush the first ten minutes.
        </p>
        <i className="journal-paper-heart" aria-hidden="true">♡</i>
      </div>
    );
  }
  if (visual === 'conversation') {
    return (
      <div className="conversation-card" aria-hidden="true">
        <p className="conversation-card-eyebrow">GUIDED REFLECTION</p>
        <p className="conversation-card-question">
          What are you
          <br />
          <em>making room for?</em>
        </p>
        <span className="conversation-card-cta">
          Take your time <b className="conversation-card-cta-arrow">→</b>
        </span>
      </div>
    );
  }
  return (
    <div className="pattern-visual" aria-hidden="true">
      <div className="pattern-lines">
        <i className="pattern-line" />
        <i className="pattern-line" />
        <i className="pattern-line" />
        <i className="pattern-line" />
        <i className="pattern-line" />
      </div>
      <div className="pattern-labels">
        <span>clarity</span>
        <span>distance</span>
        <span>returning</span>
      </div>
    </div>
  );
};

export const LandingExperiences: React.FC = () => {
  return (
    <section className="experience-section" id="experiences" aria-labelledby="experiences-heading">
      <div className="section-intro">
        <p className="landing-eyebrow">A space that grows with you</p>
        <h2 id="experiences-heading">
          Three ways to
          <br />
          <em>look inward.</em>
        </h2>
      </div>

      {experiences.map((exp) => (
        <article key={exp.number} className={`experience-row ${exp.visual}`}>
          <div className="experience-copy">
            <p className="landing-eyebrow">
              {exp.number} — {exp.eyebrow}
            </p>
            <h3>{exp.title}</h3>
            <p className="experience-copy-description">{exp.description}</p>
            <span className="experience-note">{exp.note}</span>
          </div>
          <div className="experience-visual">
            <ExperienceVisual visual={exp.visual} />
          </div>
        </article>
      ))}
    </section>
  );
};
