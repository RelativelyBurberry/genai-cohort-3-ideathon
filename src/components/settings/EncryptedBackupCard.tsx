import React, { useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { EncryptedExportModal } from './EncryptedExportModal';

/**
 * EncryptedBackupCard — Phase 19 Zero-Knowledge Encrypted Export trigger.
 *
 * Lives under Settings → Privacy & Data. Fires the EncryptedExportModal
 * when the user taps "Create encrypted export".
 *
 * No crypto logic lives here — all encryption is deferred to the
 * encryptedExportService via the EncryptedExportModal.
 */
export const EncryptedBackupCard: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="settings-card encrypted-backup-card">
        <div className="encrypted-backup-icon-wrap" aria-hidden="true">
          <Lock className="encrypted-backup-icon" />
        </div>
        <div className="encrypted-backup-content">
          <p className="settings-section-kicker">DATA &amp; PRIVACY</p>
          <h3 className="settings-card-title">Encrypted backup</h3>
          <p className="encrypted-backup-copy">
            Create a password-protected encrypted backup of your Reflectra
            data. Encryption happens entirely on this device.
          </p>

          <button
            type="button"
            id="btn-open-encrypted-export"
            className="btn btn-primary encrypted-backup-button"
            onClick={() => setIsOpen(true)}
          >
            <Download className="encrypted-backup-button-icon" aria-hidden="true" />
            <span>Create encrypted export</span>
          </button>

          <p className="encrypted-backup-note">
            Zero-knowledge: Reflectra never sees your passphrase or your
            decrypted backup.
          </p>
        </div>
      </div>

      <EncryptedExportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
