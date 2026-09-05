import React from 'react';
import { ArrowLeft, Edit3, Trash2, Calendar, FileText, Tag, RefreshCw } from 'lucide-react';
import type { JournalEntry } from '../../types/journal';
import { formatEntryDate, getMoodDescriptor } from '../../utils/journal';

interface EntryDetailProps {
  entry: JournalEntry;
  onBack: () => void;
  onEdit: (entry: JournalEntry) => void;
  onDeleteRequest: (entry: JournalEntry) => void;
}

const MOOD_DOT_HEX: Record<number, string> = {
  1: '#f43f5e',
  2: '#f59e0b',
  3: '#64748b',
  4: '#14b8a6',
  5: '#10b981',
};

export const EntryDetail: React.FC<EntryDetailProps> = ({
  entry,
  onBack,
  onEdit,
  onDeleteRequest,
}) => {
  const moodDesc = getMoodDescriptor(entry.moodRating);
  const formattedDate = formatEntryDate(entry.createdAt);
  const updatedDate = entry.updatedAt ? formatEntryDate(entry.updatedAt) : null;

  return (
    <div className="journal-page reading">
      <button
        type="button"
        id="btn-back-to-list"
        onClick={onBack}
        className="journal-back"
        aria-label="Back to journal"
      >
        <span className="journal-back-icon" aria-hidden="true">
          <ArrowLeft style={{ width: '1rem', height: '1rem' }} />
        </span>
        <span>Back to Journal</span>
      </button>

      <article className="journal-reading" role="article">
        <div className="journal-reading-date-anchor">
          <span className="journal-reading-date">{formattedDate}</span>
          {updatedDate && updatedDate !== formattedDate && (
            <span className="journal-reading-date" style={{ color: 'var(--color-subtle-foreground)', fontStyle: 'italic' }}>
              Edited {updatedDate}
            </span>
          )}
        </div>

        <h1 className="journal-reading-title">{entry.title || 'Untitled Reflection'}</h1>

        <div className="journal-reading-meta">
          <span className="journal-reading-mood">
            <span className="journal-reading-mood-dot"
              style={{ backgroundColor: MOOD_DOT_HEX[entry.moodRating] }}
              aria-hidden="true"
            />
            <span>Mood: <strong>{moodDesc.label}</strong></span>
            <span aria-hidden="true">—</span>
            <span>{moodDesc.description}</span>
          </span>

          <span className="journal-reading-meta-item" aria-label={`Word count: ${entry.wordCount}`}>
            <FileText style={{ width: '0.875rem', height: '0.875rem', verticalAlign: 'middle', marginRight: '0.25rem' }} aria-hidden="true" />
            <span>{entry.wordCount} {entry.wordCount === 1 ? 'word' : 'words'}</span>
          </span>

          {entry.tags && entry.tags.length > 0 && (
            <span className="journal-reading-tags">
              <Tag style={{ width: '0.875rem', height: '0.875rem', verticalAlign: 'middle', marginRight: '0.25rem', color: 'var(--color-subtle-foreground)' }} aria-hidden="true" />
              {entry.tags.map((tag) => (
                <span key={tag} className="journal-reading-tag">{tag}</span>
              ))}
            </span>
          )}
        </div>

        <div className="journal-reading-content">
          {entry.content}
        </div>

        <div className="journal-reading-actions">
          <button
            type="button"
            id="btn-edit-entry"
            onClick={() => onEdit(entry)}
            className="journal-reading-action"
            aria-label={`Edit: ${entry.title || 'Untitled'}`}
          >
            <Edit3 style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            id="btn-delete-entry-detail"
            onClick={() => onDeleteRequest(entry)}
            className="journal-reading-action destructive"
            aria-label={`Delete: ${entry.title || 'Untitled'}`}
          >
            <Trash2 style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </article>
    </div>
  );
};