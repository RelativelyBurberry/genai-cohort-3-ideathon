'use client'

import { useState } from 'react'

const experiences = [
  { number: '01', eyebrow: 'PERSONAL JOURNAL', title: 'Write without an audience.', description: 'A quiet space to capture thoughts, moments, and feelings exactly as they are.', visual: 'journal' },
  { number: '02', eyebrow: 'GUIDED REFLECTION', title: 'Sometimes the right question changes everything.', description: 'Explore your thoughts through a calm, adaptive conversation designed to help you reflect more deeply.', visual: 'conversation' },
  { number: '03', eyebrow: 'PATTERNSHIFT', title: 'See the patterns between the pages.', description: 'Notice recurring themes, rhythms, and changes in your personal reflections over time.', visual: 'patterns' },
]

export function ReflectraLanding() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Main navigation">
        <a className="landing-logo" href="#top"><span />reflectra</a>
        <div className={`landing-links ${menuOpen ? 'is-open' : ''}`}>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#experiences" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
        </div>
        <a className="landing-nav-cta" href="#begin">Begin reflecting <b>→</b></a>
        <button className="landing-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
      </nav>

      <section className="landing-hero" id="top">
        <div className="hero-copy">
          <p className="landing-eyebrow">A private space for your inner world</p>
          <h1>Make space<br />for <em>what matters.</em></h1>
          <p className="hero-description">Reflectra helps you slow down, put thoughts into words, and notice the patterns quietly taking shape over time.</p>
          <div className="hero-actions"><a className="landing-button" href="#begin">Begin your reflection <span>→</span></a><a className="landing-text-link" href="#how-it-works">Explore how it works <span>↘</span></a></div>
        </div>
        <div className="hero-art" aria-label="Layered paper representing memories and reflection" role="img"><div className="paper paper-back" /><div className="paper paper-mid"><span>things I want<br />to remember</span><i>03</i></div><div className="paper paper-front"><small>REFLECTRA / NOTE 01</small><strong>There is more<br />to notice here.</strong><span>Write it down before it passes.</span></div><div className="hero-art-caption">a place to return to yourself <b>—</b></div></div>
      </section>

      <section className="quiet-statement" id="how-it-works"><p className="landing-eyebrow">The practice of noticing</p><h2>Your thoughts are more than<br /><em>moments in isolation.</em></h2><p>Over time, small reflections can reveal rhythms you might otherwise miss.</p></section>

      <section className="experience-section" id="experiences"><div className="section-intro"><p className="landing-eyebrow">A space that grows with you</p><h2>Three ways to<br /><em>look inward.</em></h2></div>{experiences.map((experience) => <Experience key={experience.number} {...experience} />)}</section>

      <section className="privacy-section" id="privacy"><div><p className="landing-eyebrow light">Your inner world, kept yours</p><h2>Some things<br /><em>are meant to<br />stay yours.</em></h2></div><div className="privacy-copy"><p>Reflectra is designed around personal ownership. Your reflections belong to you and remain isolated within your authenticated account.</p><ul><li>Private by design</li><li>Authenticated access</li><li>Personal data isolation</li><li>AI designed for reflection, not diagnosis</li></ul></div></section>

      <section className="philosophy-section"><p className="landing-eyebrow">A quieter kind of technology</p><blockquote>“Reflection isn&apos;t about finding<br /><em>the right answer.</em>”</blockquote><p className="philosophy-follow">It&apos;s about learning to ask yourself better questions.</p></section>

      <section className="final-cta" id="begin"><p className="landing-eyebrow light">Begin wherever you are</p><h2>Give your thoughts<br /><em>somewhere to go.</em></h2><p>A few quiet minutes today can become a clearer understanding of tomorrow.</p><a className="landing-button light-button" href="#top">Begin reflecting <span>→</span></a></section>

      <footer className="landing-footer"><a className="landing-logo" href="#top"><span />reflectra</a><div><a href="#privacy">Privacy</a><a href="#top">About</a><a href="#top">GitHub</a></div><small>Built for reflection, not diagnosis.</small></footer>
    </main>
  )
}

function Experience({ number, eyebrow, title, description, visual }: { number: string; eyebrow: string; title: string; description: string; visual: string }) {
  return <article className={`experience-row ${visual}`}><div className="experience-copy"><p className="landing-eyebrow">{number} — {eyebrow}</p><h3>{title}</h3><p>{description}</p><span className="experience-note">{visual === 'journal' ? 'Your words. Your space.' : visual === 'conversation' ? 'A thoughtful pause.' : 'Notice with curiosity.'}</span></div><div className="experience-visual" aria-hidden="true">{visual === 'journal' && <div className="journal-paper"><small>MONDAY, SEPTEMBER 24</small><strong>A quiet morning</strong><p>I noticed how much better the day felt when I did not rush the first ten minutes.</p><i>♡</i></div>}{visual === 'conversation' && <div className="conversation-card"><small>GUIDED REFLECTION</small><p className="question">What are you<br /><em>making room for?</em></p><span>Take your time <b>→</b></span></div>}{visual === 'patterns' && <div className="pattern-visual"><div className="pattern-lines"><i /><i /><i /><i /><i /></div><div className="pattern-labels"><span>clarity</span><span>distance</span><span>returning</span></div></div>}</div></article>
}
