import React, { useState } from 'react';
import { Plus, MessageSquare, CheckCircle2, Clock, Trash2, Sparkles, Loader2, ChevronLeft, X, Check } from 'lucide-react';
import type { Conversation } from '../../types/reflection';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onStartNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  loading?: boolean;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onStartNewConversation,
  onDeleteConversation,
  loading = false,
}) => {
  // confirmingDeleteId: when set, the conversation with this id shows an
  // inline in-app confirmation UI instead of the normal card content.
  // This replaces the native browser confirm dialog, which is suppressed
  // in the AI Studio iframe (no allow-modals).
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log(`[DIAG_DELETE_STAGE] stage: delete_button_clicked | conversationId: ${id}`);
    // Enter inline confirmation state — no browser-native dialog.
    setConfirmingDeleteId(id);
    setDeleteError(null);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log(`[DIAG_DELETE_STAGE] stage: delete_confirmation_accepted | conversationId: ${id}`);
    setConfirmingDeleteId(null);

    try {
      setDeleteError(null);
      setDeletingId(id);
      await onDeleteConversation(id);
    } catch (err: any) {
      console.error(`[DIAG_DELETE_STAGE] stage: delete_error_caught | conversationId: ${id} | error:`, err);
      setDeleteError(err?.message || 'Failed to delete reflection session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log(`[DIAG_DELETE_STAGE] stage: delete_confirmation_cancelled | conversationId: ${id}`);
    setConfirmingDeleteId(null);
  };

  const activeConversations = conversations.filter((c) => c.status === 'active');
  const completedConversations = conversations.filter((c) => c.status === 'completed');

  /**
   * Renders a single conversation card. When confirmingDeleteId matches,
   * an inline confirmation row replaces the delete button.
   */
  const renderConversationCard = (conv: Conversation) => {
    const isSelected = conv.id === activeConversationId;
    const isConfirming = confirmingDeleteId === conv.id;
    const isDeleting = deletingId === conv.id;

    return (
      <div
        key={conv.id}
        id={`conversation-item-${conv.id}`}
        onClick={() => !isConfirming && !isDeleting && onSelectConversation(conv.id)}
        className={`reflection-conversation-card ${isSelected ? 'active' : ''}`}
        aria-label={`Reflection: ${conv.title}`}
      >
        <div className="reflection-conversation-card-content">
          {isConfirming ? (
            <div className="reflection-conversation-confirm-row">
              <span className="reflection-conversation-confirm-text">Delete?</span>
              <button
                type="button"
                onClick={(e) => handleConfirmDelete(e, conv.id)}
                disabled={isDeleting}
                className="reflection-conversation-confirm-btn"
                aria-label={`Confirm delete reflection ${conv.title}`}
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleCancelDelete(e, conv.id)}
                disabled={isDeleting}
                className="reflection-conversation-cancel-btn"
                aria-label={`Cancel delete reflection ${conv.title}`}
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            <>
              <div className="reflection-conversation-card-header">
                <span className={`reflection-conversation-status-dot ${conv.status}`} />
                <h4 className="reflection-conversation-card-title">{conv.title}</h4>
              </div>
              {conv.status === 'completed' && conv.summary ? (
                <p className="reflection-conversation-card-summary">{conv.summary}</p>
              ) : (
                <p className="reflection-conversation-card-meta">
                  {conv.status === 'active' ? 'In progress · Tap to continue' : 'Completed session'}
                </p>
              )}
            </>
          )}
        </div>

        {!isConfirming && (
          <button
            type="button"
            onClick={(e) => handleDeleteClick(e, conv.id)}
            disabled={isDeleting}
            title="Delete reflection"
            aria-label={`Delete reflection ${conv.title}`}
            className="reflection-conversation-delete-btn"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div id="conversation-list-container" className="reflection-archive flex flex-col h-full overflow-hidden">
      {/* Header with New Reflection Button */}
      <div className="reflection-archive-header">
        <h2 className="reflection-archive-title">Your Reflections</h2>
        <button
          type="button"
          id="btn-new-reflection"
          onClick={onStartNewConversation}
          className="reflection-archive-new-btn"
        >
          <Plus className="w-4 h-4" />
          <span>Begin a New Reflection</span>
        </button>
      </div>

      {deleteError && (
        <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* List content */}
      <div className="reflection-archive-section">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2 px-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading reflection sessions...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">No reflection sessions yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Start a guided dialogue to explore your thoughts and gain clarity.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartNewConversation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Begin Reflection</span>
            </button>
          </div>
        ) : (
          <>
            {/* Active Sessions */}
            {activeConversations.length > 0 && (
              <div className="space-y-1">
                <div className="reflection-archive-section-title">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Active Sessions ({activeConversations.length})</span>
                </div>
                {activeConversations.map(renderConversationCard)}
              </div>
            )}

            {/* Completed Sessions */}
            {completedConversations.length > 0 && (
              <div className="space-y-1 pt-2">
                <div className="reflection-archive-section-title">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Completed & Summarized ({completedConversations.length})</span>
                </div>
                {completedConversations.map(renderConversationCard)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
