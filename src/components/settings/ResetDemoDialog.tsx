import React, { useEffect, useRef } from 'react';

interface ResetDemoDialogProps {
  isOpen: boolean;
  isResetting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ResetDemoDialog - Lightweight confirmation for resetting the demo workspace.
 *
 * Accessibility:
 * - role="dialog" with aria-modal and accessible title/description
 * - Escape closes (unless a reset is already in flight)
 * - Focus moves to the destructive button on open, restores on close
 * - Overlay click cancels
 */
export const ResetDemoDialog: React.FC<ResetDemoDialogProps> = ({
  isOpen,
  isResetting,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResetting) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, isResetting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="journal-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isResetting) onCancel();
      }}
    >
      <div
        className="journal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-demo-dialog-title"
        aria-describedby="reset-demo-dialog-body"
      >
        <div className="journal-modal-header">
          <div className="settings-reset-dialog-heading">
            <span className="settings-reset-dialog-icon" aria-hidden="true">
              ◉
            </span>
            <h3 id="reset-demo-dialog-title" className="journal-modal-title">
              Reset preview workspace?
            </h3>
          </div>
        </div>

        <p id="reset-demo-dialog-body" className="journal-modal-body">
          This will restore the original demonstration data. Anything you have
          written in this preview will be discarded. Nothing outside this
          browser is affected.
        </p>

        <div className="journal-modal-actions">
          <button
            type="button"
            className="journal-modal-cancel"
            onClick={onCancel}
            disabled={isResetting}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="journal-modal-confirm"
            onClick={onConfirm}
            disabled={isResetting}
          >
            {isResetting ? 'Resetting…' : 'Reset workspace'}
          </button>
        </div>
      </div>
    </div>
  );
};
