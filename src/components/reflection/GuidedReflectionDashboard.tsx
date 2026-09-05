import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';
import type { Conversation, ReflectionMessage } from '../../types/reflection';
import {
  subscribeToConversations,
  createConversation,
  deleteConversation,
} from '../../services/reflectionService';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { Sparkles, Plus } from 'lucide-react';

export const GuidedReflectionDashboard: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const { 
    isDemoSession, 
    demoConversations, 
    getDemoMessages, 
    createDemoConversation, 
    deleteDemoConversation,
    sendDemoMessage 
  } = useDemo();
  const isDemo = useIsDemoSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [demoMessages, setDemoMessages] = useState<Record<string, ReflectionMessage[]>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Demo mode: use synthetic conversations
  useEffect(() => {
    if (isDemo) {
      setConversations(demoConversations);
      setLoading(false);
      // Auto-select first conversation
      if (demoConversations.length > 0 && !activeConversationId) {
        setActiveConversationId(demoConversations[0].id);
      }
    }
  }, [isDemo, demoConversations]);

  // Subscribe to all conversations for this authenticated user (real mode)
  useEffect(() => {
    if (isDemo) return;
    if (!user) return;

    console.log(`[DIAG_SYNC_TRACE] stage: useEffect_listener_subscription_path | user.uid: ${user.uid}`);
    setLoading(true);

    const unsubscribe = subscribeToConversations(
      user.uid,
      (convs, meta) => {
        console.log(
          `[DIAG_SYNC_TRACE] stage: snapshot_callback_invocation | docCount: ${convs.length} | docIds:`,
          meta?.docIds || convs.map((c) => c.id),
          `| docChanges:`,
          meta?.changes || []
        );

        setConversations((prev) => {
          const prevIds = prev.map((c) => c.id);
          const nextIds = convs.map((c) => c.id);
          console.log(
            `[DIAG_SYNC_TRACE] stage: react_conversations_state_setter | beforeDocIds:`,
            prevIds,
            `| afterDocIds:`,
            nextIds
          );
          return convs;
        });

        setLoading(false);

        // Auto-select the first conversation if none is selected or if active was removed
        setActiveConversationId((prevActive) => {
          if (prevActive && convs.some((c) => c.id === prevActive)) {
            console.log(
              `[DIAG_SYNC_TRACE] stage: active_conversation_reconciliation | preservedActiveId: ${prevActive}`
            );
            return prevActive;
          }
          const nextActive = convs.length > 0 ? convs[0].id : null;
          console.log(
            `[DIAG_SYNC_TRACE] stage: active_conversation_reconciliation | activeDocRemovedOrReset | prevActiveId: ${prevActive} | newActiveId: ${nextActive}`
          );
          return nextActive;
        });
      },
      (err) => {
        console.error('[GuidedReflection] Failed to subscribe to conversations:', err);
        setLoading(false);
      }
    );

    return () => {
      console.log(`[DIAG_SYNC_TRACE] stage: listener_unsubscribed | user.uid: ${user.uid}`);
      unsubscribe();
    };
  }, [user, isDemo]);

  const handleStartNew = async () => {
    if (isDemo) {
      try {
        const newId = await createDemoConversation(`Reflection Session · ${new Date().toLocaleDateString()}`);
        setActiveConversationId(newId);
      } catch (err) {
        console.error('[GuidedReflection] Failed to create demo conversation:', err);
      }
      return;
    }
    if (!user) return;
    try {
      const newId = await createConversation(user.uid, `Reflection Session · ${new Date().toLocaleDateString()}`);
      setActiveConversationId(newId);
    } catch (err) {
      console.error('[GuidedReflection] Failed to create conversation:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (isDemo) {
      try {
        await deleteDemoConversation(id);
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversationId === id) {
          const remaining = conversations.filter(c => c.id !== id);
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
      } catch (err) {
        console.error('[GuidedReflection] Failed to delete demo conversation:', err);
      }
      return;
    }
    if (!user) return;
    try {
      console.log(`[DIAG_DELETE_STAGE] stage: delete_token_acquired | conversationId: ${id}`);
      const token = await getIdToken(false);
      if (!token) throw new Error('Authentication required.');
      const res = await deleteConversation(token, id);
      console.log(`[DIAG_DELETE_STAGE] stage: delete_api_response_received | conversationId: ${id} | res:`, res);

      // Clean up client Firestore SDK local cache
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'conversations', id));
      } catch (_cacheErr) {
        // Document was already removed on server
      }

      // Synchronize React state immediately upon confirmed Firestore deletion
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        console.log(
          `[DIAG_SYNC_TRACE] stage: react_conversations_state_setter_after_delete | beforeCount: ${prev.length} | afterCount: ${remaining.length} | removedId: ${id}`
        );

        setActiveConversationId((prevActive) => {
          if (prevActive === id) {
            const nextActive = remaining.length > 0 ? remaining[0].id : null;
            console.log(
              `[DIAG_SYNC_TRACE] stage: active_conversation_reconciliation_after_delete | oldActive: ${id} | newActive: ${nextActive}`
            );
            return nextActive;
          }
          return prevActive;
        });

        return remaining;
      });
    } catch (err: any) {
      console.error('[GuidedReflection] Failed to delete conversation:', err);
      throw err;
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  if (!isDemo && !user) return null;

  return (
    <div id="guided-reflection-dashboard" className="guided-reflection-page">
      {/* Header */}
      <div className="guided-reflection-header">
        <div className="guided-reflection-eyebrow">Guided Reflection</div>
        <h1 className="guided-reflection-title">A private space to think out loud.</h1>
        <p className="guided-reflection-subtitle">
          Reflectra guides you through multi-turn personal introspection using secure, server-side AI. 
          Select a past session or start a new reflection.
        </p>
      </div>

      {/* Two-Column Layout */}
      <div className="guided-reflection-layout">
        {/* Left Column: Conversation Archive */}
        <div className="reflection-archive">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => setActiveConversationId(id)}
            onStartNewConversation={handleStartNew}
            onDeleteConversation={handleDelete}
            loading={loading}
          />
        </div>

        {/* Right Column: Active Conversation */}
        <div className={`reflection-workspace ${activeConversation ? 'active' : ''}`}>
          {activeConversation ? (
            <ConversationView
              key={activeConversation.id}
              conversation={activeConversation}
              uid={isDemo ? 'demo-user-local-preview' : user.uid}
              getIdToken={getIdToken}
              onBack={() => setActiveConversationId(null)}
              onConversationUpdated={() => {
                // Real-time subscription will automatically reflect updates
              }}
            />
          ) : (
            <div className="reflection-empty-state">
              <div className="reflection-empty-icon">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="reflection-empty-title">Begin Your Reflection Journey</h3>
                <p className="reflection-empty-description">
                  Start a guided reflection to explore your thoughts with the help of Reflectra's 
                  contemplative companion.
                </p>
              </div>
              <button
                type="button"
                id="btn-empty-start-reflection"
                onClick={handleStartNew}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Begin a New Reflection</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
