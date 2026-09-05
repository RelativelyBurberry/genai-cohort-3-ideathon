import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  JournalEntry,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
} from '../types/journal';
import {
  calculateWordCount,
  normalizeTags,
  validateJournalEntryInput,
} from '../utils/journal';

/**
 * Validates UID parameter to ensure reference is never constructed with an undefined or empty user ID.
 */
function assertValidUid(uid: string): void {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    throw new Error('Unauthorized: User ID must be provided from active authenticated session.');
  }
}

/**
 * Creates a new personal journal entry under /users/{uid}/entries/{entryId}.
 * Calculations for wordCount and tag normalization are performed deterministically.
 */
export async function createJournalEntry(
  uid: string,
  input: CreateJournalEntryInput
): Promise<string> {
  assertValidUid(uid);

  const validation = validateJournalEntryInput(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid journal entry data.');
  }

  const wordCount = calculateWordCount(input.content);
  const normalizedTags = normalizeTags(input.tags);

  const entriesColRef = collection(db, 'users', uid, 'entries');

  const docData = {
    title: (input.title || '').trim(),
    content: input.content.trim(),
    moodRating: Math.round(input.moodRating),
    tags: normalizedTags,
    wordCount,
    crisisFlagged: false, // Invariant: crisisFlagged cannot be set true by client in this milestone
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Optional location (Phase 9)
    ...(input.location ? { location: input.location } : {}),
  };

  const docRef = await addDoc(entriesColRef, docData);
  return docRef.id;
}

/**
 * Updates an existing journal entry under /users/{uid}/entries/{entryId}.
 * Preserves the original createdAt timestamp.
 */
export async function updateJournalEntry(
  uid: string,
  entryId: string,
  input: UpdateJournalEntryInput,
  originalCreatedAt: Timestamp
): Promise<void> {
  assertValidUid(uid);
  if (!entryId || typeof entryId !== 'string') {
    throw new Error('Entry ID is required for update.');
  }

  const validation = validateJournalEntryInput(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid journal entry data.');
  }

  const wordCount = calculateWordCount(input.content);
  const normalizedTags = normalizeTags(input.tags);

  const entryDocRef = doc(db, 'users', uid, 'entries', entryId);

  await updateDoc(entryDocRef, {
    title: (input.title || '').trim(),
    content: input.content.trim(),
    moodRating: Math.round(input.moodRating),
    tags: normalizedTags,
    wordCount,
    crisisFlagged: false,
    createdAt: originalCreatedAt,
    updatedAt: serverTimestamp(),
    // Optional location (Phase 9) - include even if null to allow removal
    location: input.location ?? null,
  });
}

/**
 * Deletes a journal entry under /users/{uid}/entries/{entryId}.
 */
export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  assertValidUid(uid);
  if (!entryId || typeof entryId !== 'string') {
    throw new Error('Entry ID is required for deletion.');
  }

  const entryDocRef = doc(db, 'users', uid, 'entries', entryId);
  await deleteDoc(entryDocRef);
}

/**
 * Subscribes to real-time updates of the user's journal entries ordered newest first.
 * Automatically unsubscribes on teardown to prevent memory leaks or redundant reads.
 */
export function subscribeToJournalEntries(
  uid: string,
  onUpdate: (entries: JournalEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  assertValidUid(uid);

  const entriesColRef = collection(db, 'users', uid, 'entries');
  const entriesQuery = query(entriesColRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    entriesQuery,
    (snapshot) => {
      const entries: JournalEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || '',
          content: data.content || '',
          moodRating: typeof data.moodRating === 'number' ? data.moodRating : 3,
          tags: Array.isArray(data.tags) ? data.tags : [],
          wordCount: typeof data.wordCount === 'number' ? data.wordCount : 0,
          crisisFlagged: Boolean(data.crisisFlagged),
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          // Optional location (Phase 9)
          location: data.location || null,
        };
      });
      onUpdate(entries);
    },
    (error) => {
      // Privacy safe error handling
      console.error('[JOURNAL_SUBSCRIBE_ERROR]', error.code || 'permission-denied');
      onError(error);
    }
  );
}

/**
 * One-time fetch of the user's journal entries.
 */
export async function getJournalEntries(uid: string): Promise<JournalEntry[]> {
  assertValidUid(uid);

  const entriesColRef = collection(db, 'users', uid, 'entries');
  const entriesQuery = query(entriesColRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(entriesQuery);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title || '',
      content: data.content || '',
      moodRating: typeof data.moodRating === 'number' ? data.moodRating : 3,
      tags: Array.isArray(data.tags) ? data.tags : [],
      wordCount: typeof data.wordCount === 'number' ? data.wordCount : 0,
      crisisFlagged: Boolean(data.crisisFlagged),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      // Optional location (Phase 9)
      location: data.location || null,
    };
  });
}
