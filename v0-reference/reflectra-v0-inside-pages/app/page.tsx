'use client'

import { useMemo, useState } from 'react'

type View = 'home' | 'journal' | 'reflect' | 'patterns' | 'settings'

const prompts = [
  'What felt lighter today?',
  'What are you carrying that is not yours?',
  'Where did you act from your values?',
]

const journalEntries = [
  { title: 'A quiet morning', date: 'Today, 8:42 AM', text: 'I noticed how much better the day felt when I did not rush the first ten minutes.' },
  { title: 'A small boundary', date: 'Yesterday, 6:18 PM', text: 'Saying no did not create the distance I feared. It gave me room to come back to myself.' },
]

export default function Page() {
  const [view, setView] = useState<View>('home')
  const [streak, setStreak] = useState(7)
  const [showPrompt, setShowPrompt] = useState(false)
  const [entry, setEntry] = useState('')
  const [saved, setSaved] = useState(false)
  const [activePrompt, setActivePrompt] = useState(0)

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  }, [])

  function saveEntry() {
    if (!entry.trim()) return
    setSaved(true)
    setStreak((current) => current + 1)
    setTimeout(() => setSaved(false), 2400)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-dot" />reflectra</div>
        <div className="profile-chip"><span className="avatar">A</span><span><strong>Alex Morgan</strong><small>Personal space</small></span><span className="chevron">⌄</span></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavButton active={view === 'home'} onClick={() => setView('home')} icon="⌂" label="Home" />
          <NavButton active={view === 'journal'} onClick={() => setView('journal')} icon="▤" label="My Journal" />
          <NavButton active={view === 'reflect'} onClick={() => setView('reflect')} icon="✦" label="Guided Reflection" />
          <NavButton active={view === 'patterns'} onClick={() => setView('patterns')} icon="◌" label="PatternShift" />
        </nav>
        <div className="sidebar-bottom">
          <NavButton active={view === 'settings'} onClick={() => setView('settings')} icon="⚙" label="Settings" />
          <div className="sidebar-note">A little more clarity,<br />one day at a time.</div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar"><div className="mobile-brand"><span className="brand-dot" />reflectra</div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications">♧</button><button className="avatar small-avatar">A</button></div></header>
        {view === 'home' && <HomeView greeting={greeting} streak={streak} onStart={() => setShowPrompt(true)} onJournal={() => setView('journal')} />}
        {view === 'journal' && <JournalView entry={entry} setEntry={setEntry} saved={saved} onSave={saveEntry} />}
        {view === 'reflect' && <ReflectView activePrompt={activePrompt} setActivePrompt={setActivePrompt} onStart={() => setShowPrompt(true)} />}
        {view === 'patterns' && <PatternsView />}
        {view === 'settings' && <SettingsView />}
      </section>

      {showPrompt && <PromptModal prompt={prompts[activePrompt]} entry={entry} setEntry={setEntry} onClose={() => setShowPrompt(false)} onSave={() => { saveEntry(); setShowPrompt(false) }} onNext={() => setActivePrompt((activePrompt + 1) % prompts.length)} />}
    </main>
  )
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}</button>
}

function HomeView({ greeting, streak, onStart, onJournal }: { greeting: string; streak: number; onStart: () => void; onJournal: () => void }) {
  return <div className="page-wrap">
    <div className="welcome-row"><div><p className="eyebrow">{greeting}, Alex</p><h1>Make space for<br /><em>what matters.</em></h1></div><div className="date-card"><span className="date-day">24</span><span>Tuesday<br /><small>September 2026</small></span></div></div>
    <div className="hero-grid">
      <section className="reflection-card"><div className="card-kicker"><span className="kicker-icon">✦</span> TODAY'S REFLECTION</div><h2>How are you, <em>really?</em></h2><p>A moment of honesty can change the shape of your whole day.</p><button className="primary-button" onClick={onStart}>Begin reflection <span>→</span></button><div className="card-decoration">◜</div></section>
      <section className="streak-card"><div className="card-kicker">YOUR RHYTHM</div><div className="streak-number">{streak}<span>days</span></div><p>You're showing up for yourself.<br /><strong>Keep going.</strong></p><div className="week-dots">{['M','T','W','T','F','S','S'].map((day, i) => <div key={`${day}-${i}`}><span className={i < 5 ? 'done' : i === 5 ? 'today' : ''}>{i < 5 ? '✓' : ''}</span><small>{day}</small></div>)}</div></section>
    </div>
    <div className="section-heading"><div><p className="eyebrow">Continue your practice</p><h2>Moments from your journal</h2></div><button className="text-button" onClick={onJournal}>View all <span>→</span></button></div>
    <div className="entries-grid">{journalEntries.map((item) => <article className="entry-card" key={item.title}><div className="entry-meta"><span>{item.date}</span><span className="entry-dot">·</span><span>Reflection</span></div><h3>{item.title}</h3><p>{item.text}</p><button className="read-button" onClick={onJournal}>Read entry <span>↗</span></button></article>)}<article className="quote-card"><span className="quote-mark">“</span><p>You don't have to have it all figured out to move forward.</p><small>— a gentle reminder</small></article></div>
  </div>
}

