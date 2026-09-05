import React, { useState } from 'react';
import { Plus, MessageSquare, CheckCircle2, Clock, Trash2, Sparkles, Loader2, ChevronLeft } from 'lucide-react';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log(`[DIAG_DELETE_STAGE] stage: delete_button_clicked | conversationId: ${id}`);
    if (!window.confirm('Delete this reflection conversation and its messages? This action cannot be undone.')) {
      console.log(`[DIAG_DELETE_STAGE] stage: delete_confirmation_cancelled | conversationId: ${id}`);
      return;
    }
    console.log(`[DIAG_DELETE_STAGE] stage: delete_confirmation_accepted | conversationId: ${id}`);

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

  const activeConversations = conversations.filter((c) => c.status === 'active');
  const completedConversations = conversations.filter((c) => c.status === 'completed');

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
                {activeConversations.map((conv) => {
                  const isSelected = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      id={`conversation-item-${conv.id}`}
                      onClick={() => onSelectConversation(conv.id)}
                      className={`reflection-conversation-card ${isSelected ? 'active' : ''}`}
                    >
                      <div className="reflection-conversation-card-content">
                        <div className="reflection-conversation-card-header">
                          <span className="reflection-conversation-status-dot active" />
                          <h4 className="reflection-conversation-card-title">{conv.title}</h4>
                        </div>
                        <p className="reflection-conversation-card-meta">In progress · Tap to continue</p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        disabled={deletingId === conv.id}
                        title="Delete reflection"
                        className="reflection-conversation-delete-btn"
                      >
                        {deletingId === conv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed Sessions */}
            {completedConversations.length > 0 && (
              <div className="space-y-1 pt-2">
                <div className="reflection-archive-section-title">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Completed & Summarized ({completedConversations.length})</span>
                </div>
                {completedConversations.map((conv) => {
                  const isSelected = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      id={`conversation-item-${conv.id}`}
                      onClick={() => onSelectConversation(conv.id)}
                      className={`reflection-conversation-card ${isSelected ? 'active' : ''}`}
                    >
                      <div className="reflection-conversation-card-content">
                        <div className="reflection-conversation-card-header">
                          <span className="reflection-conversation-status-dot completed" />
                          <h4 className="reflection-conversation-card-title">{conv.title}</h4>
                        </div>
                        {conv.summary ? (
                          <p className="reflection-conversation-card-summary">{conv.summary}</p>
                        ) : (
                          <p className="reflection-conversation-card-meta">Completed session</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        disabled={deletingId === conv.id}
                        title="Delete reflection"
                        className="reflection-conversation-delete-btn"
                      >
                        {deletingId === conv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};