import React from 'react';
import { Calendar, Trash2, ChevronRight, FileText } from 'lucide-react';
import type { JournalEntry } from '../../types/journal';
import { formatEntryDate, getMoodDescriptor } from '../../utils/journal';

interface EntryCardProps {
  entry: JournalEntry;
  onSelect: (entry: JournalEntry) => void;
  onDeleteRequest: (entry: JournalEntry) => void;
}

export const EntryCard: React.FC<EntryCardProps> = ({
  entry,
  onSelect,
  onDeleteRequest,
}) => {
  const moodDesc = getMoodDescriptor(entry.moodRating);
  const formattedDate = formatEntryDate(entry.createdAt);

  const displayTitle = entry.title || (
    entry.content.length > 60
      ? entry.content.substring(0, 60).trim() + '...'
      : entry.content
  );

  return (
    <div
      id={`entry-card-${entry.id}`}
      className="group bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between gap-4 cursor-pointer"
      onClick={() => onSelect(entry)}
    >
      <div className="space-y-2.5">
        {/* Top Meta Header */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mood pill */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${moodDesc.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${moodDesc.dotColor}`} />
              <span>{moodDesc.label}</span>
            </span>

            {/* Delete button */}
            <button
              type="button"
              id={`btn-delete-${entry.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest(entry);
              }}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition opacity-60 group-hover:opacity-100 cursor-pointer"
              title="Delete reflection"
              aria-label="Delete reflection"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Title / Snippet */}
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-800 transition line-clamp-1">
          {displayTitle}
        </h3>

        {/* Excerpt */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
          {entry.content}
        </p>
      </div>

      {/* Footer Details */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-slate-400" />
            <span>{entry.wordCount} words</span>
          </span>

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              {entry.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] truncate max-w-[80px]"
                >
                  #{tag}
                </span>
              ))}
              {entry.tags.length > 3 && (
                <span className="text-[11px] text-slate-400">+{entry.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-900 text-xs font-medium transition">
          <span>Read</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};
