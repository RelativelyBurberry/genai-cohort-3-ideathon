import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';
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

interface JournalDashboardProps {
  /**
   * When set (Phase 21 Mood Constellation click-through), the matching
   * journal entry is auto-opened in detail mode once it arrives from the
   * data subscription. Cleared via onInitialEntryConsumed.
   */
  initialEntryId?: string | null;
  /** Called after the initial entry has been opened (one-time). */
  onInitialEntryConsumed?: () => void;
}

export const JournalDashboard: React.FC<JournalDashboardProps> = ({
  initialEntryId = null,
  onInitialEntryConsumed,
}) => {
  const { user } = useAuth();
  const {
    isDemoSession,
    demoJournalEntries,
    createDemoJournalEntry,
    updateDemoJournalEntry,
    deleteDemoJournalEntry,
  } = useDemo();
  const isDemo = useIsDemoSession();

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

  // Phase 21: once-only consumption of a Mood Constellation click-through.
  const consumedInitialRef = React.useRef(false);
  useEffect(() => {
    if (!initialEntryId || consumedInitialRef.current) return;
    const target = entries.find((entry) => entry.id === initialEntryId);
    if (!target) return;
    consumedInitialRef.current = true;
    setSelectedEntry(target);
    setViewMode('detail');
    onInitialEntryConsumed?.();
  }, [initialEntryId, entries, onInitialEntryConsumed]);

  // Auto-dismiss notification after 4 seconds
  useEffect(() => {
    if (statusNotification) {
      const timer = setTimeout(() => {
        setStatusNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [statusNotification]);

  // Demo mode: use synthetic data from DemoContext
  useEffect(() => {
    if (isDemo) {
      setEntries(demoJournalEntries);
      setLoading(false);
      return;
    }
  }, [isDemo, demoJournalEntries]);

  // Subscribe to authenticated user's entries in Firestore (real mode only)
  const setupSubscription = useCallback(() => {
    if (isDemo) return () => {};
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
        setError(err.message || 'Your journal could not be loaded.');
      }
    );

    return unsubscribe;
  }, [user?.uid, isDemo]);

  useEffect(() => {
    const unsub = setupSubscription();
    return () => unsub();
  }, [setupSubscription]);

  // Create or Update Handler
  const handleSaveEntry = async (payload: CreateJournalEntryInput) => {
    if (!isDemo && !user?.uid) {
      throw new Error('Authentication session expired. Please sign in again.');
    }

    setIsSaving(true);
    try {
      if (viewMode === 'edit' && selectedEntry) {
        if (isDemo) {
          await updateDemoJournalEntry(selectedEntry.id, payload);
        } else {
          if (!selectedEntry.createdAt) {
            throw new Error('Missing creation timestamp for entry update.');
          }
          await updateJournalEntry(user.uid, selectedEntry.id, payload, selectedEntry.createdAt);
        }
        setStatusNotification({
          type: 'success',
          message: isDemo
            ? 'Demo reflection updated (local only).'
            : 'Your reflection was updated.',
        });
        setViewMode('detail');
      } else {
        if (isDemo) {
          await createDemoJournalEntry(payload);
        } else {
          await createJournalEntry(user.uid, payload);
        }
        setStatusNotification({
          type: 'success',
          message: isDemo
            ? 'Demo reflection created (local only).'
            : 'Reflection saved to your private journal.',
        });
        setViewMode('list');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;
    if (!isDemo && !user?.uid) return;

    setIsDeleting(true);
    try {
      if (isDemo) {
        await deleteDemoJournalEntry(entryToDelete.id);
      } else {
        await deleteJournalEntry(user.uid, entryToDelete.id);
      }
      setStatusNotification({
        type: 'success',
        message: 'Reflection removed.',
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
    <div id="journal-dashboard" className="journal-shell w-full">
      <div className="journal-page">
        {/* Gentle Floating Notification */}
        {statusNotification && (
          <div
            className={`journal-toast ${statusNotification.type}`}
            role={statusNotification.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="journal-toast-content">
              {statusNotification.type === 'success' ? (
                <CheckCircle className="journal-toast-icon" aria-hidden="true" />
              ) : (
                <AlertCircle className="journal-toast-icon" aria-hidden="true" />
              )}
              <span>{statusNotification.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotification(null)}
              className="journal-toast-dismiss"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
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
      </div>

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
