import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDemoJournalData } from '../../demo/useDemoData';
import { subscribeToJournalEntries } from '../../services/journalService';
import type { JournalEntry } from '../../types/journal';
import { getMoodDescriptor } from '../../utils/journal';
import { MoodConstellationSvg, formatConstellationDate } from './MoodConstellationSvg';
import {
  buildConstellation,
  CONSTELLATION_MOOD_COLORS,
  CONSTELLATION_RANGE_OPTIONS,
  CONSTELLATION_VIEW_HEIGHT,
  CONSTELLATION_VIEW_WIDTH,
} from '../../intelligence/moodConstellation/constellationLayout';
import type {
  ConstellationEntry,
  ConstellationRange,
  MoodRating,
} from '../../intelligence/moodConstellation/constellationLayout';

/** Project only the five safe fields into the layout boundary. */
function toConstellationEntries(entries: JournalEntry[]): ConstellationEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    moodRating: entry.moodRating,
    tags: entry.tags,
    wordCount: entry.wordCount,
  }));
}

interface MoodConstellationDashboardProps {
  /** Open a journal entry by id (null → jump to the journal to write). */
  onOpenEntry: (entryId: string | null) => void;
}

const MOOD_BAND_LABELS = ['Radiant', 'Uplifted', 'Grounded', 'Low', 'Heavy'];

export const MoodConstellationDashboard: React.FC<MoodConstellationDashboardProps> = ({
  onOpenEntry,
}) => {
  const { user } = useAuth();
  const { isDemo, entries: demoEntries } = useDemoJournalData();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<ConstellationRange>('All time');
  const [showConnections, setShowConnections] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Demo mode: use synthetic fixtures from DemoContext (no Firebase/backend).
  useEffect(() => {
    if (isDemo) {
      setEntries(demoEntries ?? []);
      setLoading(false);
      setError(null);
    }
  }, [isDemo, demoEntries]);

  // Real mode: subscribe to the authenticated user's journal entries.
  const setupSubscription = useCallback(() => {
    if (isDemo) return () => {};
    if (!user?.uid) return () => {};

    setLoading(true);
    setError(null);
    return subscribeToJournalEntries(
      user.uid,
      (list) => {
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setError(err.message || 'Your reflections could not be loaded.');
      }
    );
  }, [user?.uid, isDemo]);

  useEffect(() => {
    const unsubscribe = setupSubscription();
    return () => unsubscribe();
  }, [setupSubscription]);

  const viewModel = useMemo(
    () => buildConstellation(toConstellationEntries(entries), range),
    [entries, range]
  );

  const active = viewModel.points.find((point) => point.entryId === activeId) ?? null;
  const totalEntries = entries.length;
  const visibleCount = viewModel.points.length;
  const averageMood = visibleCount
    ? Math.round(
        viewModel.points.reduce((sum, point) => sum + point.mood, 0) / visibleCount
      )
    : 3;

  if (!isDemo && !user) return null;

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
              onChange={(event) => setRange(event.target.value as ConstellationRange)}
            >
              {CONSTELLATION_RANGE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`connection-toggle ${showConnections ? 'is-on' : ''}`}
            onClick={() => setShowConnections((value) => !value)}
            aria-pressed={showConnections}
          >
            <span aria-hidden="true" />
            Show connections
          </button>
        </div>
      </header>

      {isDemo ? null : loading && totalEntries === 0 ? (
        <section className="constellation-panel" aria-busy="true" aria-live="polite">
          <div className="constellation-panel-top">
            <span>EMOTIONAL ATLAS</span>
            <span>Gathering reflections…</span>
          </div>
          <div className="constellation-stage constellation-stage-loading">
            <span className="constellation-loading">Gathering reflections…</span>
          </div>
        </section>
      ) : error ? (
        <section className="constellation-panel constellation-panel-message">
          <strong>Your reflections could not be loaded.</strong>
          <p>{error}</p>
          <button type="button" className="constellation-empty-btn" onClick={setupSubscription}>
            Try again
          </button>
        </section>
      ) : totalEntries === 0 ? (
        <section className="constellation-panel constellation-panel-message">
          <p className="constellation-eyebrow">EMOTIONAL ATLAS</p>
          <strong className="constellation-empty-title">Your constellation is waiting.</strong>
          <p className="constellation-empty-copy">
            Write your first reflection and a star will appear here.
          </p>
          <button
            type="button"
            className="constellation-empty-btn"
            onClick={() => onOpenEntry(null)}
          >
            Write a reflection <span>↗</span>
          </button>
        </section>
      ) : (
        <>
          <section className="constellation-panel" aria-label="Your emotional history constellation">
            <div className="constellation-panel-top">
              <span>EMOTIONAL ATLAS</span>
              <span>{visibleCount} reflections mapped</span>
            </div>
            <div className="constellation-stage">
              <div className="mood-labels" aria-hidden="true">
                {MOOD_BAND_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <MoodConstellationSvg
                viewModel={viewModel}
                showConnections={showConnections}
                activeId={activeId}
                onActivate={setActiveId}
                onOpenEntry={onOpenEntry}
              />
              {active && (
                <div
                  className="constellation-tooltip"
                  style={{
                    left: `${(active.x / CONSTELLATION_VIEW_WIDTH) * 100}%`,
                    top: `${(active.y / CONSTELLATION_VIEW_HEIGHT) * 100}%`,
                  }}
                >
                  <span>{formatConstellationDate(active.timestamp)}</span>
                  <strong>{getMoodDescriptor(active.mood).label}</strong>
                  <small>
                    {active.tagCount} themes <i /> Connected to{' '}
                    {viewModel.connectedCounts[active.entryId] ?? 0} reflections
                  </small>
                </div>
              )}
            </div>
            <div className="constellation-legend" aria-label="Mood legend">
              {[1, 2, 3, 4, 5].map((mood) => (
                <span key={mood}>
                  <i
                    style={{
                      background: CONSTELLATION_MOOD_COLORS[mood as MoodRating],
                    }}
                  />
                  {getMoodDescriptor(mood).label}
                </span>
              ))}
            </div>
          </section>

          {visibleCount > 0 && (
            <section className="constellation-insights" aria-label="Constellation insights">
              <div>
                <span>Your universe</span>
                <strong>{visibleCount} reflections mapped</strong>
              </div>
              <div>
                <span>Strongest constellation</span>
                <strong>
                  {visibleCount > 0 && viewModel.connections.length
                    ? 'Recurring themes'
                    : 'Still taking shape'}
                </strong>
              </div>
              <div>
                <span>Emotional center</span>
                <strong>{getMoodDescriptor(averageMood).label}</strong>
              </div>
            </section>
          )}

          {visibleCount < 3 && (
            <section className="constellation-empty">
              <strong>Your constellation is still forming.</strong>
              <p>Write a few more reflections and patterns will begin to emerge.</p>
              <button type="button" onClick={() => onOpenEntry(null)}>
                Write a reflection <span>↗</span>
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
};