import React, { useState } from 'react';
import { ResetDemoDialog } from './ResetDemoDialog';

interface DemoWorkspaceCardProps {
  onReset: () => void;
}

/**
 * DemoWorkspaceCard - Preview-mode notice with reset affordance.
 *
 * Only rendered during an active demo session. Communicates honestly that
 * the workspace is synthetic and stored locally in this browser.
 */
export const DemoWorkspaceCard: React.FC<DemoWorkspaceCardProps> = ({ onReset }) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <section className="demo-workspace-notice" aria-label="Preview workspace">
      <div className="demo-workspace-notice-title">
        <span className="demo-dot" aria-hidden="true">
          ◉
        </span>
        <span>Preview workspace</span>
      </div>
      <p className="demo-workspace-notice-text">
        You're exploring Reflectra with synthetic data stored locally in this
        browser. Nothing you do here reaches a real account.
      </p>
      <div className="demo-workspace-notice-actions">
        <button
          type="button"
          className="demo-reset-button"
          onClick={() => setIsConfirmOpen(true)}
        >
          Reset demo workspace
        </button>
      </div>

      <ResetDemoDialog
        isOpen={isConfirmOpen}
        isResetting={false}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          onReset();
        }}
      />
    </section>
  );
};
