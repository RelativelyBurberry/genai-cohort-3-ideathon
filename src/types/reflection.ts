import { Timestamp } from 'firebase/firestore';

export interface Conversation {
  id: string;
  title: string;
  summary: string | null;
  status: 'active' | 'completed';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  summaryUpdatedAt: Timestamp | null;
}

export interface ReflectionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp | null;
}

/**
 * Persistence metadata returned by POST /api/reflect.
 *
 * - persisted: true  -> backend persisted the assistant message (production).
 * - persisted: false, fallbackRequired: true -> backend persistence was
 *   unavailable (preview sandbox); the generated response is still returned
 *   and the authenticated client must persist it via the Firebase Client SDK.
 */
export interface ReflectPersistence {
  persisted: boolean;
  fallbackRequired?: boolean;
  reason?: string;
}

export interface ReflectApiResponse {
  status?: 'success';
  conversationId: string;
  message?: {
    id: string | null;
    role: 'assistant';
    content: string;
    createdAt: string;
  };
  persistence?: ReflectPersistence;
  crisisSupportRequired?: boolean;
  assistantMessage?: null;
  error?: string;
}

/**
 * Summarization response returned by POST /api/conversations/:id/summarize.
 *
 * - persistence.persisted: true  -> backend persisted the summary and
 *   transitioned status to 'completed' (production).
 * - persistence.persisted: false, fallbackRequired: true -> backend
 *   persistence was unavailable (preview sandbox); the generated
 *   summary is still returned and the authenticated client must
 *   complete the conversation via the Firebase Client SDK.
 */
export interface SummarizeApiResponse {
  status?: 'success';
  conversationId: string;
  summary: string;
  persistence?: {
    persisted: boolean;
    fallbackRequired?: boolean;
    reason?: string;
  };
  error?: string;
}
