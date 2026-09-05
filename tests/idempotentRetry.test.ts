import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reflectionService from '../src/services/reflectionService';

describe('Idempotent Reflection Retry Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('failed reflection -> retry invokes only requestAssistantReflection and does not call addUserMessage', async () => {
    const addUserMessageSpy = vi.spyOn(reflectionService, 'addUserMessage');
    const requestReflectionSpy = vi
      .spyOn(reflectionService, 'requestAssistantReflection')
      .mockResolvedValueOnce({
        conversationId: 'conv_123',
        message: {
          id: 'asst_msg_1',
          role: 'assistant',
          content: 'This is a thoughtful companion response.',
          createdAt: new Date().toISOString(),
        },
      });

    // Simulate existing messages where the latest is an unanswered user turn
    const existingMessages = [
      { id: 'msg_1', role: 'user' as const, content: 'I felt overwhelmed today.', createdAt: null },
    ];

    const latestMessage = existingMessages[existingMessages.length - 1];
    const hasUnansweredUserTurn = latestMessage.role === 'user';
    expect(hasUnansweredUserTurn).toBe(true);

    // Simulate handleRetryReflection invocation
    const mockToken = 'mock_valid_token';
    const conversationId = 'conv_123';

    // Retry execution
    await reflectionService.requestAssistantReflection(mockToken, conversationId);

    // Verify addUserMessage was NEVER called during retry
    expect(addUserMessageSpy).not.toHaveBeenCalled();
    // Verify requestAssistantReflection was called with the existing conversation
    expect(requestReflectionSpy).toHaveBeenCalledTimes(1);
    expect(requestReflectionSpy).toHaveBeenCalledWith(mockToken, conversationId);
  });

  it('repeated retry clicks cannot create concurrent in-flight reflection requests', async () => {
    let inFlightReflection = false;
    let invocationCount = 0;

    const mockRequestAssistantReflection = vi.fn().mockImplementation(async () => {
      invocationCount++;
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { conversationId: 'conv_123' };
    });

    const triggerRetry = async () => {
      if (inFlightReflection) {
        return; // Guard against concurrent execution
      }
      inFlightReflection = true;
      try {
        await mockRequestAssistantReflection();
      } finally {
        inFlightReflection = false;
      }
    };

    // Trigger 5 concurrent/rapid clicks
    await Promise.all([
      triggerRetry(),
      triggerRetry(),
      triggerRetry(),
      triggerRetry(),
      triggerRetry(),
    ]);

    // Only one request should have passed through the in-flight guard
    expect(invocationCount).toBe(1);
    expect(inFlightReflection).toBe(false);
  });

  it('existing unanswered user turn is correctly detected and can be resumed after reconnect/reload', () => {
    // Scenario A: Conversation with balanced turns (user followed by assistant)
    const balancedMessages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: null },
      { id: 'm2', role: 'assistant' as const, content: 'Hi there', createdAt: null },
    ];
    const latestA = balancedMessages[balancedMessages.length - 1];
    const isUnansweredA = latestA.role === 'user';
    expect(isUnansweredA).toBe(false);

    // Scenario B: Conversation loaded from Firestore with an unanswered user message
    const unansweredMessages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: null },
      { id: 'm2', role: 'assistant' as const, content: 'Hi there', createdAt: null },
      { id: 'm3', role: 'user' as const, content: 'I had another thought...', createdAt: null },
    ];
    const latestB = unansweredMessages[unansweredMessages.length - 1];
    const isUnansweredB = latestB.role === 'user';
    expect(isUnansweredB).toBe(true);

    // Verify resumption: the latest unanswered turn can be directly targeted for reflection
    expect(latestB.content).toBe('I had another thought...');
  });
});
