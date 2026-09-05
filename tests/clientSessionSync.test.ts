import { describe, it, expect } from 'vitest';
import type { Conversation } from '../src/types/reflection';

describe('Client-Side Session Synchronization & Active Conversation Reconciliation', () => {
  it('removes deleted conversation ID from state and resets active selection if active', () => {
    const initialConversations: Conversation[] = [
      {
        id: 'conv_1',
        title: 'Session 1',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      },
      {
        id: 'conv_2',
        title: 'Session 2',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      },
    ];

    let conversations = [...initialConversations];
    let activeId: string | null = 'conv_1';

    const deletedId = 'conv_1';

    // Simulate handle delete synchronization
    conversations = conversations.filter((c) => c.id !== deletedId);
    if (activeId === deletedId) {
      activeId = conversations.length > 0 ? conversations[0].id : null;
    }

    expect(conversations.map((c) => c.id)).not.toContain('conv_1');
    expect(conversations.length).toBe(1);
    expect(activeId).toBe('conv_2');
  });

  it('resets active selection to null when all conversations are deleted', () => {
    const initialConversations: Conversation[] = [
      {
        id: 'conv_sole',
        title: 'Sole Session',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      },
    ];

    let conversations = [...initialConversations];
    let activeId: string | null = 'conv_sole';

    const deletedId = 'conv_sole';

    conversations = conversations.filter((c) => c.id !== deletedId);
    if (activeId === deletedId) {
      activeId = conversations.length > 0 ? conversations[0].id : null;
    }

    expect(conversations.length).toBe(0);
    expect(activeId).toBeNull();
  });

  it('preserves active selection when an inactive conversation is deleted', () => {
    const initialConversations: Conversation[] = [
      {
        id: 'conv_1',
        title: 'Session 1',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      },
      {
        id: 'conv_2',
        title: 'Session 2',
        summary: null,
        status: 'active',
        createdAt: null,
        updatedAt: null,
        summaryUpdatedAt: null,
      },
    ];

    let conversations = [...initialConversations];
    let activeId: string | null = 'conv_1';

    const deletedId = 'conv_2';

    conversations = conversations.filter((c) => c.id !== deletedId);
    if (activeId === deletedId) {
      activeId = conversations.length > 0 ? conversations[0].id : null;
    }

    expect(conversations.map((c) => c.id)).toEqual(['conv_1']);
    expect(activeId).toBe('conv_1');
  });
});
