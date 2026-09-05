import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, RefreshCw } from 'lucide-react';
import type { JournalEntry } from '../../types/journal';
import { CANONICAL_MOOD_RATINGS, getMoodDescriptor } from '../../utils/journal';

// JS-side map for inline color styles — the utility returns Tailwind classes.
const MOOD_DOT_HEX: Record<number, string> = {
  1: '#f43f5e', // rose-500
  2: '#f59e0b', // amber-500
  3: '#64748b', // slate-500
  4: '#14b8a6', // teal-500
  5: '#10b981', // emerald-500
};

interface EntryHistoryProps {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
  onDeleteRequest: (entry: JournalEntry) => void;
  onRetry: () => void;
}

function getEntryDate(timestamp: JournalEntry['createdAt']): Date | null {
  if (!timestamp) return null;
  if (typeof (timestamp as any).toDate === 'function') {
    return (timestamp as any).toDate();
  }
  if (timestamp instanceof Date) return timestamp;
  return null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export const EntryHistory: React.FC<EntryHistoryProps> = ({
  entries,
  loading,
  error,
  onSelectEntry,
  onNewEntry,
  onDeleteRequest,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [entries]);

  // Filter entries (preserves existing filter logic exactly)
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = entry.title?.toLowerCase().includes(q);
        const matchesContent = entry.content.toLowerCase().includes(q);
        const matchesTags = entry.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesContent && !matchesTags) return false;
      }

      if (selectedTag && (!entry.tags || !entry.tags.includes(selectedTag))) {
        return false;
      }

      if (selectedMood !== null && entry.moodRating !== selectedMood) {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedTag, selectedMood]);

  const hasActiveFilters =
    selectedTag !== null || selectedMood !== null || searchQuery.trim().length > 0;

  const clearAllFilters = () => {
    setSelectedTag(null);
    setSelectedMood(null);
    setSearchQuery('');
  };

  // Group filtered entries by month for archival feel (presentation only — no data change)
  const groupedEntries = useMemo(() => {
    const map = new Map<string, { label: string; items: JournalEntry[] }>();

    filteredEntries.forEach((entry) => {
      const d = getEntryDate(entry.createdAt) ?? new Date();
      const key = monthKey(d);
      if (!map.has(key)) {
        map.set(key, { label: monthLabel(d), items: [] });
      }
      map.get(key)!.items.push(entry);
    });

    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, value]) => ({ key, label: value.label, items: value.items }));
  }, [filteredEntries]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="journal-loading" aria-busy="true" aria-live="polite">
        <div className="journal-loading-header">
          <div className="journal-loading-skeleton" style={{ height: '0.875rem', width: '7rem' }} />
          <div className="journal-loading-skeleton" style={{ height: '3.5rem', width: '24rem', maxWidth: '100%' }} />
          <div className="journal-loading-skeleton" style={{ height: '1rem', width: '18rem', maxWidth: '100%' }} />
        </div>
        <div className="journal-loading-rows">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="journal-loading-row">
              <div className="journal-loading-skeleton" style={{ height: '2.5rem', width: '3rem' }} />
              <div className="journal-loading-row-body">
                <div className="journal-loading-skeleton" style={{ height: '1.25rem', width: '65%' }} />
                <div className="journal-loading-skeleton" style={{ height: '0.875rem', width: '95%' }} />
                <div className="journal-loading-skeleton" style={{ height: '0.875rem', width: '75%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="journal-error" role="alert" aria-live="assertive">
        <div className="journal-error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="journal-error-title">Your journal could not be loaded</h3>
        <p className="journal-error-copy">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="journal-error-retry"
        >
          <RefreshCw style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
          <span>Try again</span>
        </button>
      </div>
    );
  }

  // Empty state (zero total entries in collection)
  if (entries.length === 0) {
    return (
      <>
        <div className="journal-header">
          <div className="journal-header-text">
            <p className="journal-eyebrow">My Journal</p>
            <h1 className="journal-title">
              A place for your <em>thoughts.</em>
            </h1>
            <p className="journal-subtitle">Small moments, held in one place.</p>
          </div>
          <div className="journal-header-meta">
            <div className="journal-count" aria-label="Total reflections">
              Reflections
              <strong>0</strong>
            </div>
            <button
              type="button"
              id="btn-create-first-entry"
              onClick={onNewEntry}
              className="journal-cta"
            >
              <span>Write something</span>
              <span className="journal-cta-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <div id="journal-empty-state" className="journal-empty">
          <p className="journal-empty-eyebrow">My Journal</p>
          <h2 className="journal-empty-title">
            Nothing written <em>yet.</em>
          </h2>
          <p className="journal-empty-copy">
            Your thoughts don’t need to be profound to deserve a place.
          </p>
          <button
            type="button"
            onClick={onNewEntry}
            className="journal-empty-action"
          >
            <span>Write your first reflection</span>
            <span aria-hidden="true">→</span>
          </button>
          <div className="journal-empty-divider" aria-hidden="true" />
          <p className="journal-empty-quiet">Begin wherever you are.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="journal-header">
        <div className="journal-header-text">
          <p className="journal-eyebrow">My Journal</p>
          <h1 className="journal-title">
            A place for your <em>thoughts.</em>
          </h1>
          <p className="journal-subtitle">Small moments, held in one place.</p>
        </div>
        <div className="journal-header-meta">
          <div className="journal-count" aria-label="Total reflections">
            Reflections
            <strong>{entries.length}</strong>
          </div>
          <button
            type="button"
            id="btn-new-entry-header"
            onClick={onNewEntry}
            className="journal-cta"
          >
            <Plus style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
            <span>Write something</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="journal-toolbar" role="search">
        <div className="journal-search">
          <span className="journal-search-icon" aria-hidden="true">
            <Search style={{ width: '1rem', height: '1rem' }} />
          </span>
          <input
            id="input-search-entries"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your thoughts…"
            className="journal-search-input"
            aria-label="Search journal entries"
          />
        </div>

        {(allTags.length > 0 || hasActiveFilters) && (
          <div
            className="journal-filters"
            role="group"
            aria-label="Filter journal entries by mood or tag"
          >
            <span className="journal-filter-label">Filter by</span>

            {/* Mood filters using canonical Reflectra vocabulary */}
            {CANONICAL_MOOD_RATINGS.map((m) => {
              const descriptor = getMoodDescriptor(m);
              const isSelected = selectedMood === m;
              return (
                <button
                  key={m}
                  id={`filter-mood-${m}`}
                  type="button"
                  onClick={() => setSelectedMood(isSelected ? null : m)}
                  className="journal-filter-chip"
                  aria-pressed={isSelected}
                >
                  <span
                    className="journal-filter-chip-dot"
                    style={{ backgroundColor: MOOD_DOT_HEX[m] }}
                    aria-hidden="true"
                  />
                  <span>{descriptor.label}</span>
                </button>
              );
            })}

            {/* Tag filters */}
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className="journal-filter-chip"
                aria-pressed={selectedTag === tag}
              >
                <span>#{tag}</span>
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="journal-filter-clear"
                aria-label="Clear all filters"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="journal-counter" aria-live="polite">
        {hasActiveFilters ? (
          <>Showing <strong>{filteredEntries.length}</strong> of {entries.length} reflections</>
        ) : (
          <>{entries.length} {entries.length === 1 ? 'reflection' : 'reflections'} archived</>
        )}
      </div>

      {/* Entries Archive */}
      {filteredEntries.length === 0 ? (
        <div className="journal-no-results" role="status">
          <h3 className="journal-no-results-title">No moments found here.</h3>
          <p className="journal-no-results-copy">
            Try a softer search, or step back and read the room.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="journal-no-results-action"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="journal-archive" role="list">
          {groupedEntries.map((group) => (
            <section key={group.key} className="journal-month-group" aria-label={group.label}>
              <h2 className="journal-month-label">
                <strong>{group.label}</strong>
              </h2>
              <div className="journal-entries" role="list">
                {group.items.map((entry) => {
                  const descriptor = getMoodDescriptor(entry.moodRating);
                  const date = getEntryDate(entry.createdAt) ?? new Date();
                  const day = date.getDate();
                  const weekday = dayLabel(date);
                  const displayTitle =
                    entry.title ||
                    (entry.content.length > 60
                      ? entry.content.substring(0, 60).trim() + '…'
                      : entry.content);
                  return (
                    <div
                      key={entry.id}
                      id={`entry-card-${entry.id}`}
                      role="listitem"
                      className="journal-entry-row"
                      onClick={() => onSelectEntry(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectEntry(entry);
                        }
                      }}
                      tabIndex={0}
                    >
                      <div className="journal-entry-date" aria-hidden="true">
                        <span className="journal-entry-day">{day}</span>
                        <span className="journal-entry-weekday">{weekday}</span>
                      </div>
                      <div className="journal-entry-body">
                        <h3 className="journal-entry-title">{displayTitle}</h3>
                        <p className="journal-entry-excerpt">{entry.content}</p>
                        <div className="journal-entry-meta">
                          <span className="journal-entry-mood" title={descriptor.description}>
                            <span
                              className="journal-filter-chip-dot"
                              style={{ backgroundColor: MOOD_DOT_HEX[entry.moodRating] }}
                              aria-hidden="true"
                            />
                            <span>{descriptor.label}</span>
                          </span>
                          {entry.tags && entry.tags.length > 0 && (
                            <span className="journal-entry-tags">
                              {entry.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="journal-entry-tag">
                                  {tag}
                                </span>
                              ))}
                              {entry.tags.length > 3 && (
                                <span className="journal-entry-tag" aria-label={`and ${entry.tags.length - 3} more`}>
                                  +{entry.tags.length - 3}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="journal-entry-actions">
                        <button
                          type="button"
                          id={`btn-delete-${entry.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRequest(entry);
                          }}
                          className="journal-entry-delete"
                          aria-label={`Delete reflection: ${displayTitle}`}
                          title="Delete reflection"
                        >
                          <Trash2 style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
                        </button>
                        <span className="journal-entry-arrow" aria-hidden="true">→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
};
