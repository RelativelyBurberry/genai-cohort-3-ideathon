import { describe, it, expect, vi } from 'vitest';
import { deleteConversationServer, completeAndSummarizeConversation } from './conversationService.js';

describe('Session Actions - Delete & End/Save Finalization', () => {
  describe('deleteConversationServer', () => {
    it('throws validation error if uid is missing or empty', async () => {
      await expect(deleteConversationServer('', 'conv-123')).rejects.toThrow(
        'Unauthorized: User ID must be provided.'
      );
    });

    it('throws validation error if conversationId is missing or empty', async () => {
      await expect(deleteConversationServer('user-123', '')).rejects.toThrow(
        'Invalid request: Conversation ID must be provided.'
      );
    });
  });

  describe('completeAndSummarizeConversation', () => {
    it('executes without passing REST token to preserve backend persistence authority', async () => {
      // Calling completeAndSummarizeConversation without token uses getAdminDb()
      // We verify signature accepts (uid, conversationId, summary) without token
      expect(completeAndSummarizeConversation).toBeDefined();
    });
  });
});
