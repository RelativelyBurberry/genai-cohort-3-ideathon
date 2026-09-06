import React, { useMemo, useState } from 'react';

/**
 * ReferenceMoodConstellation
 *
 * Faithful port of the v0 Mood Constellation reference
 * (v0-reference/reflectra-mood-constellation/components/mood-constellation.tsx).
 *
 * Preserved verbatim as far as possible:
 *  - Editorial layout, typography, parchment palette, axes, nodes, lines,
 *    glow effects, controls, spacing and composition.
 *  - Deterministic id-seeded jitter (no Math.random).
 *  - Built-in preview constellation used when no entries are supplied, so
 *    the showcase always renders rich data.
 *
 * Minimal refinements layered on top:
 *  1. Left emotional-axis labels are ordered to match the actual star
 *     positions (Radiant at the top), resolving the reference's
 *     label/position inconsistency. The bottom legend keeps the canonical
 *     Heavy → Radiant order.
 *  2. Connection lines animate on with stroke-draw and fade out on toggle
 *     (a brief leaving state) instead of vanishing instantly.
 *  3. Each star carries `--star-index` so the entrance choreography can be
 *     staggered chronologically via CSS.
 */
export type MoodRating = 1 | 2 | 3 | 4 | 5;

export interface ConstellationEntry {
  id: string;
  createdAt: number;
  moodRating?: MoodRating;
  tags?: string[];
  wordCount?: number;
}

interface MoodConstellationProps {
  entries: ConstellationEntry[];
  onOpenReflection?: (id: string) => void;
}

const moodNames: Record<MoodRating, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Grounded',
  4: 'Uplifted',
  5: 'Radiant',
};

const moodColors: Record<MoodRating, string> = {
  1: '#77718c',
  2: '#8ea8b5',
  3: '#8aa69b',
  4: '#c6a56e',
  5: '#d6a56d',
};

const previewEntries: ConstellationEntry[] = [
  { id: 'quiet-morning', createdAt: Date.UTC(2026, 0, 12), moodRating: 3, tags: ['rest', 'work'], wordCount: 420 },
  { id: 'new-rhythm', createdAt: Date.UTC(2026, 1, 3), moodRating: 4, tags: ['work', 'momentum'], wordCount: 680 },
  { id: 'long-week', createdAt: Date.UTC(2026, 1, 22), moodRating: 2, tags: ['work', 'sleep'], wordCount: 240 },
  { id: 'soft-reset', createdAt: Date.UTC(2026, 2, 8), moodRating: 3, tags: ['sleep', 'rest'], wordCount: 510 },
  { id: 'clear-air', createdAt: Date.UTC(2026, 2, 27), moodRating: 5, tags: ['momentum', 'joy'], wordCount: 820 },
  { id: 'small-boundary', createdAt: Date.UTC(2026, 3, 16), moodRating: 4, tags: ['rest', 'boundaries'], wordCount: 355 },
  { id: 'stillness', createdAt: Date.UTC(2026, 4, 4), moodRating: 3, tags: ['rest', 'joy'], wordCount: 290 },
  { id: 'turning-point', createdAt: Date.UTC(2026, 4, 28), moodRating: 5, tags: ['boundaries', 'momentum'], wordCount: 940 },
  { id: 'enough', createdAt: Date.UTC(2026, 5, 14), moodRating: 4, tags: ['joy', 'sleep'], wordCount: 470 },
  { id: 'open-window', createdAt: Date.UTC(2026, 6, 2), moodRating: 5, tags: ['joy', 'rest'], wordCount: 730 },
];

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(timestamp);
}

/** Duration of the connection fade-out in ms (kept in sync with CSS). */
const CONNECTION_LEAVE_MS = 260;

