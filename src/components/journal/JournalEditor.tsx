import React, { useState } from 'react';
import { Save, X, Plus, AlertCircle } from 'lucide-react';
import { MoodSelector } from './MoodSelector';
import { calculateWordCount, normalizeTags, validateJournalEntryInput } from '../../utils/journal';
import type { JournalEntry, CreateJournalEntryInput } from '../../types/journal';

interface JournalEditorProps {
  initialEntry?: JournalEntry | null;
  onSave: (data: CreateJournalEntryInput) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export const JournalEditor: React.FC<JournalEditorProps> = ({
  initialEntry,
  onSave,
  onCancel,
  isSaving,
}) => {
  const [title, setTitle] = useState(initialEntry?.title || '');
  const [content, setContent] = useState(initialEntry?.content || '');
  const [moodRating, setMoodRating] = useState<number>(initialEntry?.moodRating || 3);
  const [tags, setTags] = useState<string[]>(initialEntry?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const wordCount = calculateWordCount(content);
  const isEdit = Boolean(initialEntry?.id);

  const handleAddTag = () => {
    const raw = tagInput.trim();
    if (!raw) return;
    const cleanList = normalizeTags([...tags, raw]);
    setTags(cleanList);
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSaveError(null);

    // If user left pending text in tag input, absorb it
    let finalTags = tags;
    if (tagInput.trim()) {
      finalTags = normalizeTags([...tags, tagInput.trim()]);
      setTags(finalTags);
      setTagInput('');
    }

    const payload: CreateJournalEntryInput = {
      title: title.trim(),
      content,
      moodRating,
      tags: finalTags,
    };

    const check = validateJournalEntryInput(payload);
    if (!check.valid) {
      setValidationError(check.error || 'Please fill in all required fields.');
      return;
    }

    try {
      await onSave(payload);
    } catch (err: any) {
      // Preserve unsaved draft and present non-sensitive error
      setSaveError(
        err.message || 'Unable to save your reflection. Your draft has been preserved.'
      );
    }
  };

  return (
    <div className="journal-page editor">
      <form onSubmit={handleSubmit} className="journal-editor" noValidate>
        <p className="journal-editor-eyebrow">
          {isEdit ? 'Edit Reflection' : 'New Reflection'}
        </p>
        <h2 className="journal-editor-prompt">
          {isEdit ? <>Refine what you wrote.</> : <>What is on your <em>mind?</em></>}
        </h2>

        {/* Error Banners */}
        {validationError && (
          <div className="journal-editor-error" role="alert" aria-live="assertive">
            <AlertCircle className="journal-editor-error-icon" aria-hidden="true" />
            <div className="journal-editor-error-body">
              <strong>{validationError}</strong>
            </div>
          </div>
        )}

        {saveError && (
          <div className="journal-editor-error" role="alert" aria-live="assertive">
            <AlertCircle className="journal-editor-error-icon" aria-hidden="true" />
            <div className="journal-editor-error-body">
              <strong>{saveError}</strong>
              <small>Your input is preserved below. You can try saving again.</small>
            </div>
          </div>
        )}

        {/* Title */}
        <label htmlFor="entry-title" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
          Reflection title (optional)
        </label>
        <input
          id="entry-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isSaving}
          placeholder="A title, or leave it quietly untitled…"
          maxLength={140}
          className="journal-editor-title"
        />

        {/* Content */}
        <label htmlFor="entry-content" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
          Reflection content (required)
        </label>
        <textarea
          id="entry-content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (validationError) setValidationError(null);
          }}
          disabled={isSaving}
          rows={14}
          placeholder="Start wherever you are…"
          className="journal-editor-textarea"
          aria-required="true"
        />

        <div className="journal-editor-stats" aria-live="polite">
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
          <span>{content.length} characters</span>
        </div>

        <div className="journal-editor-divider" aria-hidden="true">
          <span>How are you feeling?</span>
        </div>

        {/* Mood Selector Component */}
        <MoodSelector value={moodRating} onChange={setMoodRating} disabled={isSaving} />

        <div className="journal-editor-divider" aria-hidden="true">
          <span>Add a thought or theme</span>
        </div>

        {/* Tags Section */}
        <div className="journal-tags-section">
          {tags.length > 0 && (
            <div className="journal-tags-list" aria-label="Selected tags">
              {tags.map((tag) => (
                <span key={tag} className="journal-tag-pill">
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isSaving}
                    className="journal-tag-remove"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X style={{ width: '0.75rem', height: '0.75rem' }} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="journal-tag-input-row">
            <label htmlFor="entry-tags-input" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
              Add a tag (optional)
            </label>
            <input
              id="entry-tags-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              disabled={isSaving}
              placeholder="press Enter or comma to add…"
              className="journal-tag-input"
            />
            <button
              type="button"
              id="btn-add-tag"
              onClick={handleAddTag}
              disabled={isSaving || !tagInput.trim()}
              className="journal-tag-add"
              aria-label="Add tag"
            >
              <Plus style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="journal-editor-actions">
          <button
            type="button"
            id="btn-cancel-editor"
            onClick={onCancel}
            disabled={isSaving}
            className="journal-editor-secondary"
          >
            Cancel
          </button>

          <button
            type="submit"
            id="btn-save-entry"
            disabled={isSaving || content.trim().length === 0}
            className="journal-editor-primary"
          >
            {isSaving ? (
              <>
                <span
                  className="journal-modal-spinner"
                  aria-hidden="true"
                  style={{ borderTopColor: 'var(--color-primary-foreground)' }}
                />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
                <span>{isEdit ? 'Update reflection' : 'Save reflection'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};