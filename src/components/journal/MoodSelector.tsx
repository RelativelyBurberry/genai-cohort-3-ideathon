import React from 'react';
import { getMoodDescriptor, CANONICAL_MOOD_RATINGS } from '../../utils/journal';

interface MoodSelectorProps {
  value: number;
  onChange: (mood: number) => void;
  disabled?: boolean;
}

const MOOD_DOT_HEX: Record<number, string> = {
  1: '#f43f5e',
  2: '#f59e0b',
  3: '#64748b',
  4: '#14b8a6',
  5: '#10b981',
};

export const MoodSelector: React.FC<MoodSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const descriptor = value >= 1 && value <= 5 ? getMoodDescriptor(value) : null;

  return (
    <div className="journal-mood-section" role="radiogroup" aria-label="Mood rating">
      <div className="journal-mood-options">
        {CANONICAL_MOOD_RATINGS.map((m) => {
          const isSelected = value === m;
          const moodDesc = getMoodDescriptor(m);
          return (
            <button
              key={m}
              id={`mood-btn-${m}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(m)}
              className="journal-mood-option"
              title={moodDesc.description}
            >
              <span
                className="journal-mood-option-dot"
                style={{ backgroundColor: MOOD_DOT_HEX[m] }}
                aria-hidden="true"
              />
              <span className="journal-mood-option-label">{moodDesc.label}</span>
            </button>
          );
        })}
      </div>
      {descriptor && (
        <div className="journal-mood-description" aria-live="polite">
          {descriptor.description}
        </div>
      )}
    </div>
  );
};