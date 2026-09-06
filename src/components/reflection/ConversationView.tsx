import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  FileCheck2,
  User,
  ShieldAlert,
} from 'lucide-react';
import type { Conversation, ReflectionMessage } from '../../types/reflection';
import {
  subscribeToMessages,
  addUserMessage,
  requestAssistantReflection,
  requestSummarize,
} from '../../services/reflectionService';
import { CrisisSupportCard } from './CrisisSupportCard';
import { useDemo, useIsDemoSession } from '../../demo';

interface ConversationViewProps {
  conversation: Conversation;
  uid: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  onBack?: () => void;
  onConversationUpdated?: () => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversation,
  uid,
  getIdToken,
  onBack,
  onConversationUpdated,
}) => {
  const { isDemoSession, getDemoMessages, sendDemoMessage } = useDemo();
  const isDemo = useIsDemoSession();
  const [messages, setMessages] = useState<ReflectionMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(true);
  const [inputText, setInputText] = useState<string>('');
  const [inFlightReflection, setInFlightReflection] = useState<boolean>(false);
  const [inFlightSummarize, setInFlightSummarize] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summarizationError, setSummarizationError] = useState<string | null>(null);
  const [crisisTriggered, setCrisisTriggered] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Message loading: demo mode vs real mode
  useEffect(() => {
    if (isDemo) {
      const demoMsgs = getDemoMessages(conversation.id);
      setMessages(demoMsgs);
      setLoadingMessages(false);
      return;
    }
    
    setLoadingMessages(true);
    setErrorMessage(null);
    setSummarizationError(null);

    const unsubscribe = subscribeToMessages(
      uid,
      conversation.id,
      (msgs) => {
        setMessages(msgs);
        setLoadingMessages(false);
      },
      (err) => {
        setErrorMessage('Failed to load reflection messages from Firestore.');
        setLoadingMessages(false);
      }
    );

    return () => unsubscribe();
  }, [uid, conversation.id, isDemo]);

  // Keep demo messages in sync 
  useEffect(() => {
    if (isDemo) {
      const demoMsgs = getDemoMessages(conversation.id);
      setMessages(demoMsgs);
    }
  }, [isDemo, getDemoMessages, conversation.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, inFlightReflection]);

  const isCompleted = conversation.status === 'completed';
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const hasUnansweredUserTurn = !isCompleted && latestMessage?.role === 'user';
  const hasUserTurns = messages.some((m) => m.role === 'user');

  // Idempotent retry: triggers POST /api/reflect reusing the existing unanswered user turn in Firestore
  const handleRetryReflection = async () => {
    if (inFlightReflection || inFlightSummarize || isCompleted) {
      return;
    }

    // DEMO MODE: don't call real API
    if (isDemo) {
      setErrorMessage('Demo mode: AI reflection requires the backend. Responses shown are synthetic.');
      return;
    }

    setErrorMessage(null);
    setDiagnostics(null);
    setInFlightReflection(true);

    try {
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Authentication required: unable to acquire Firebase token.');
      }

      // Invokes ONLY POST /api/reflect - strictly DOES NOT call addUserMessage
      const response = await requestAssistantReflection(token, conversation.id, uid);

      if (response.crisisSupportRequired) {
        setCrisisTriggered(true);
      }
    } catch (err: any) {
      if (err?.statusCode === 429) {
        setErrorMessage(
          `Reflection rate limit reached. Please pause for ${
            err.retryAfterSeconds || 60
          } seconds before reflecting again.`
        );
      } else {
        setErrorMessage(
          err.message || 'An error occurred while generating your reflection. Your message was preserved.'
        );
      }
      setDiagnostics(err?.diagnostics || null);
    } finally {
      setInFlightReflection(false);
      if (onConversationUpdated) {
        onConversationUpdated();
      }
    }
  };

  // Send a user message and request Gemini reflection (or demo response)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inputText.trim();
    if (!trimmed || inFlightReflection || inFlightSummarize || isCompleted || hasUnansweredUserTurn) {
      return;
    }

    setErrorMessage(null);
    setDiagnostics(null);
    setInFlightReflection(true);

    const backupText = trimmed;
    setInputText('');

    // DEMO MODE: local-only message exchange, no API calls
    if (isDemo) {
      try {
        await sendDemoMessage(conversation.id, trimmed);
        // Re-fetch demo messages
        const updatedMsgs = getDemoMessages(conversation.id);
        setMessages(updatedMsgs);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to send demo message.');
        setInputText(backupText);
      } finally {
        setInFlightReflection(false);
      }
      return;
    }

    try {
      // 1. Client writes user message directly to Firestore
      // Strictly enforced by Firestore rules: role == 'user'
      await addUserMessage(uid, conversation.id, trimmed);

      // 2. Obtain verified Firebase ID token
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Authentication required: unable to acquire Firebase token.');
      }

      // 3. Request assistant reflection from backend
      // Backend validates token, runs crisis screener, rate limiter, invokes Gemini, and persists assistant message.
      // uid is passed so the client can persist the assistant message via Client SDK when
      // the backend signals a preview-sandbox persistence fallback.
      const response = await requestAssistantReflection(token, conversation.id, uid);

      if (response.crisisSupportRequired) {
        setCrisisTriggered(true);
      }
    } catch (err: any) {
      if (err?.statusCode === 429) {
        setErrorMessage(
          `Reflection rate limit reached. Please pause for ${
            err.retryAfterSeconds || 60
          } seconds before reflecting again.`
        );
      } else {
        setErrorMessage(
          err.message || 'An error occurred while generating your reflection. Your message was preserved.'
        );
      }
      setDiagnostics(err?.diagnostics || null);
    } finally {
      setInFlightReflection(false);
      if (onConversationUpdated) {
        onConversationUpdated();
      }
    }
  };

  // Explicit "End & Save Reflection" summarization
  const handleSummarize = async () => {
    if (inFlightSummarize || isCompleted) {
      return;
    }

    // DEMO MODE: show demo notice instead of real summarization
    if (isDemo) {
      setSummarizationError('Demo mode: Summarization requires the backend AI. This preview shows the conversation as-is.');
      return;
    }

    setSummarizationError(null);
    setInFlightSummarize(true);

    try {
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Authentication required: unable to acquire Firebase token.');
      }

      // Backend verifies token, reads history, calls Gemini for summary,
      // atomically transitions status to 'completed', and sets summary.
      // uid is passed so the client can complete the conversation via
      // Client SDK when the backend signals a preview-sandbox
      // persistence fallback.
      await requestSummarize(token, conversation.id, uid);

      if (onConversationUpdated) {
        onConversationUpdated();
      }
    } catch (err: any) {
      // Summarization failure recovery: conversation status remains active,
      // all messages remain intact, and the user is provided a Retry button
      setSummarizationError(
        err.message || 'Failed to generate reflection summary. All messages are intact; tap Retry below.'
      );
    } finally {
      setInFlightSummarize(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div id="conversation-view" className="reflection-workspace">
      {/* Header */}
      <div className="reflection-workspace-header">
        <div className="reflection-workspace-header-left">
          {onBack && (
            <button
              type="button"
              id="btn-back-to-conversations"
              onClick={onBack}
              className="reflection-back-btn"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <h2 className="reflection-workspace-title">{conversation.title}</h2>
          {isCompleted ? (
            <span className="reflection-status-badge completed">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Completed & Saved</span>
            </span>
          ) : (
            <span className="reflection-status-badge active">
              <span className="reflection-status-dot-pulse" />
              <span>Active Session</span>
            </span>
          )}
        </div>

        {/* End & Save Reflection Action */}
        {!isCompleted && hasUserTurns && (
          <button
            type="button"
            id="btn-end-save-reflection"
            onClick={handleSummarize}
            disabled={inFlightSummarize || inFlightReflection}
            className="reflection-end-btn"
          >
            {inFlightSummarize ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Summarizing...</span>
              </>
            ) : (
              <>
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>End & Save Reflection</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Message Feed Container */}
      <div className="reflection-messages">
        {/* Crisis Support Guidance Banner if triggered */}
        {crisisTriggered && (
          <CrisisSupportCard onDismiss={() => setCrisisTriggered(false)} />
        )}

        {/* Summarization Error Banner with Retry */}
        {summarizationError && (
          <div className="reflection-error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <div style={{ flex: 1 }}>{summarizationError}</div>
            <button
              type="button"
              id="btn-retry-summary"
              onClick={handleSummarize}
              disabled={inFlightSummarize}
              className="reflection-retry-btn"
            >
              {inFlightSummarize ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Completed Reflection Summary Card */}
        {isCompleted && conversation.summary && (
          <div className="reflection-summary-card">
            <div className="reflection-summary-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="reflection-summary-title">Reflection Summary & Discoveries</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Synthesized by Reflectra companion</p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">Archived</span>
            </div>

            <div className="reflection-summary-content">{conversation.summary}</div>
          </div>
        )}

        {/* Message Feed */}
        {loadingMessages ? (
          <div className="reflection-loading">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading reflection history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="reflection-empty-state">
            <div className="reflection-empty-icon">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="reflection-empty-title">Welcome to your reflection space</h3>
              <p className="reflection-empty-description">
                Reflectra is here to listen and help you unpack your thoughts without judgment or clinical diagnosis.
                Share what is on your mind today.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                id={`message-bubble-${msg.id}`}
                className={`reflection-message ${isUser ? 'user' : 'assistant'}`}
              >
                {!isUser && (
                  <div className="reflection-avatar assistant">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className="reflection-bubble">
                  <div className="reflection-bubble-role">{isUser ? 'You' : 'Reflectra'}</div>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>

                {isUser && (
                  <div className="reflection-avatar user">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* In-flight assistant contemplation */}
        {inFlightReflection && (
          <div className="reflection-message assistant">
            <div className="reflection-avatar assistant">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="reflection-typing">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Reflectra is listening and contemplating your reflection...</span>
            </div>
          </div>
        )}

        {/* Unanswered User Turn Retry Banner */}
        {hasUnansweredUserTurn && !inFlightReflection && (
          <div className="reflection-retry-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                Your latest reflection is safely saved. Tap <strong>Retry</strong> to generate Reflectra's response.
              </span>
            </div>
            <button
              type="button"
              id="btn-retry-reflection"
              onClick={handleRetryReflection}
              disabled={inFlightReflection || inFlightSummarize}
              className="reflection-retry-btn"
            >
              {inFlightReflection ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* General Error Banner */}
        {errorMessage && (
          <div className="reflection-error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Technical Diagnostics Collapsible Panel */}
        {diagnostics && (
          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 text-slate-800 text-xs flex flex-col gap-3 animate-fade-in shadow-xs">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer font-bold text-amber-900 hover:text-amber-950 focus:outline-none select-none">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 animate-pulse" />
                  <span>Technical Diagnostics</span>
                </div>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold tracking-wide uppercase group-open:hidden">
                  Show Details
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold tracking-wide uppercase hidden group-open:inline">
                  Hide Details
                </span>
              </summary>
              <div className="mt-4 space-y-4 border-t border-amber-200/60 pt-4 text-[11px] leading-relaxed">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-100/30 p-3 rounded-lg border border-amber-200/50">
                  <div>
                    <span className="font-semibold text-slate-500">Failed Stage:</span>{' '}
                    <span className="font-mono text-amber-900 font-bold">{diagnostics.failedStage}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Last Successful:</span>{' '}
                    <span className="font-mono text-emerald-800 font-bold">{diagnostics.lastSuccessfulStage}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">HTTP Status:</span>{' '}
                    <span className="font-mono text-slate-800 font-bold">{diagnostics.status}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Error Name:</span>{' '}
                    <span className="font-mono text-slate-800">{diagnostics.errorName}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Error Code:</span>{' '}
                    <span className="font-mono text-rose-800 font-bold">{diagnostics.errorCode || 'None'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Firestore Transport:</span>{' '}
                    <span className="font-mono text-blue-800 font-bold">{diagnostics.firestoreTransport}</span>
                  </div>
                </div>

                <div className="space-y-1 bg-white p-3 rounded-lg border border-amber-200/50 shadow-2xs">
                  <h4 className="font-bold text-amber-950 text-xs mb-2">Verification Checklist</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Conversation Lookup Succeeded:</span>
                      <span className={`font-mono font-bold ${diagnostics.conversationLookupSucceeded ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.conversationLookupSucceeded ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Messages Lookup Succeeded:</span>
                      <span className={`font-mono font-bold ${diagnostics.authoritativeMessagesLookupSucceeded ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.authoritativeMessagesLookupSucceeded ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Rate Limiter Succeeded:</span>
                      <span className={`font-mono font-bold ${diagnostics.rateLimiterSucceeded ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.rateLimiterSucceeded ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Crisis Screening Succeeded:</span>
                      <span className={`font-mono font-bold ${diagnostics.crisisScreeningSucceeded ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.crisisScreeningSucceeded ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Gemini Init Succeeded:</span>
                      <span className={`font-mono font-bold ${diagnostics.geminiInitializationSucceeded ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.geminiInitializationSucceeded ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span>Gemini Generate Content Reached:</span>
                      <span className={`font-mono font-bold ${diagnostics.generateContentReached ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.generateContentReached ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span>Assistant Persistence Reached:</span>
                      <span className={`font-mono font-bold ${diagnostics.assistantPersistenceReached ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {diagnostics.assistantPersistenceReached ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg border border-slate-800 font-mono text-[10px] shadow-inner">
                  <div className="font-bold text-slate-300 border-b border-slate-800 pb-2 mb-2.5 flex items-center justify-between">
                    <span>STAGE TRACE RECORD</span>
                    <span className="text-[9px] text-slate-500">LIVE SERVER TELEMETRY</span>
                  </div>
                  <div className="space-y-2">
                    {Object.keys(diagnostics.stageTrace || {}).map((stage) => {
                      const st = diagnostics.stageTrace[stage];
                      let statusColor = 'text-slate-400';
                      if (st.status === 'success') statusColor = 'text-emerald-400 font-semibold';
                      if (st.status === 'failure') statusColor = 'text-rose-400 font-bold';
                      return (
                        <div key={stage} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-1 border-b border-slate-800/40">
                          <span className="text-slate-300 font-mono">{stage}</span>
                          <div className="flex items-center gap-2.5 text-[9px]">
                            {st.transport && <span className="text-blue-400">[{st.transport}]</span>}
                            <span className={statusColor}>{String(st.status).toUpperCase()}</span>
                            {st.errorCode && <span className="text-rose-300">({st.errorCode})</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-amber-100/50 p-3 rounded-lg border border-amber-200/50 font-mono text-[10px] text-slate-700 break-words">
                  <span className="font-bold text-amber-950 block mb-1">Sanitized Error Message:</span>
                  {diagnostics.errorMessage}
                </div>
              </div>
            </details>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Bar */}
      <div className="reflection-input-area">
        {isCompleted ? (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>This reflection is completed and saved. Start a new session to reflect again.</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="reflection-input-form">
              <textarea
                ref={inputRef}
                id="input-reflection-message"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={inFlightReflection || inFlightSummarize || hasUnansweredUserTurn}
                placeholder={
                  hasUnansweredUserTurn
                    ? "Awaiting companion response to your saved reflection. Tap 'Retry' above if needed."
                    : "Share your reflection, feeling, or observation... (Enter to send, Shift+Enter for newline)"
                }
                rows={2}
                className="reflection-input-textarea"
              />
              <button
                type="submit"
                id="btn-send-reflection-message"
                disabled={!inputText.trim() || inFlightReflection || inFlightSummarize || hasUnansweredUserTurn}
                className="reflection-send-btn"
                title={hasUnansweredUserTurn ? "Awaiting reflection response" : "Send reflection"}
              >
                {inFlightReflection ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="reflection-input-hint">
              <span>
                {hasUnansweredUserTurn
                  ? "Previous reflection safely saved in Firestore."
                  : "All reflections are private and strictly scoped to your account."}
              </span>
              <span>{inputText.length} chars</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