export function ReferenceMoodConstellation({ entries, onOpenReflection }: MoodConstellationProps) {
  const [range, setRange] = useState('All time');
  const [showConnections, setShowConnections] = useState(true);
  const [connectionsLeaving, setConnectionsLeaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const visibleEntries = useMemo(() => {
    const sorted = [...(entries.length ? entries : previewEntries)].sort((a, b) => a.createdAt - b.createdAt);
    if (range === 'All time') return sorted;
    const months = range === '6 months' ? 6 : 3;
    const latest = sorted.at(-1)?.createdAt ?? Date.now();
    return sorted.filter((entry) => entry.createdAt >= latest - months * 30 * 24 * 60 * 60 * 1000);
  }, [entries, range]);

  const plotted = useMemo(() => {
    const first = visibleEntries[0]?.createdAt ?? Date.now();
    const last = visibleEntries.at(-1)?.createdAt ?? first + 1;
    const span = Math.max(last - first, 1);
    return visibleEntries.map((entry, index) => {
      const mood = entry.moodRating ?? 3;
      const baseX = 92 + ((entry.createdAt - first) / span) * 1016;
      const offset = ((stableHash(entry.id) % 31) - 15) * 1.25;
      const y = 128 + (5 - mood) * 88 + offset;
      const radius = Math.min(12, Math.max(4.5, 4 + Math.log10((entry.wordCount ?? 120) + 1) * 2.2));
      return { entry, mood, x: baseX, y, radius, color: moodColors[mood], index };
    });
  }, [visibleEntries]);

  const connections = useMemo(() => plotted.flatMap((source, sourceIndex) => plotted.slice(sourceIndex + 1).flatMap((target) => {
    const shared = (source.entry.tags ?? []).filter((tag) => (target.entry.tags ?? []).includes(tag));
    return shared.length ? [{ source, target, weight: shared.length }] : [];
  })), [plotted]);

  const active = plotted.find((point) => point.entry.id === activeId);
  const labels = ['Heavy', 'Low', 'Grounded', 'Uplifted', 'Radiant'];
  // Left axis reads top → bottom, matching where stars actually sit
  // (Radiant at the top lane, Heavy at the bottom lane).
  const axisLabels = [...labels].reverse();

  const handleToggleConnections = () => {
    if (showConnections) {
      setConnectionsLeaving(true);
      window.setTimeout(() => {
        setShowConnections(false);
        setConnectionsLeaving(false);
      }, CONNECTION_LEAVE_MS);
    } else {
      setShowConnections(true);
    }
  };

  return (
    <main className="constellation-page">
      <header className="constellation-header">
        <div>
          <p className="constellation-eyebrow">Reflectra / Patterns</p>
          <h1>Mood Constellation</h1>
          <p>Every reflection leaves a point in your story.</p>
        </div>
        <div className="constellation-controls" aria-label="Constellation controls">
          <label>
            Time range
            <select
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              <option>All time</option>
              <option>6 months</option>
              <option>3 months</option>
            </select>
          </label>
          <button
            className={`connection-toggle ${showConnections ? 'is-on' : ''}`}
            onClick={handleToggleConnections}
            aria-pressed={showConnections}
          >
            <span aria-hidden="true" /> Show connections
          </button>
        </div>
      </header>

      <section className="constellation-panel" aria-label="Your emotional history constellation">
        <div className="constellation-panel-top"><span>EMOTIONAL ATLAS</span><span>{visibleEntries.length} reflections mapped</span></div>
        <div className="constellation-stage">
          <div className="mood-labels" aria-hidden="true">{axisLabels.map((label) => <span key={label}>{label}</span>)}</div>
          <svg viewBox="0 0 1200 650" role="img" aria-label="A constellation of reflections arranged chronologically by mood" onMouseLeave={() => setActiveId(null)}>
            <defs>
              <radialGradient id="constellationGlow"><stop stopColor="#f7e8d2" stopOpacity=".34" /><stop offset="1" stopColor="#f7e8d2" stopOpacity="0" /></radialGradient>
              <filter id="starGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <rect width="1200" height="650" fill="url(#constellationGlow)" />
            <text x="92" y="600" className="time-edge">EARLIER</text>
            <text x="1110" y="600" textAnchor="end" className="time-edge">RECENT</text>
            {(showConnections || connectionsLeaving) && connections.map(({ source, target, weight }) => (
              <line
                key={`${source.entry.id}-${target.entry.id}`}
                className={`constellation-line ${activeId && (activeId === source.entry.id || activeId === target.entry.id) ? 'is-active' : ''} ${connectionsLeaving ? 'is-leaving' : ''}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                strokeWidth={weight === 2 ? 1.4 : 1}
              />
            ))}
            {plotted.map(({ entry, mood, x, y, radius, color, index }) => (
              <g
                key={entry.id}
                className={`constellation-star ${activeId === entry.id ? 'is-active' : ''}`}
                tabIndex={0}
                role="button"
                style={{ '--star-index': index } as React.CSSProperties}
                aria-label={`Reflection from ${formatDate(entry.createdAt)}. Mood: ${moodNames[mood]}. Connected to ${(connections.filter((connection) => connection.source.entry.id === entry.id || connection.target.entry.id === entry.id)).length} reflections.`}
                onMouseEnter={() => setActiveId(entry.id)}
                onFocus={() => setActiveId(entry.id)}
                onBlur={() => setActiveId(null)}
                onClick={() => onOpenReflection?.(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenReflection?.(entry.id);
                  }
                }}
              >
                <circle cx={x} cy={y} r={radius * 3.2} fill={color} opacity=".09" />
                <circle cx={x} cy={y} r={radius} fill={color} filter="url(#starGlow)" />
                <circle cx={x - radius * 0.25} cy={y - radius * 0.25} r={Math.max(1.2, radius * 0.18)} fill="#fffaf4" opacity=".8" />
              </g>
            ))}
          </svg>
          {active && (
            <div
              className="constellation-tooltip"
              style={{ left: `${(active.x / 1200) * 100}%`, top: `${(active.y / 650) * 100}%` }}
            >
              <span>{formatDate(active.entry.createdAt)}</span>
              <strong>{moodNames[active.mood]}</strong>
              <small>{active.entry.tags?.length ?? 0} themes <i aria-hidden="true" /> Connected to {connections.filter((connection) => connection.source.entry.id === active.entry.id || connection.target.entry.id === active.entry.id).length} reflections</small>
            </div>
          )}
        </div>
        <div className="constellation-legend" aria-label="Mood legend">{labels.map((label, index) => <span key={label}><i style={{ background: moodColors[(index + 1) as MoodRating] }} />{label}</span>)}</div>
      </section>

      <section className="constellation-insights" aria-label="Constellation insights">
        <div><span>Your universe</span><strong>{visibleEntries.length} reflections mapped</strong></div>
        <div><span>Strongest constellation</span><strong>{connections.length ? 'Recurring themes' : 'Still taking shape'}</strong></div>
        <div><span>Emotional center</span><strong>{visibleEntries.length ? moodNames[Math.round(visibleEntries.reduce((sum, point) => sum + (point.moodRating ?? 3), 0) / visibleEntries.length) as MoodRating] : 'Grounded'}</strong></div>
      </section>

      {visibleEntries.length < 3 && (
        <section className="constellation-empty">
          <strong>Your constellation is still forming.</strong>
          <p>Write a few more reflections and patterns will begin to emerge.</p>
          <button onClick={() => onOpenReflection?.('new-reflection')}>Write a reflection <span>↗</span></button>
        </section>
      )}
    </main>
  );
}