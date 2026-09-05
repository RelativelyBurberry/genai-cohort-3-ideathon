import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Plus, Heart, Feather, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { JournalEntry, CreateJournalEntryInput } from '../../types/journal';
import {
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  subscribeToJournalEntries,
} from '../../services/journalService';
import { JournalEditor } from './JournalEditor';
import { EntryHistory } from './EntryHistory';
import { EntryDetail } from './EntryDetail';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

type ViewMode = 'list' | 'create' | 'detail' | 'edit';

export const JournalDashboard: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);

  const [statusNotification, setStatusNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Auto-dismiss notification after 4 seconds
  useEffect(() => {
    if (statusNotification) {
      const timer = setTimeout(() => {
        setStatusNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [statusNotification]);

  // Subscribe to authenticated user's entries in Firestore
  const setupSubscription = useCallback(() => {
    if (!user?.uid) return () => {};

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToJournalEntries(
      user.uid,
      (fetchedEntries) => {
        setEntries(fetchedEntries);
        setLoading(false);

        // Keep selectedEntry in sync if currently viewing/editing
        if (selectedEntry) {
          const updated = fetchedEntries.find((e) => e.id === selectedEntry.id);
          if (updated) {
            setSelectedEntry(updated);
          }
        }
      },
      (err) => {
        setLoading(false);
        setError(err.message || 'Failed to load entries from your personal vault.');
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    const unsub = setupSubscription();
    return () => unsub();
  }, [setupSubscription]);

  // Summary Metrics
  const stats = useMemo(() => {
    if (entries.length === 0) {
      return { totalEntries: 0, totalWords: 0, avgMood: 0 };
    }
    const totalWords = entries.reduce((acc, e) => acc + (e.wordCount || 0), 0);
    const avgMood = (
      entries.reduce((acc, e) => acc + (e.moodRating || 3), 0) / entries.length
    ).toFixed(1);

    return {
      totalEntries: entries.length,
      totalWords,
      avgMood,
    };
  }, [entries]);

  // Create or Update Handler
  const handleSaveEntry = async (payload: CreateJournalEntryInput) => {
    if (!user?.uid) {
      throw new Error('Authentication session expired. Please sign in again.');
    }

    setIsSaving(true);
    try {
      if (viewMode === 'edit' && selectedEntry) {
        if (!selectedEntry.createdAt) {
          throw new Error('Missing creation timestamp for entry update.');
        }
        await updateJournalEntry(user.uid, selectedEntry.id, payload, selectedEntry.createdAt);
        setStatusNotification({
          type: 'success',
          message: 'Your reflection was updated successfully.',
        });
        setViewMode('detail');
      } else {
        const newId = await createJournalEntry(user.uid, payload);
        setStatusNotification({
          type: 'success',
          message: 'Reflection saved to your private journal vault.',
        });
        setViewMode('list');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!user?.uid || !entryToDelete) return;

    setIsDeleting(true);
    try {
      await deleteJournalEntry(user.uid, entryToDelete.id);
      setStatusNotification({
        type: 'success',
        message: 'Reflection deleted.',
      });
      setEntryToDelete(null);
      if (selectedEntry?.id === entryToDelete.id) {
        setSelectedEntry(null);
        setViewMode('list');
      }
    } catch (err: any) {
      setStatusNotification({
        type: 'error',
        message: err.message || 'Failed to delete entry. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="journal-dashboard" className="flex-1 min-h-0 w-full overflow-y-auto space-y-6 pr-1">
      {/* Gentle Floating Notification */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 shadow-xs animate-fade-in ${
            statusNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Bar */}
      {entries.length > 0 && viewMode === 'list' && (
        <section
          id="journal-stats-banner"
          className="grid grid-cols-3 gap-3 sm:gap-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs"
        >
          <div className="flex flex-col items-start">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total Reflections
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              {stats.totalEntries}
            </span>
          </div>

          <div className="flex flex-col items-start border-l border-slate-100 pl-4 sm:pl-6">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Words Written
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              {stats.totalWords.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col items-start border-l border-slate-100 pl-4 sm:pl-6">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Avg. Mood Rating
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold text-slate-900">{stats.avgMood}</span>
              <span className="text-xs text-slate-400">/ 5</span>
            </div>
          </div>
        </section>
      )}

      {/* Main Mode View */}
      {viewMode === 'list' && (
        <EntryHistory
          entries={entries}
          loading={loading}
          error={error}
          onSelectEntry={(entry) => {
            setSelectedEntry(entry);
            setViewMode('detail');
          }}
          onNewEntry={() => {
            setSelectedEntry(null);
            setViewMode('create');
          }}
          onDeleteRequest={(entry) => setEntryToDelete(entry)}
          onRetry={setupSubscription}
        />
      )}

      {viewMode === 'create' && (
        <JournalEditor
          initialEntry={null}
          onSave={handleSaveEntry}
          onCancel={() => setViewMode('list')}
          isSaving={isSaving}
        />
      )}

      {viewMode === 'detail' && selectedEntry && (
        <EntryDetail
          entry={selectedEntry}
          onBack={() => setViewMode('list')}
          onEdit={(entry) => {
            setSelectedEntry(entry);
            setViewMode('edit');
          }}
          onDeleteRequest={(entry) => setEntryToDelete(entry)}
        />
      )}

      {viewMode === 'edit' && selectedEntry && (
        <JournalEditor
          initialEntry={selectedEntry}
          onSave={handleSaveEntry}
          onCancel={() => setViewMode('detail')}
          isSaving={isSaving}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(entryToDelete)}
        title={entryToDelete?.title || 'this reflection'}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setEntryToDelete(null)}
      />
    </div>
  );
};
