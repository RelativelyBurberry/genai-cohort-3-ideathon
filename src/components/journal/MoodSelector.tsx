import React from 'react';
import { getMoodDescriptor, CANONICAL_MOOD_RATINGS } from '../../utils/journal';

interface MoodSelectorProps {
  value: number;
  onChange: (mood: number) => void;
  disabled?: boolean;
}

export const MoodSelector: React.FC<MoodSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 tracking-wide">
          HOW ARE YOU FEELING? (MOOD RATING)
        </label>
        {value >= 1 && value <= 5 && (
          <span className="text-xs font-medium text-slate-500">
            {getMoodDescriptor(value).label} — {getMoodDescriptor(value).description}
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {CANONICAL_MOOD_RATINGS.map((m) => {
          const isSelected = value === m;
          const descriptor = getMoodDescriptor(m);

          return (
            <button
              key={m}
              id={`mood-btn-${m}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m)}
              className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-xs scale-[1.02]'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSelected ? 'bg-white' : descriptor.dotColor
                  }`}
                />
                <span className="font-semibold text-sm">{m}</span>
              </div>
              <span
                className={`text-[11px] font-medium truncate max-w-full ${
                  isSelected ? 'text-slate-200' : 'text-slate-500'
                }`}
              >
                {descriptor.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
