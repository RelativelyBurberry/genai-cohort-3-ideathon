import React from 'react';
import { KeyRound, Fingerprint, Lock } from 'lucide-react';

/**
 * SecuritySection - Plain-language summary of real security architecture.
 *
 * Describes genuine architectural properties without exposing sensitive
 * implementation details (no project IDs, secret names, API keys, IAM
 * configuration, or infrastructure specifics).
 */
export const SecuritySection: React.FC = () => {
  return (
    <div className="settings-card settings-security-card">
      <p className="settings-section-kicker">SECURITY</p>
      <h2 className="settings-card-title">Quiet, structural safeguards.</h2>
      <p className="settings-card-copy">
        A few things working in the background of every Reflectra session.
      </p>

      <ul className="settings-security-list">
        <li className="settings-security-item">
          <Fingerprint className="settings-security-icon" aria-hidden="true" />
          <span className="settings-security-text">
            <strong>Authenticated account access.</strong> Reflectra only
            loads data for a signed-in, verified account.
          </span>
        </li>
        <li className="settings-security-item">
          <Lock className="settings-security-icon" aria-hidden="true" />
          <span className="settings-security-text">
            <strong>Account-scoped data boundaries.</strong> Journal entries,
            reflections, and patterns are stored against your account and are
            not shared across accounts.
          </span>
        </li>
        <li className="settings-security-item">
          <KeyRound className="settings-security-icon" aria-hidden="true" />
          <span className="settings-security-text">
            <strong>Server-side credential handling.</strong> Sensitive
            service credentials are handled server-side and are not exposed
            to the browser.
          </span>
        </li>
      </ul>
    </div>
  );
};
