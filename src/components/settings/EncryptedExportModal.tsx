import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';
import { createEncryptedExport, MIN_PASSPHRASE_LENGTH, validateExportPassphrase } from '../../services/encryptedExportService';
import { buildExportPayload, collectProductionExportData, collectDemoExportData } from '../../services/exportDataService';

/**
 * EncryptedExportModal — Phase 19 Zero-Knowledge Encrypted Export.
 *
 * Two-step flow:
 *   1. Passphrase entry + confirmation (with show/hide, mismatch and
 *      minimum-length validation, and a clear irreversible warning).
 *   2. Confirmation showing exactly what happens (local encryption,
 *      passphrase never leaves this device), then generation.
 *
 * Security:
 *   - Passphrase lives only in component state (strings) for as long as
 *     needed to derive the key + encrypt; cleared on success, close, or
 *     failure.
 *   - No passphrase/key/plaintext is ever logged or sent anywhere.
 *   - Duplicate clicks are prevented; modal cannot be dismissed mid-export.
 *   - In demo mode, only demo data is exported — never production records.
 */

// Export progress states — descriptive, not fake percentages.
type ExportStep = 'collecting' | 'archiving' | 'encrypting' | 'downloading';

interface EncryptedExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EncryptedExportModal: React.FC<EncryptedExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const isDemo = useIsDemoSession();
  const {
    demoJournalEntries,
    demoConversations,
    getDemoMessages,
    demoPatternInsight,
  } = useDemo();

  const [step, setStep] = useState<1 | 2>(1);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState<ExportStep>('collecting');
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Clear sensitive form state whenever the modal closes.
  const handleClose = () => {
    // Always clear sensitive state on close.
    setPassphrase('');
    setConfirmPassphrase('');
    setShowPassphrase(false);
    setValidationError(null);
    setStep(1);
    setExportDone(false);
    setExportError(null);
    setIsExporting(false);
    setExportStep('collecting');
    onClose();
  };

  // Focus the first passphrase field when the modal opens to step 1.
  useEffect(() => {
    if (isOpen && step === 1) {
      const timer = setTimeout(() => firstFieldRef.current?.focus(), 0);
      // Escape closes only when not exporting.
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isExporting) {
          e.preventDefault();
          handleClose();
        }
      };
      document.addEventListener('keydown', handleKey);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKey);
      };
    }
    // handleClose intentionally omitted: it is recreated every render but
    // captures only stable setters and the onClose prop, so the closure
    // remains correct; including it would re-focus the field constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, isExporting]);

  // Clear any prior error when the user types a new passphrase.
  useEffect(() => {
    if (validationError || exportError) {
      setValidationError(null);
      setExportError(null);
    }
  }, [passphrase, confirmPassphrase]);

  if (!isOpen) return null;

  const handleValidateAndContinue = () => {
    const result = validateExportPassphrase(passphrase, confirmPassphrase);
    if (!result.valid) {
      setValidationError(result.message || 'Invalid passphrase.');
      return;
    }
    setValidationError(null);
    setStep(2);
  };

  const handleCreateExport = async () => {
    if (isExporting) return; // Prevent duplicate clicks.

    // Re-validate defensively.
    const result = validateExportPassphrase(passphrase, confirmPassphrase);
    if (!result.valid) {
      setValidationError(result.message || 'Invalid passphrase.');
      setStep(1);
      return;
    }

    setIsExporting(true);
    setExportDone(false);
    setExportError(null);
    setExportStep('collecting');

    try {
      // 1. Collect authorized user data (production or demo).
      setExportStep('collecting');
      let scope;
      if (isDemo) {
        scope = await collectDemoExportData(
          demoJournalEntries,
          demoConversations,
          getDemoMessages,
          demoPatternInsight
        );
      } else {
        if (!user?.uid) {
          throw new Error('You must be signed in to create an encrypted backup.');
        }
        scope = await collectProductionExportData(user.uid);
      }

      // 2. Build the export payload locally.
      setExportStep('archiving');
      const payload = buildExportPayload(scope);

      // 3. Encrypt locally via Web Crypto API.
      setExportStep('encrypting');
      const encryptedFile = await createEncryptedExport(payload, passphrase);

      // 4. Prepare download.
      setExportStep('downloading');
      triggerExportDownload(encryptedFile);

      setExportDone(true);
      setIsExporting(false);
      // Clear sensitive passphrase state immediately after success.
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err: any) {
      setExportError(
        err?.message || 'Unable to create encrypted backup. Please try again.'
      );
      setExportDone(false);
      // Clear sensitive state on failure too.
      setPassphrase('');
      setConfirmPassphrase('');
      setIsExporting(false);
      setExportStep('collecting');
    }
  };

  const triggerExportDownload = (encryptedFile: unknown) => {
    const json = JSON.stringify(encryptedFile, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Generate filename: reflectra-backup-YYYY-MM-DD.reflectra
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const filename = `reflectra-backup-${y}-${m}-${d}.reflectra`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke the object URL after download to avoid memory leaks.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const goBack = () => {
    if (isExporting) return;
    setStep(1);
  };

  const progressLabel: Record<ExportStep, string> = {
    collecting: 'Collecting your data',
    archiving: 'Preparing encrypted archive',
    encrypting: 'Encrypting locally',
    downloading: 'Preparing download',
  };

  const progressOrder: ExportStep[] = ['collecting', 'archiving', 'encrypting', 'downloading'];
  const currentIndex = progressOrder.indexOf(exportStep);

  return (
    <div
      className="journal-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) handleClose();
      }}
    >
      <div
        className="journal-modal encrypted-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="encrypted-export-dialog-title"
        aria-describedby="encrypted-export-dialog-body"
      >
        {/* Header */}
        <div className="journal-modal-header">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <span className="journal-modal-icon" aria-hidden="true">
              <Lock />
            </span>
            <div>
              <h3 id="encrypted-export-dialog-title" className="journal-modal-title">
                {exportDone
                  ? 'Encrypted export ready'
                  : step === 1
                    ? 'Create encrypted backup'
                    : 'Ready to encrypt'}
              </h3>
              <p className="journal-modal-subtitle">
                {exportDone
                  ? 'Your encrypted backup has been downloaded.'
                  : 'Your data, under your control.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isExporting}
            className="journal-modal-close"
            aria-label="Close dialog"
          >
            <X style={{ width: '1.125rem', height: '1.125rem' }} />
          </button>
        </div>

        <div id="encrypted-export-dialog-body" className="journal-modal-body">
          {exportDone ? (
            <div className="encrypted-export-success">
              <div className="encrypted-export-success-icon" aria-hidden="true">
                <Check />
              </div>
              <p>
                Your backup has been encrypted locally and downloaded as a
                <strong> .reflectra</strong> file.
              </p>
              <p className="encrypted-export-warning">
                Reflectra cannot recover this backup without your passphrase.
                Keep your passphrase safe and private.
              </p>
              <div className="journal-modal-actions">
                <button
                  type="button"
                  className="journal-modal-confirm"
                  onClick={handleClose}
                >
                  Done
                </button>
              </div>
            </div>
          ) : isExporting ? (
            <div className="encrypted-export-progress">
              <div className="encrypted-export-progress-label">
                {progressLabel[exportStep]}
              </div>

              <div className="encrypted-export-progress-track" aria-hidden="true">
                {progressOrder.map((s, i) => (
                  <div
                    key={s}
                    className={`encrypted-export-progress-segment${
                      i <= currentIndex ? ' is-active' : ''
                    }`}
                  />
                ))}
              </div>

              <ul className="encrypted-export-progress-list">
                {progressOrder.map((s, i) => (
                  <li
                    key={s}
                    className={`encrypted-export-progress-item${
                      i <= currentIndex ? ' is-active' : ''
                    }`}
                  >
                    {i <= currentIndex ? (
                      <span className="encrypted-export-progress-check" aria-hidden="true">
                        {i < currentIndex ? <Check /> : <Loader2 className="encrypted-export-spinner" />}
                      </span>
                    ) : (
                      <span className="encrypted-export-progress-dot" aria-hidden="true" />
                    )}
                    {progressLabel[s]}
                  </li>
                ))}
              </ul>
            </div>
          ) : step === 1 ? (
            <>
              <p className="encrypted-export-copy">
                Your backup will be encrypted on this device before
                downloading. Reflectra never receives or stores your
                passphrase.
              </p>

              <div className="encrypted-export-field">
                <label htmlFor="export-passphrase" className="encrypted-export-label">
                  Passphrase
                </label>
                <div className="encrypted-export-input-wrap">
                  <input
                    id="export-passphrase"
                    ref={firstFieldRef}
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                    className={`input ${validationError ? 'input-error' : ''}`}
                    placeholder="A strong, memorable passphrase"
                    disabled={isExporting}
                  />
                  <button
                    type="button"
                    className="encrypted-export-visibility"
                    onClick={() => setShowPassphrase((s) => !s)}
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                    tabIndex={-1}
                  >
                    {showPassphrase ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <div className="encrypted-export-field">
                <label htmlFor="export-passphrase-confirm" className="encrypted-export-label">
                  Confirm passphrase
                </label>
                <div className="encrypted-export-input-wrap">
                  <input
                    id="export-passphrase-confirm"
                    type={showPassphrase ? 'text' : 'password'}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    autoComplete="new-password"
                    className={`input ${validationError ? 'input-error' : ''}`}
                    placeholder="Re-enter your passphrase"
                    disabled={isExporting}
                  />
                  <button
                    type="button"
                    className="encrypted-export-visibility"
                    onClick={() => setShowPassphrase((s) => !s)}
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                    tabIndex={-1}
                  >
                    {showPassphrase ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                <p className="encrypted-export-hint">
                  At least {MIN_PASSPHRASE_LENGTH} characters. Use a phrase you
                  can remember.
                </p>
              </div>

              {validationError && (
                <p className="encrypted-export-error" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  {validationError}
                </p>
              )}

              <div className="encrypted-export-warning-box">
                <p className="encrypted-export-warning-title">Important</p>
                <p className="encrypted-export-warning-text">
                  If you forget your passphrase, Reflectra cannot recover your
                  encrypted backup.
                </p>
              </div>

              <div className="journal-modal-actions">
                <button
                  type="button"
                  className="journal-modal-cancel"
                  onClick={handleClose}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-export-continue"
                  className="journal-modal-confirm"
                  onClick={handleValidateAndContinue}
                  disabled={isExporting}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            // Step 2 — confirmation
            <>
              <ul className="encrypted-export-confirm-list">
                <li className="encrypted-export-confirm-item">
                  <Check className="encrypted-export-confirm-icon" aria-hidden="true" />
                  Encryption happens locally on this device
                </li>
                <li className="encrypted-export-confirm-item">
                  <Check className="encrypted-export-confirm-icon" aria-hidden="true" />
                  Your passphrase never leaves this device
                </li>
                <li className="encrypted-export-confirm-item">
                  <Check className="encrypted-export-confirm-icon" aria-hidden="true" />
                  The downloaded file cannot be read without your passphrase
                </li>
              </ul>

              {!isDemo && (
                <p className="encrypted-export-detail">
                  This includes your journal entries, guided reflections,
                  message history, and PatternShift insights.
                </p>
              )}
              {isDemo && (
                <p className="encrypted-export-detail">
                  This includes the demo workspace data only — your preview
                  content, reflections, and insights.
                </p>
              )}

              {exportError && (
                <p className="encrypted-export-error" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  {exportError}
                </p>
              )}

              <div className="journal-modal-actions">
                <button
                  type="button"
                  className="journal-modal-cancel"
                  onClick={goBack}
                  disabled={isExporting}
                >
                  Back
                </button>
                <button
                  type="button"
                  id="btn-create-encrypted-export"
                  className="journal-modal-confirm"
                  onClick={handleCreateExport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <span className="journal-modal-spinner" aria-hidden="true" />
                      <span>Encrypting…</span>
                    </>
                  ) : (
                    <span>Create encrypted export</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
