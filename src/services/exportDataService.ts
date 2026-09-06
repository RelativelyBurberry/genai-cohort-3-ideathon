/**
 * exportDataService.ts — Phase 19: Zero-Knowledge Export Data Collection
 *
 * Collects the authenticated user's exportable Reflectra data from their
 * OWN Firestore collections (or demo data in demo mode) and assembles a
 * versioned export payload.
 *
 * SECURITY:
 *   - Owner-scoped: every Firestore path is under /users/{uid}/...
 *   - Never queries collectionGroup or any cross-user query.
 *   - Explicitly EXCLUDES /users/{uid}/secrets/* (Discord webhook URLs,
 *     Secret Manager values, etc.).
 *   - In demo mode, only local demo-owned/sample data is collected —
 *     never production user records.
 *   - No authentication tokens, Firebase credentials, server secrets, or
 *     backend configuration are ever included.
 */

import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  getJournalEntries,
} from './journalService';
import { getConversations } from './reflectionService';
import { fetchLatestInsight } from './patternShiftService';
import type { JournalEntry } from '../types/journal';
import type { Conversation, ReflectionMessage } from '../types/reflection';
import type { PatternShiftInsight } from '../types/patternshift';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Schema version for the export payload (independent from file format). */
export const EXPORT_PAYLOAD_VERSION = 1;

/**
 * The exportable Reflectra data scope (production).
 *
 * Deliberately EXCLUDES:
 *   - /users/{uid}/secrets/*
 *   - authentication tokens
 *   - Firebase credentials
 *   - backend configuration
 *   - Discord webhook URLs
 *   - internal service credentials
 */
export interface ExportDataScope {
  journalEntries: JournalEntry[];
  conversations: Conversation[];
  /** Messages for each conversation, keyed by conversation id (production only). */
  messages: Record<string, ReflectionMessage[]>;
  /** Most recent PatternShift insight, if present. */
  patternShiftInsight: PatternShiftInsight | null;
  /** True when this scope came from demo data (never production records). */
  isDemo: boolean;
}

/**
 * The full export payload envelope. Entire object is encrypted before
 * it is placed in the .reflectra file.
 */
export interface ExportPayload {
  exportVersion: number;
  exportedAt: string;
  data: {
    journalEntries: ExportableJournalEntry[];
    conversations: ExportableConversation[];
    messages: Record<string, ExportableMessage[]>;
    patternShiftInsight: ExportablePatternShiftInsight | null;
  };
}

/** Serialize Firestore Timestamps to ISO strings so payload is plain JSON. */
interface ExportableJournalEntry {
  id: string;
  title: string;
  content: string;
  moodRating: number;
  tags: string[];
  wordCount: number;
  crisisFlagged: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  location: { latitude: number; longitude: number; label?: string } | null;
}

interface ExportableConversation {
  id: string;
  title: string;
  summary: string | null;
  status: 'active' | 'completed';
  createdAt: string | null;
  updatedAt: string | null;
  summaryUpdatedAt: string | null;
}

interface ExportableMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
}

interface ExportablePatternShiftInsight {
  id: string;
  generatedAt: string;
  timeRange: { start: string; end: string };
  itemCount: { entries: number; completedConversations: number; total: number };
  metrics: unknown;
  observations: string[];
  suggestedInquiries: string[];
  intelligence: unknown;
  type: 'patternshift';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tsToISO(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof (ts as any).toDate === 'function') {
    try {
      return (ts as any).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function serializeJournalEntry(e: JournalEntry): ExportableJournalEntry {
  return {
    id: e.id,
    title: e.title || '',
    content: e.content || '',
    moodRating: typeof e.moodRating === 'number' ? e.moodRating : 3,
    tags: Array.isArray(e.tags) ? e.tags : [],
    wordCount: typeof e.wordCount === 'number' ? e.wordCount : 0,
    crisisFlagged: Boolean(e.crisisFlagged),
    createdAt: tsToISO(e.createdAt),
    updatedAt: tsToISO(e.updatedAt),
    location: e.location
      ? {
          latitude: e.location.latitude,
          longitude: e.location.longitude,
          ...(e.location.label ? { label: e.location.label } : {}),
        }
      : null,
  };
}

function serializeConversation(c: Conversation): ExportableConversation {
  return {
    id: c.id,
    title: c.title || '',
    summary: c.summary || null,
    status: c.status,
    createdAt: tsToISO(c.createdAt),
    updatedAt: tsToISO(c.updatedAt),
    summaryUpdatedAt: tsToISO(c.summaryUpdatedAt),
  };
}

function serializeMessage(m: ReflectionMessage): ExportableMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content || '',
    createdAt: tsToISO(m.createdAt),
  };
}

function serializeInsight(
  i: PatternShiftInsight | null
): ExportablePatternShiftInsight | null {
  if (!i) return null;
  return {
    id: i.id,
    generatedAt: i.generatedAt || '',
    timeRange: i.timeRange || { start: '', end: '' },
    itemCount: i.itemCount || { entries: 0, completedConversations: 0, total: 0 },
    metrics: i.metrics || null,
    observations: i.observations || [],
    suggestedInquiries: i.suggestedInquiries || [],
    intelligence: i.intelligence || null,
    type: 'patternshift',
  };
}

// ---------------------------------------------------------------------------
// Production collection (owner-scoped Firestore reads)
// ---------------------------------------------------------------------------

/**
 * Fetch conversation messages for the authenticated user.
 *
 * This reads from /users/{uid}/conversations/{conversationId}/messages —
 * strictly owner-scoped by Firestore security rules.
 */
async function getMessagesForAllConversations(
  uid: string,
  conversations: Conversation[]
): Promise<Record<string, ReflectionMessage[]>> {
  const result: Record<string, ReflectionMessage[]> = {};

  for (const conv of conversations) {
    const messagesCol = collection(
      db,
      'users',
      uid,
      'conversations',
      conv.id,
      'messages'
    );
    const q = query(messagesCol, orderBy('createdAt', 'asc'));
    try {
      const snapshot = await getDocs(q);
      result[conv.id] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          role: data.role as 'user' | 'assistant',
          content: data.content || '',
          createdAt: data.createdAt || null,
        };
      });
    } catch (err) {
      // If one conversation's messages fail to load (e.g. transient),
      // continue with the others rather than failing the whole export.
      console.warn(
        '[ExportData] Failed to load messages for conversation',
        conv.id,
        err
      );
      result[conv.id] = [];
    }
  }

  return result;
}

