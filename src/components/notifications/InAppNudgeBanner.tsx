import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { SmartNudge } from '../../types/notifications';

/**
 * In-App Smart Nudge Fallback — Phase 13.
 *
 * A small, dismissible banner/card shown when a Smart Nudge is evaluated
 * but the browser Notification API is unavailable or notifications are
 * not granted. It is:
 *   - non-intrusive (a card, never a modal)
 *   - dismissible (X button + auto-hide toggle)
 *   - honest (never pretends to be a system notification)
 *   - shown at most once per session (no repeated spam)
 *
 * The banner also surfaces a "Why am I seeing this?" explanation line
 * that maps the internal `reason` to plain-language copy.
 */

const WHY_TEXT: Record<SmartNudge['type'], string> = {
  unfinished_reflection:
    'You have an active reflection waiting to be continued.',
  preferred_time: 'This reminder is based on the time you selected.',
  inactivity:
    'This gentle reminder appears after some time without activity.',
};

interface InAppNudgeBannerProps {
  nudge: SmartNudge;
  onDismiss: () => void;
  sessionKey?: string;
}

export const InAppNudgeBanner: React.FC<InAppNudgeBannerProps> = ({
  nudge,
  onDismiss,
  sessionKey = 'reflectra-nudge-dismissed',
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  // Honor the "once per session" contract via sessionStorage so the
  // banner cannot be re-shown during the same browser session even if
  // the provider re-evaluates.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(sessionKey)) {
        setDismissed(true);
      }
    } catch {
      /* sessionStorage may be unavailable; just show once per mount */
    }
  }, [sessionKey]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(sessionKey, nudge.type);
    } catch {
      /* ignore */
    }
    setDismissed(true);
    onDismiss();
  };

  if (dismissed) return null;

  return (
    <div
      className="nudge-banner"
      role="status"
      aria-live="polite"
      aria-label={`Reminder: ${nudge.title}`}
    >
      <div className="nudge-banner-content">
        <p className="nudge-banner-title">{nudge.title}</p>
        <p className="nudge-banner-body">{nudge.body}</p>

        {showWhy ? (
          <p className="nudge-banner-why">{WHY_TEXT[nudge.type]}</p>
        ) : (
          <button
            type="button"
            className="nudge-banner-why-toggle"
            onClick={() => setShowWhy(true)}
          >
            Why am I seeing this?
          </button>
        )}
      </div>

      <button
        type="button"
        className="nudge-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss reminder"
      >
        <X className="nudge-banner-dismiss-icon" aria-hidden="true" />
      </button>
    </div>
  );
};
