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

export interface ReflectApiResponse {
  conversationId: string;
  message?: {
    id: string;
    role: 'assistant';
    content: string;
    createdAt: string;
  };
  crisisSupportRequired?: boolean;
  assistantMessage?: null;
  error?: string;
}

export interface SummarizeApiResponse {
  conversationId: string;
  summary: string;
  status: 'completed';
  error?: string;
}
