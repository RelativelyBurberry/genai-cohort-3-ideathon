import React from 'react';
import { ArrowLeft, Edit3, Trash2, Calendar, FileText, Tag, Sparkles } from 'lucide-react';
import type { JournalEntry } from '../../types/journal';
import { formatEntryDate, getMoodDescriptor } from '../../utils/journal';

interface EntryDetailProps {
  entry: JournalEntry;
  onBack: () => void;
  onEdit: (entry: JournalEntry) => void;
  onDeleteRequest: (entry: JournalEntry) => void;
}

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
    <div id="entry-detail-container" className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Action Bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <button
          type="button"
          id="btn-back-to-list"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reflections</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-edit-entry"
            onClick={() => onEdit(entry)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            id="btn-delete-entry-detail"
            onClick={() => onDeleteRequest(entry)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Main Reading View */}
      <div className="p-8 space-y-6 max-w-3xl mx-auto">
        {/* Metadata Header */}
        <div className="space-y-3 pb-6 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formattedDate}</span>
              {updatedDate && updatedDate !== formattedDate && (
                <span className="text-slate-400 italic">(edited {updatedDate})</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{entry.wordCount} words</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-snug">
            {entry.title || 'Untitled Reflection'}
          </h1>

          {/* Mood Pill */}
          <div className="pt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${moodDesc.badgeClass}`}
            >
              <span className={`w-2 h-2 rounded-full ${moodDesc.dotColor}`} />
              <span>Mood {entry.moodRating}/5: {moodDesc.label}</span>
              <span className="text-slate-400">•</span>
              <span className="opacity-80 font-normal">{moodDesc.description}</span>
            </span>
          </div>
        </div>

        {/* Full Reflection Content */}
        <div className="prose prose-slate max-w-none">
          <p className="text-base text-slate-800 leading-relaxed whitespace-pre-wrap font-normal">
            {entry.content}
          </p>
        </div>

        {/* Tags Footer */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="pt-6 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5" />
              <span>Themes & Tags</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