function JournalView({ entry, setEntry, saved, onSave }: { entry: string; setEntry: (v: string) => void; saved: boolean; onSave: () => void }) {
  return <div className="page-wrap narrow"><div className="page-heading"><p className="eyebrow">Your private space</p><h1>My <em>Journal</em></h1><p>Write without editing yourself. This space is yours.</p></div><div className="journal-compose"><div className="compose-top"><span>NEW ENTRY</span><span>Private by default</span></div><input aria-label="Entry title" placeholder="Give this moment a name" /><textarea aria-label="Journal entry" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="What is present for you right now?" /><div className="compose-actions"><span>{saved ? 'Saved to your journal.' : 'Take your time.'}</span><button className="primary-button" onClick={onSave}>Save entry <span>→</span></button></div></div><div className="section-heading compact"><div><p className="eyebrow">Recent entries</p><h2>Looking back</h2></div></div><div className="journal-list">{journalEntries.map((item) => <article className="journal-row" key={item.title}><span className="journal-date">{item.date}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><span>↗</span></article>)}</div></div>
}

function ReflectView({ activePrompt, setActivePrompt, onStart }: { activePrompt: number; setActivePrompt: (v: number) => void; onStart: () => void }) {
  return <div className="page-wrap narrow"><div className="page-heading"><p className="eyebrow">A guided pause</p><h1>Guided <em>Reflection</em></h1><p>Thoughtful questions for the parts of you that deserve attention.</p></div><div className="prompt-feature"><span className="kicker-icon">✦</span><p>Today's invitation</p><h2>{prompts[activePrompt]}</h2><button className="primary-button" onClick={onStart}>Sit with this <span>→</span></button><button className="shuffle-button" onClick={() => setActivePrompt((activePrompt + 1) % prompts.length)}>Try another prompt ↻</button></div><div className="prompt-list">{prompts.map((prompt, i) => <button key={prompt} className={i === activePrompt ? 'selected' : ''} onClick={() => setActivePrompt(i)}><span>0{i + 1}</span>{prompt}<b>→</b></button>)}</div></div>
}

function PatternsView() { return <div className="page-wrap narrow"><div className="page-heading"><p className="eyebrow">Notice, don't judge</p><h1>Your <em>Patterns</em></h1><p>Small observations become useful when you meet them with curiosity.</p></div><div className="pattern-card"><div className="pattern-header"><span className="kicker-icon">◌</span><span>OBSERVATION</span><span className="pattern-tag">Emerging</span></div><h2>You find clarity when you give yourself a little distance.</h2><p>Across 4 journal entries, you returned to the idea of stepping away before responding. That pause seems to help you choose rather than react.</p><div className="pattern-footer"><span>Based on your reflections</span><span>↗</span></div></div><div className="pattern-card secondary-pattern"><div className="pattern-header"><span className="kicker-icon">◌</span><span>STRENGTH</span></div><h2>You keep coming back.</h2><p>Seven days of showing up is not a small thing. Consistency is becoming part of your self-trust.</p></div></div> }

function SettingsView() { return <div className="page-wrap narrow"><div className="page-heading"><p className="eyebrow">Make it yours</p><h1>Your <em>Settings</em></h1><p>Shape the space around your practice.</p></div><div className="settings-list">{[['Profile','Alex Morgan','↗'],['Reminders','Daily at 8:00 AM','›'],['Appearance','Warm light','›'],['Privacy','Your journal is private','›']].map(([label, value, icon]) => <button key={label} className="setting-row"><span><strong>{label}</strong><small>{value}</small></span><b>{icon}</b></button>)}</div></div> }

function PromptModal({ prompt, entry, setEntry, onClose, onSave, onNext }: { prompt: string; entry: string; setEntry: (v: string) => void; onClose: () => void; onSave: () => void; onNext: () => void }) { return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onClick={(e) => e.stopPropagation()}><button className="close-button" aria-label="Close" onClick={onClose}>×</button><span className="kicker-icon">✦</span><p className="eyebrow">Take a quiet minute</p><h2 id="prompt-title">{prompt}</h2><textarea autoFocus value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Let the first honest thing come through..." /><div className="modal-actions"><button className="shuffle-button" onClick={onNext}>Another prompt ↻</button><button className="primary-button" onClick={onSave}>Save reflection <span>→</span></button></div></div></div> }
