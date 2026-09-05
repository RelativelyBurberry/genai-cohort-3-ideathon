import { Timestamp } from 'firebase/firestore';
import type { EntryLocation } from './location';

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  moodRating: number; // 1 to 5
  tags: string[];
  wordCount: number;
  crisisFlagged: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  /** Optional location attached to this entry (Phase 9) */
  location?: EntryLocation | null;
}

export interface CreateJournalEntryInput {
  title?: string;
  content: string;
  moodRating: number;
  tags?: string[];
  /** Optional location attached to this entry (Phase 9) */
  location?: EntryLocation | null;
}

export interface UpdateJournalEntryInput {
  title?: string;
  content: string;
  moodRating: number;
  tags?: string[];
  /** Optional location attached to this entry (Phase 9) */
  location?: EntryLocation | null;
}
