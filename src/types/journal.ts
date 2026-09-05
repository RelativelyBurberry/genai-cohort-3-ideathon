import { Timestamp } from 'firebase/firestore';

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
}

export interface CreateJournalEntryInput {
  title?: string;
  content: string;
  moodRating: number;
  tags?: string[];
}

export interface UpdateJournalEntryInput {
  title?: string;
  content: string;
  moodRating: number;
  tags?: string[];
}
