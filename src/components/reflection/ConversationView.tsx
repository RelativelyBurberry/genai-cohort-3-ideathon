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

  // Real-time message subscription
  useEffect(() => {
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
  }, [uid, conversation.id]);

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

    setErrorMessage(null);
    setDiagnostics(null);
    setInFlightReflection(true);

    try {
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Authentication required: unable to acquire Firebase token.');
      }

      // Invokes ONLY POST /api/reflect - strictly DOES NOT call addUserMessage
      const response = await requestAssistantReflection(token, conversation.id);

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

  // Send a user message and request Gemini reflection
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
      // Backend validates token, runs crisis screener, rate limiter, invokes Gemini, and persists assistant message
      const response = await requestAssistantReflection(token, conversation.id);

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

    setSummarizationError(null);
    setInFlightSummarize(true);

    try {
      const token = await getIdToken(false);
      if (!token) {
        throw new Error('Authentication required: unable to acquire Firebase token.');
      }

      // Backend verifies token, reads history, calls Gemini for summary,
      // atomically transitions status to 'completed', and sets summary
      await requestSummarize(token, conversation.id);

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
    <div id="conversation-view" className="flex flex-col h-full min-h-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              id="btn-back-to-conversations"
              onClick={onBack}
              className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition cursor-pointer md:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {conversation.title}
              </h2>
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Completed & Saved</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Active Session</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {isCompleted ? 'Reflection archived and summarized' : 'Multi-turn contemplative dialogue'}
            </p>
          </div>
        </div>

        {/* End & Save Reflection Action */}
        {!isCompleted && hasUserTurns && (
          <button
            type="button"
            id="btn-end-save-reflection"
            onClick={handleSummarize}
            disabled={inFlightSummarize || inFlightReflection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer shrink-0 disabled:opacity-50"
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
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Crisis Support Guidance Banner if triggered */}
        {crisisTriggered && (
          <CrisisSupportCard onDismiss={() => setCrisisTriggered(false)} />
        )}

        {/* Summarization Error Banner with Retry */}
        {summarizationError && (
          <div
            id="summarization-error-card"
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{summarizationError}</span>
            </div>
            <button
              type="button"
              id="btn-retry-summary"
              onClick={handleSummarize}
              disabled={inFlightSummarize}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-medium transition cursor-pointer shrink-0"
            >
              {inFlightSummarize ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>Retry Summary</span>
            </button>
          </div>
        )}

        {/* Completed Reflection Summary Card */}
        {isCompleted && conversation.summary && (
          <div
            id="conversation-summary-card"
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wide uppercase text-slate-300">
                    Reflection Summary & Discoveries
                  </h3>
                  <p className="text-[10px] text-slate-400">Synthesized by Reflectra companion</p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">Archived in Vault</span>
            </div>

            <div className="text-xs leading-relaxed text-slate-200 space-y-2 whitespace-pre-wrap font-sans">
              {conversation.summary}
            </div>
          </div>
        )}

        {/* Message Feed */}
        {loadingMessages ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading reflection history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center space-y-3 max-w-md mx-auto">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Welcome to your reflection space</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
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
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-slate-100 text-slate-900 border border-slate-200/80 rounded-tr-xs'
                      : 'bg-white text-slate-800 border border-slate-200 shadow-xs rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-[10px] font-semibold text-slate-400">
                      {isUser ? 'You' : 'Reflectra'}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* In-flight assistant contemplation */}
        {inFlightReflection && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-4 text-xs text-slate-500 shadow-xs flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700" />
              <span>Reflectra is listening and contemplating your reflection...</span>
            </div>
          </div>
        )}

        {/* Unanswered User Turn Retry Banner */}
        {hasUnansweredUserTurn && !inFlightReflection && (
          <div
            id="unanswered-turn-retry-card"
            className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Your latest reflection is safely saved. Tap <strong>Retry Reflection</strong> to generate Reflectra's response.
              </span>
            </div>
            <button
              type="button"
              id="btn-retry-reflection"
              onClick={handleRetryReflection}
              disabled={inFlightReflection || inFlightSummarize}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 shadow-xs"
            >
              {inFlightReflection ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Retry Reflection</span>
            </button>
          </div>
        )}

        {/* General Error Banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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
      <div className="p-4 border-t border-slate-100 bg-white shrink-0">
        {isCompleted ? (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>This reflection is completed and saved. Start a new session to reflect again.</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="relative">
              <textarea
                ref={inputRef}
                id="input-reflection-message"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={inFlightReflection || inFlightSummarize || hasUnansweredUserTurn}
                placeholder={
                  hasUnansweredUserTurn
                    ? "Awaiting companion response to your saved reflection. Tap 'Retry Reflection' above if needed."
                    : "Share your reflection, feeling, or observation... (Enter to send, Shift+Enter for newline)"
                }
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs text-slate-800 placeholder-slate-400 resize-none disabled:bg-slate-50 disabled:text-slate-500"
              />
              <button
                type="submit"
                id="btn-send-reflection-message"
                disabled={!inputText.trim() || inFlightReflection || inFlightSummarize || hasUnansweredUserTurn}
                className="absolute right-2.5 bottom-3.5 p-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white rounded-lg transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
                title={hasUnansweredUserTurn ? "Awaiting reflection response" : "Send reflection"}
              >
                {inFlightReflection ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
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
