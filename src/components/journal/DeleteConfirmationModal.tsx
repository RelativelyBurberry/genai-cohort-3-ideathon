import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open (and trap escape to close)
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      id="modal-delete-confirm-overlay"
      className="journal-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
    >
      <div
        id="modal-delete-confirm-content"
        className="journal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-body"
      >
        <div className="journal-modal-header">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <span className="journal-modal-icon" aria-hidden="true">
              <AlertTriangle />
            </span>
            <div>
              <h3 id="delete-dialog-title" className="journal-modal-title">
                Delete reflection
              </h3>
              <p className="journal-modal-subtitle">This action is permanent.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="journal-modal-close"
            aria-label="Close dialog"
          >
            <X style={{ width: '1.125rem', height: '1.125rem' }} />
          </button>
        </div>

        <p id="delete-dialog-body" className="journal-modal-body">
          Are you sure you want to delete{' '}
          <strong>{title ? `"${title}"` : 'this reflection'}</strong>?
          It will be permanently removed from your journal.
        </p>

        <div className="journal-modal-actions">
          <button
            type="button"
            id="btn-cancel-delete"
            disabled={isDeleting}
            onClick={onCancel}
            className="journal-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-confirm-delete"
            ref={confirmRef}
            disabled={isDeleting}
            onClick={onConfirm}
            className="journal-modal-confirm"
          >
            {isDeleting ? (
              <>
                <span className="journal-modal-spinner" aria-hidden="true" />
                <span>Deleting…</span>
              </>
            ) : (
              <span>Confirm delete</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};