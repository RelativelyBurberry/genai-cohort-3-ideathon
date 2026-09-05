import React, { useState } from 'react';
import { Save, X, Plus, AlertCircle, Sparkles, BookOpen } from 'lucide-react';
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
        err.message || 'Unable to save your reflection to Firestore. Your draft has been preserved.'
      );
    }
  };

  return (
    <div id="journal-editor-container" className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Editor Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">
              {initialEntry ? 'Edit Reflection' : 'New Personal Reflection'}
            </h2>
            <p className="text-xs text-slate-500">
              Private and isolated in your authenticated Firestore vault
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Error Banners */}
        {validationError && (
          <div className="flex items-center gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{validationError}</span>
          </div>
        )}

        {saveError && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold">{saveError}</p>
              <p className="text-rose-600 mt-0.5">Your input is preserved above. You can try saving again.</p>
            </div>
          </div>
        )}

        {/* Optional Title Input */}
        <div>
          <label htmlFor="entry-title" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1.5">
            TITLE (OPTIONAL)
          </label>
          <input
            id="entry-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSaving}
            placeholder="Give this reflection a title, or leave empty..."
            maxLength={140}
            className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
          />
        </div>

        {/* Mood Selector Component */}
        <MoodSelector value={moodRating} onChange={setMoodRating} disabled={isSaving} />

        {/* Content Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="entry-content" className="block text-xs font-semibold text-slate-700 tracking-wide">
              REFLECTION CONTENT <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
              <span>•</span>
              <span>{content.length} characters</span>
            </div>
          </div>

          <textarea
            id="entry-content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={isSaving}
            rows={10}
            placeholder="Write your thoughts freely. What was meaningful today? What challenges or insights did you experience?"
            className="w-full px-4 py-3.5 bg-slate-50/60 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition leading-relaxed resize-y font-normal"
          />
        </div>

        {/* Tags Section */}
        <div>
          <label htmlFor="entry-tags-input" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1.5">
            TAGS & THEMES (OPTIONAL)
          </label>

          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  disabled={isSaving}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="entry-tags-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              disabled={isSaving}
              placeholder="Add a tag (press Enter or comma)... e.g. mindfulness, work, gratitude"
              className="flex-1 px-4 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
            />
            <button
              type="button"
              id="btn-add-tag"
              onClick={handleAddTag}
              disabled={isSaving || !tagInput.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-40 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            id="btn-cancel-editor"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            id="btn-save-entry"
            disabled={isSaving || content.trim().length === 0}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            {isSaving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving Reflection...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Reflection</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
