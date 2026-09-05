import { useDemo } from './DemoContext';
import * as journalService from '../services/journalService';
import * as reflectionService from '../services/reflectionService';
import * as patternShiftService from '../services/patternShiftService';
import type { JournalEntry, CreateJournalEntryInput, UpdateJournalEntryInput } from '../types/journal';
import type { Conversation, ReflectionMessage } from '../types/reflection';
import type { PatternShiftInsight } from '../types/patternshift';

/**
 * Demo-aware data hooks
 * 
 * These hooks automatically switch between real services and demo data
 * based on the current demo session state.
 * 
 * In demo mode:
 * - No Firebase calls
 * - No backend API calls
 * - localStorage-only persistence
 * 
 * In real mode:
 * - Delegates to existing services (unchanged)
 */

export function useDemoJournalData() {
  const { isDemoSession, demoJournalEntries } = useDemo();
  
  return {
    isDemo: isDemoSession,
    entries: isDemoSession ? demoJournalEntries : null, // null means "use real service"
  };
}

export function useDemoConversationData() {
  const { isDemoSession, demoConversations } = useDemo();
  
  return {
    isDemo: isDemoSession,
    conversations: isDemoSession ? demoConversations : null,
  };
}

export function useDemoPatternData() {
  const { isDemoSession, demoPatternInsight } = useDemo();
  
  return {
    isDemo: isDemoSession,
    insight: isDemoSession ? demoPatternInsight : null,
  };
}

/**
 * Unified journal operations that work in both demo and real mode.
 */
export function useJournalOperations() {
  const { isDemoSession, createDemoJournalEntry, updateDemoJournalEntry, deleteDemoJournalEntry } = useDemo();
  
  return {
    create: async (uid: string, input: CreateJournalEntryInput): Promise<string> => {
      if (isDemoSession) {
        return createDemoJournalEntry(input);
      }
      return journalService.createJournalEntry(uid, input);
    },
    update: async (uid: string, entryId: string, input: UpdateJournalEntryInput, originalCreatedAt: any): Promise<void> => {
      if (isDemoSession) {
        return updateDemoJournalEntry(entryId, input);
      }
      return journalService.updateJournalEntry(uid, entryId, input, originalCreatedAt);
    },
    delete: async (uid: string, entryId: string): Promise<void> => {
      if (isDemoSession) {
        return deleteDemoJournalEntry(entryId);
      }
      return journalService.deleteJournalEntry(uid, entryId);
    },
  };
}

/**
 * Unified reflection operations.
 */
export function useReflectionOperations() {
  const { isDemoSession, createDemoConversation, deleteDemoConversation, sendDemoMessage, getDemoMessages } = useDemo();
  
  return {
    create: async (uid: string, title: string): Promise<string> => {
      if (isDemoSession) {
        return createDemoConversation(title);
      }
      return reflectionService.createConversation(uid, title);
    },
    delete: async (token: string, conversationId: string): Promise<any> => {
      if (isDemoSession) {
        await deleteDemoConversation(conversationId);
        return { ok: true }; // Return void equivalent
      }
      return reflectionService.deleteConversation(token, conversationId);
    },
    sendMessage: async (
      uid: string,
      conversationId: string,
      content: string
    ): Promise<string> => {
      if (isDemoSession) {
        await sendDemoMessage(conversationId, content);
        // Return a dummy ID for demo mode
        return `demo-msg-${Date.now()}`;
      }
      return reflectionService.addUserMessage(uid, conversationId, content);
    },
    getMessages: (conversationId: string): ReflectionMessage[] | null => {
      if (isDemoSession) {
        return getDemoMessages(conversationId);
      }
      return null; // Use real subscription
    },
  };
}