/**
 * Collect the authenticated user's exportable Reflectra data from their
 * OWN Firestore collections.
 *
 * Strictly owner-scoped. NEVER reads /users/{uid}/secrets/*.
 */
export async function collectProductionExportData(
  uid: string
): Promise<ExportDataScope> {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    throw new Error('Unauthorized: User ID must be provided from active authenticated session.');
  }

  // All reads are under /users/{uid}/... and are owner-scoped by
  // firestore.rules. No collectionGroup, no cross-user query.
  const [journalEntries, conversations] = await Promise.all([
    getJournalEntries(uid),
    getConversations(uid),
  ]);

  const messages = await getMessagesForAllConversations(uid, conversations);

  // Load the most recent PatternShift insight (owner-scoped read).
  let patternShiftInsight: PatternShiftInsight | null = null;
  try {
    patternShiftInsight = await fetchLatestInsight(() => Promise.resolve(null), uid);
  } catch {
    // Non-fatal: an insight is optional.
    patternShiftInsight = null;
  }

  return {
    journalEntries,
    conversations,
    messages,
    patternShiftInsight,
    isDemo: false,
  };
}

// ---------------------------------------------------------------------------
// Demo collection (local synthetic data only)
// ---------------------------------------------------------------------------

/**
 * Collect demo-owned exportable data.
 *
 * In demo mode, only the local synthetic fixtures and any local demo
 * edits are collected. Production user records are NEVER read.
 */
export async function collectDemoExportData(
  demoJournalEntries: JournalEntry[],
  demoConversations: Conversation[],
  getDemoMessages: (conversationId: string) => ReflectionMessage[],
  demoPatternInsight: PatternShiftInsight | null
): Promise<ExportDataScope> {
  const messages: Record<string, ReflectionMessage[]> = {};
  for (const conv of demoConversations) {
    messages[conv.id] = getDemoMessages(conv.id) || [];
  }

  return {
    journalEntries: demoJournalEntries,
    conversations: demoConversations,
    messages,
    patternShiftInsight: demoPatternInsight,
    isDemo: true,
  };
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the full export payload envelope from a collected data scope.
 *
 * The returned object is the ENTIRE plaintext that will be encrypted.
 * Nothing from this object should persist outside the ciphertext.
 */
export function buildExportPayload(scope: ExportDataScope): ExportPayload {
  const now = new Date().toISOString();

  return {
    exportVersion: EXPORT_PAYLOAD_VERSION,
    exportedAt: now,
    data: {
      journalEntries: scope.journalEntries.map(serializeJournalEntry),
      conversations: scope.conversations.map(serializeConversation),
      messages: Object.fromEntries(
        Object.entries(scope.messages).map(([convId, msgs]) => [
          convId,
          msgs.map(serializeMessage),
        ])
      ),
      patternShiftInsight: serializeInsight(scope.patternShiftInsight),
    },
  };
}

/**
 * Serialize the export payload to a JSON string (before encryption).
 * Also a handy test utility.
 */
export function serializeExportPayload(payload: ExportPayload): string {
  return JSON.stringify(payload);
}
