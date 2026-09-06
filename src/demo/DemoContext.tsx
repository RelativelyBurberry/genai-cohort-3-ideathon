import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Timestamp } from "firebase/firestore";
import {
  isDemoModeEnabled,
  DEMO_USER,
  DEMO_ADMIN_USER,
  DEMO_ROLE_STORAGE_KEY,
  DEFAULT_DEMO_ROLE,
  loadDemoRole,
  saveDemoRole,
  DEMO_STORAGE_KEY,
  resetDemoWorkspace as resetDemoStorage,
  type DemoRole,
} from "./demoConfig";
import {
  DEMO_JOURNAL_ENTRIES,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_PATTERN_INSIGHT,
} from "./demoData";
import type {
  JournalEntry,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
} from "../types/journal";
import type { Conversation, ReflectionMessage } from "../types/reflection";
import type { PatternShiftInsight } from "../types/patternshift";
import type { UserRole } from "../types/rbac";

/**
 * Demo Context
 *
 * Provides demo mode state and synthetic data adapters.
 * Only active when VITE_DEMO_MODE=true.
 *
 * SECURITY: This context does NOT:
 * - Create Firebase tokens
 * - Call backend APIs
 * - Write to production Firestore
 * - Invoke Gemini
 */

interface DemoWorkspace {
  journalEntries: JournalEntry[];
  conversations: Conversation[];
  messages: Record<string, ReflectionMessage[]>;
}

interface DemoContextType {
  /** Whether demo mode is enabled via VITE_DEMO_MODE */
  isDemoMode: boolean;

  /** Whether user is currently in demo session (clicked "Explore Demo") */
  isDemoSession: boolean;

  /** Synthetic demo user identity */
  demoUser: typeof DEMO_USER | null;

  /** Demo role (USER or ADMIN demonstration only) */
  demoRole: DemoRole;

  /** Set demo role (DEMONSTRATION ONLY - never affects production authorization) */
  setDemoRole: (role: DemoRole) => void;

  /** Start demo session (called when "Explore Demo" is clicked) */
  startDemoSession: () => void;

  /** Exit demo session (return to landing page) */
  exitDemoSession: () => void;

  /** Reset demo workspace to initial fixture state */
  resetDemoWorkspace: () => void;

  // Demo data adapters (mirror real service APIs)

  /** Demo journal entries */
  demoJournalEntries: JournalEntry[];

  /** Create a demo journal entry (localStorage only) */
  createDemoJournalEntry: (input: CreateJournalEntryInput) => Promise<string>;

  /** Update a demo journal entry (localStorage only) */
  updateDemoJournalEntry: (
    entryId: string,
    input: UpdateJournalEntryInput,
  ) => Promise<void>;

  /** Delete a demo journal entry (localStorage only) */
  deleteDemoJournalEntry: (entryId: string) => Promise<void>;

  /** Demo conversations */
  demoConversations: Conversation[];

  /** Demo messages for a conversation */
  getDemoMessages: (conversationId: string) => ReflectionMessage[];

  /** Create a demo conversation (localStorage only) */
  createDemoConversation: (title: string) => Promise<string>;

  /** Delete a demo conversation (localStorage only) */
  deleteDemoConversation: (conversationId: string) => Promise<void>;

  /** Send a demo message (localStorage only, synthetic assistant response) */
  sendDemoMessage: (conversationId: string, content: string) => Promise<void>;

  /** Demo PatternShift insight */
  demoPatternInsight: PatternShiftInsight | null;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

/**
 * Load demo workspace from localStorage or return initial fixtures.
 */
function loadDemoWorkspace(): DemoWorkspace {
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Timestamps
      return {
        journalEntries: parsed.journalEntries.map((e: any) => ({
          ...e,
          createdAt: e.createdAt
            ? Timestamp.fromDate(new Date(e.createdAt))
            : null,
          updatedAt: e.updatedAt
            ? Timestamp.fromDate(new Date(e.updatedAt))
            : null,
          location: e.location || null,
        })),
        conversations: parsed.conversations.map((c: any) => ({
          ...c,
          createdAt: c.createdAt
            ? Timestamp.fromDate(new Date(c.createdAt))
            : null,
          updatedAt: c.updatedAt
            ? Timestamp.fromDate(new Date(c.updatedAt))
            : null,
          summaryUpdatedAt: c.summaryUpdatedAt
            ? Timestamp.fromDate(new Date(c.summaryUpdatedAt))
            : null,
        })),
        messages: Object.fromEntries(
          Object.entries(parsed.messages).map(
            ([convId, msgs]: [string, any]) => [
              convId,
              msgs.map((m: any) => ({
                ...m,
                createdAt: m.createdAt
                  ? Timestamp.fromDate(new Date(m.createdAt))
                  : null,
              })),
            ],
          ),
        ),
      };
    }
  } catch (err) {
    console.warn(
      "[DemoContext] Failed to load demo workspace from localStorage:",
      err,
    );
  }

  // Return initial fixtures
  return {
    journalEntries: [...DEMO_JOURNAL_ENTRIES],
    conversations: [...DEMO_CONVERSATIONS],
    messages: { ...DEMO_MESSAGES },
  };
}

