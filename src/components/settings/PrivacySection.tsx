import React, { useId, useState } from 'react';
import { ShieldCheck, ChevronDown } from 'lucide-react';

/**
 * PrivacySection - Honest, non-exaggerated privacy explanation.
 *
 * Claims are scoped strictly to what the existing architecture provides:
 * - Firebase Authentication gates account access
 * - Firestore data is account-scoped (enforced by firestore.rules)
 * - AI features run only when explicitly invoked by the user
 * - Reflectra is not a medical or diagnostic service
 *
 * Deliberately absent: end-to-end encryption, anonymity, HIPAA,
 * "nobody can ever access your data" style absolutes.
 */
export const PrivacySection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();

  return (
    <div className="settings-card settings-privacy-card">
      <p className="settings-section-kicker">PRIVACY &amp; DATA</p>
      <h2 className="settings-card-title">Privacy, without the fine print.</h2>
      <p className="settings-card-copy">
        A short, accurate description of how your reflections are handled.
      </p>

      <ul className="settings-privacy-list">
        <li className="settings-privacy-item">
          Your Reflectra data is scoped to your authenticated account.
        </li>
        <li className="settings-privacy-item">
          Journal and reflection data remain associated with your workspace.
        </li>
        <li className="settings-privacy-item">
          AI features process information only when you explicitly use them.
        </li>
        <li className="settings-privacy-item">
          Reflectra is not a medical or diagnostic service.
        </li>
      </ul>

      <button
        type="button"
        className="settings-privacy-toggle"
        onClick={() => setIsExpanded((open) => !open)}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
      >
        <span>How your data is handled</span>
        <ChevronDown
          className={`settings-privacy-chevron${isExpanded ? ' is-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={detailsId}
        className={`settings-privacy-details${isExpanded ? ' is-open' : ''}`}
        hidden={!isExpanded}
      >
        <p className="settings-privacy-detail-item">
          <ShieldCheck className="settings-privacy-detail-icon" aria-hidden="true" />
          <span>
            Access requires signing in with your authenticated account. Your
            data is stored in a region-secured cloud database and is only
            returned to requests from your own account.
          </span>
        </p>
        <p className="settings-privacy-detail-item">
          <ShieldCheck className="settings-privacy-detail-icon" aria-hidden="true" />
          <span>
            Guided Reflection and PatternShift send the content you choose to
            share to a language-model service only when you use those features.
          </span>
        </p>
        <p className="settings-privacy-detail-item">
          <ShieldCheck className="settings-privacy-detail-icon" aria-hidden="true" />
          <span>
            If you sign out, your data remains associated with your account
            until you delete it. You can request deletion of any entry at any
            time from within the journal.
          </span>
        </p>
      </div>
    </div>
  );
};
