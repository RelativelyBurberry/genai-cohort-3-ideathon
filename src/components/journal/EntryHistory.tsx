import React, { useState, useMemo } from 'react';
import { Search, Filter, Plus, BookOpen, Sparkles, Frown } from 'lucide-react';
import type { JournalEntry } from '../../types/journal';
import { EntryCard } from './EntryCard';
import { CANONICAL_MOOD_RATINGS, getMoodDescriptor } from '../../utils/journal';

interface EntryHistoryProps {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
  onDeleteRequest: (entry: JournalEntry) => void;
  onRetry: () => void;
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

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = entry.title?.toLowerCase().includes(q);
        const matchesContent = entry.content.toLowerCase().includes(q);
        const matchesTags = entry.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesContent && !matchesTags) return false;
      }

      // Tag filter
      if (selectedTag && (!entry.tags || !entry.tags.includes(selectedTag))) {
        return false;
      }

      // Mood filter
      if (selectedMood !== null && entry.moodRating !== selectedMood) {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedTag, selectedMood]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 bg-slate-200 rounded animate-pulse" />
          <div className="h-9 w-32 bg-slate-200 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-white border border-slate-200 rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="h-4 w-24 bg-slate-100 rounded" />
              <div className="h-5 w-3/4 bg-slate-200 rounded" />
              <div className="h-12 w-full bg-slate-100 rounded" />
              <div className="h-4 w-1/3 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Frown className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Unable to Load Reflections</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            An error occurred while connecting to your private Firestore vault: {error}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Empty state (zero total entries in collection)
  if (entries.length === 0) {
    return (
      <div id="journal-empty-state" className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto shadow-xs">
          <BookOpen className="w-7 h-7" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="font-semibold text-slate-900 text-lg">Your Journal is Empty</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Reflectra is your private space for mindful reflection. Record your thoughts, emotions, and experiences in your secure personal vault.
          </p>
        </div>
        <button
          type="button"
          id="btn-create-first-entry"
          onClick={onNewEntry}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Write Your First Reflection</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search & Filter Header Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="input-search-entries"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reflections by keywords, title, or tags..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
            />
          </div>

          {/* New Reflection Button */}
          <button
            type="button"
            id="btn-new-entry-header"
            onClick={onNewEntry}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Reflection</span>
          </button>
        </div>

        {/* Tag and Mood Filter Chips */}
        {(allTags.length > 0 || selectedMood !== null || selectedTag !== null) && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" />
              <span>Filters:</span>
            </span>

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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer inline-flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white' : descriptor.dotColor
                    }`}
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                #{tag}
              </button>
            ))}

            {(selectedTag !== null || selectedMood !== null || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(null);
                  setSelectedMood(null);
                  setSearchQuery('');
                }}
                className="text-slate-400 hover:text-slate-700 text-[11px] underline cursor-pointer ml-1"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Counter & Status */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
        <span>
          Showing {filteredEntries.length} of {entries.length}{' '}
          {entries.length === 1 ? 'reflection' : 'reflections'}
        </span>
      </div>

      {/* Entries List / Grid */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-700">No reflections matched your search</p>
          <p className="text-xs text-slate-400">Try adjusting your search terms or filter selections.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onSelect={onSelectEntry}
              onDeleteRequest={onDeleteRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
};