/**
 * Save demo workspace to localStorage.
 */
function saveDemoWorkspace(workspace: DemoWorkspace): void {
  try {
    // Convert Timestamps to ISO strings for storage
    const toStore = {
      journalEntries: workspace.journalEntries.map((e) => ({
        ...e,
        createdAt: e.createdAt?.toDate().toISOString() || null,
        updatedAt: e.updatedAt?.toDate().toISOString() || null,
        location: e.location || null,
      })),
      conversations: workspace.conversations.map((c) => ({
        ...c,
        createdAt: c.createdAt?.toDate().toISOString() || null,
        updatedAt: c.updatedAt?.toDate().toISOString() || null,
        summaryUpdatedAt: c.summaryUpdatedAt?.toDate().toISOString() || null,
      })),
      messages: Object.fromEntries(
        Object.entries(workspace.messages).map(([convId, msgs]) => [
          convId,
          msgs.map((m) => ({
            ...m,
            createdAt: m.createdAt?.toDate().toISOString() || null,
          })),
        ]),
      ),
    };
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(toStore));
  } catch (err) {
    console.warn(
      "[DemoContext] Failed to save demo workspace to localStorage:",
      err,
    );
  }
}

/**
 * Generate a unique ID for demo entities.
 */
function generateDemoId(): string {
  return `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const DemoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const isDemoMode = isDemoModeEnabled();
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [demoRole, setDemoRoleState] = useState<DemoRole>(DEFAULT_DEMO_ROLE);
  const [workspace, setWorkspace] = useState<DemoWorkspace>({
    journalEntries: [],
    conversations: [],
    messages: {},
  });

  // Load demo role from localStorage when demo session starts
  useEffect(() => {
    if (isDemoMode && isDemoSession) {
      // Default to user role unless previously switched to admin
      const savedRole = loadDemoRole();
      setDemoRoleState(savedRole);
    }
  }, [isDemoMode, isDemoSession]);

  // Load workspace on mount (only in demo mode)
  useEffect(() => {
    if (isDemoMode && isDemoSession) {
      const loaded = loadDemoWorkspace();
      setWorkspace(loaded);
    }
  }, [isDemoMode, isDemoSession]);

  // Persist workspace changes to localStorage
  useEffect(() => {
    if (isDemoMode && isDemoSession && workspace.journalEntries.length > 0) {
      saveDemoWorkspace(workspace);
    }
  }, [isDemoMode, isDemoSession, workspace]);

  const startDemoSession = useCallback(() => {
    if (!isDemoMode) {
      console.warn(
        "[DemoContext] Cannot start demo session: VITE_DEMO_MODE is not enabled.",
      );
      return;
    }
    setIsDemoSession(true);
  }, [isDemoMode]);

  const exitDemoSession = useCallback(() => {
    setIsDemoSession(false);
    // Keep workspace in localStorage for next session
  }, []);

  const setDemoRole = useCallback((role: DemoRole) => {
    setDemoRoleState(role);
    // Persist role selection to localStorage (DEMO ONLY)
    saveDemoRole(role);
  }, []);

  const resetDemoWorkspace = useCallback(() => {
    resetDemoStorage();
    const fresh: DemoWorkspace = {
      journalEntries: [...DEMO_JOURNAL_ENTRIES],
      conversations: [...DEMO_CONVERSATIONS],
      messages: { ...DEMO_MESSAGES },
    };
    setWorkspace(fresh);
    saveDemoWorkspace(fresh);
  }, []);

  // Journal adapters
  const createDemoJournalEntry = useCallback(
    async (input: CreateJournalEntryInput): Promise<string> => {
      const id = generateDemoId();
      const now = Timestamp.now();
      const entry: JournalEntry = {
        id,
        title: input.title || "",
        content: input.content,
        moodRating: input.moodRating,
        tags: input.tags || [],
        wordCount: input.content.split(/\s+/).filter(Boolean).length,
        crisisFlagged: false,
        createdAt: now,
        updatedAt: now,
        location: input.location || null,
      };
      setWorkspace((prev) => ({
        ...prev,
        journalEntries: [entry, ...prev.journalEntries],
      }));
      return id;
    },
    [],
  );

  const updateDemoJournalEntry = useCallback(
    async (entryId: string, input: UpdateJournalEntryInput): Promise<void> => {
      setWorkspace((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.map((e) => {
          if (e.id === entryId) {
            return {
              ...e,
              title: input.title || e.title,
              content: input.content,
              moodRating: input.moodRating,
              tags: input.tags || e.tags,
              wordCount: input.content.split(/\s+/).filter(Boolean).length,
              updatedAt: Timestamp.now(),
              location:
                input.location !== undefined ? input.location : e.location,
            };
          }
          return e;
        }),
      }));
    },
    [],
  );

  const deleteDemoJournalEntry = useCallback(
    async (entryId: string): Promise<void> => {
      setWorkspace((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.filter((e) => e.id !== entryId),
      }));
    },
    [],
  );

  // Conversation adapters
  const createDemoConversation = useCallback(
    async (title: string): Promise<string> => {
      const id = generateDemoId();
      const now = Timestamp.now();
      const conv: Conversation = {
        id,
        title:
          title || `Reflection Session · ${new Date().toLocaleDateString()}`,
        summary: null,
        status: "active",
        createdAt: now,
        updatedAt: now,
        summaryUpdatedAt: null,
      };
      setWorkspace((prev) => ({
        ...prev,
        conversations: [conv, ...prev.conversations],
        messages: { ...prev.messages, [id]: [] },
      }));
      return id;
    },
    [],
  );

  const deleteDemoConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      setWorkspace((prev) => {
        const { [conversationId]: _, ...remainingMessages } = prev.messages;
        return {
          ...prev,
          conversations: prev.conversations.filter(
            (c) => c.id !== conversationId,
          ),
          messages: remainingMessages,
        };
      });
    },
    [],
  );

  const getDemoMessages = useCallback(
    (conversationId: string): ReflectionMessage[] => {
      return workspace.messages[conversationId] || [];
    },
    [workspace.messages],
  );

  const sendDemoMessage = useCallback(
    async (conversationId: string, content: string): Promise<void> => {
      const userMsgId = generateDemoId();
      const userMsg: ReflectionMessage = {
        id: userMsgId,
        role: "user",
        content,
        createdAt: Timestamp.now(),
      };

      // Synthetic assistant response
      const assistantMsgId = generateDemoId();
      const assistantResponses = [
        "That is an interesting reflection. What draws you to this thought right now?",
        "I hear you. What would it feel like to sit with this for a moment longer?",
        "Thank you for sharing. What does this mean to you in the context of your day?",
        "That resonates. How might this connect to something you have been thinking about lately?",
        "I appreciate your openness. What would you want to understand more deeply about this?",
      ];
      const assistantMsg: ReflectionMessage = {
        id: assistantMsgId,
        role: "assistant",
        content:
          assistantResponses[
            Math.floor(Math.random() * assistantResponses.length)
          ] +
          "\n\n_This is a demo response. AI requests are disabled in local preview._",
        createdAt: Timestamp.now(),
      };

      setWorkspace((prev) => ({
        ...prev,
        messages: {
          ...prev.messages,
          [conversationId]: [
            ...(prev.messages[conversationId] || []),
            userMsg,
            assistantMsg,
          ],
        },
        conversations: prev.conversations.map((c) =>
          c.id === conversationId ? { ...c, updatedAt: Timestamp.now() } : c,
        ),
      }));
    },
    [],
  );

  const value: DemoContextType = useMemo(
    () => ({
      isDemoMode,
      isDemoSession,
      demoUser: isDemoSession
        ? demoRole === "admin"
          ? DEMO_ADMIN_USER
          : DEMO_USER
        : null,
      demoRole,
      setDemoRole,
      startDemoSession,
      exitDemoSession,
      resetDemoWorkspace,
      demoJournalEntries: workspace.journalEntries,
      createDemoJournalEntry,
      updateDemoJournalEntry,
      deleteDemoJournalEntry,
      demoConversations: workspace.conversations,
      getDemoMessages,
      createDemoConversation,
      deleteDemoConversation,
      sendDemoMessage,
      demoPatternInsight: DEMO_PATTERN_INSIGHT,
    }),
    [
      isDemoMode,
      isDemoSession,
      demoRole,
      setDemoRole,
      startDemoSession,
      exitDemoSession,
      resetDemoWorkspace,
      workspace.journalEntries,
      workspace.conversations,
      workspace.messages,
      createDemoJournalEntry,
      updateDemoJournalEntry,
      deleteDemoJournalEntry,
      getDemoMessages,
      createDemoConversation,
      deleteDemoConversation,
      sendDemoMessage,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};

export function useDemo(): DemoContextType {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return context;
}

/**
 * Hook to check if currently in demo session.
 * Returns false if demo mode is disabled or not in active session.
 */
export function useIsDemoSession(): boolean {
  const { isDemoSession } = useDemo();
  return isDemoSession;
}
