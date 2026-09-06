import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Focused tests for ISSUE 2 — Conversation/session deletion.
 *
 * Verifies:
 *   - No use of window.confirm in the source.
 *   - The in-app confirmation state machine logic (confirmingDeleteId).
 *   - deleteConversationRest no longer performs brittle GET-404 verification.
 */

describe('Conversation deletion — no window.confirm', () => {
  const conversationListPath = path.join(
    process.cwd(),
    'src',
    'components',
    'reflection',
    'ConversationList.tsx'
  );

  it('ConversationList.tsx does not call window.confirm', () => {
    const source = fs.readFileSync(conversationListPath, 'utf8');
    // There must be NO actual invocation of window.confirm(...) — the
    // only mention is a comment explaining why it was removed.
    expect(source).not.toContain('window.confirm(');
    expect(source).not.toMatch(/window\.confirm\s*\(/);
  });

  it('ConversationList implements an in-app confirmation via confirmingDeleteId state', () => {
    const source = fs.readFileSync(conversationListPath, 'utf8');
    // The confirmation is driven by state, not a native browser dialog.
    expect(source).toContain('confirmingDeleteId');
    expect(source).toContain('setConfirmingDeleteId');
    // Confirm + Cancel buttons are rendered inline.
    expect(source).toContain('Confirm');
    expect(source).toContain('Cancel');
    // Keyboard accessible via aria-labels.
    expect(source).toContain('aria-label');
  });

  it('no other reflection component uses window.confirm', () => {
    const reflectionDir = path.join(process.cwd(), 'src', 'components', 'reflection');
    const files = fs.readdirSync(reflectionDir).filter((f) => f.endsWith('.tsx'));
    for (const f of files) {
      const source = fs.readFileSync(path.join(reflectionDir, f), 'utf8');
      // No actual invocation anywhere in the reflection components.
      expect(source).not.toMatch(/window\.confirm\s*\(/);
    }
  });
});

describe('Conversation deletion — deleteConversationRest', () => {
  const restServicePath = path.join(
    process.cwd(),
    'server',
    'services',
    'firestoreRestService.ts'
  );

  it('does NOT perform an immediate post-delete GET verification', () => {
    const source = fs.readFileSync(restServicePath, 'utf8');
    // The brittle verification step (GET immediately after DELETE and
    // requiring 404) must be removed.
    expect(source).not.toContain('postDeleteCheckStatus');
    expect(source).not.toContain('verifiedDeleted');
    expect(source).not.toContain('delete_firestore_verified');
  });

  it('treats DELETE 200 or 404 as authoritative (no false-negative on propagation timing)', () => {
    const source = fs.readFileSync(restServicePath, 'utf8');
    // The function should accept 404 (already gone) as a success.
    expect(source).toMatch(/if \(!parentRes\.ok && parentRes\.status !== 404\)/);
    // Extract the deleteConversationRest function body and confirm it
    // performs no GET request for verification after the DELETE.
    const fnStart = source.indexOf('export async function deleteConversationRest');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart);
    // The next function definition after deleteConversationRest.
    const nextFn = fnBody.search(/\nexport async function\s+\w+/);
    const endIdx = nextFn > -1 ? nextFn : fnBody.length;
    const fnSource = fnBody.slice(0, endIdx);
    // No GET verification inside deleteConversationRest.
    expect(fnSource).not.toContain("method: 'GET'");
    expect(fnSource).not.toContain('method: "GET"');
    // Only one fetch on convUrl (the DELETE itself), which returns 200/404.
    expect(fnSource).toContain("method: 'DELETE'");
  });

  it('returns only the essential deletion diagnostics (no verify fields)', () => {
    const source = fs.readFileSync(restServicePath, 'utf8');
    // The return type no longer includes the removed verification fields.
    expect(source).toContain('messagesFound');
    expect(source).toContain('messagesDeleted');
    expect(source).toContain('parentDeleteStatus');
    expect(source).toContain('parentDeleteBody');
    expect(source).not.toContain('postDeleteCheckStatus');
    expect(source).not.toContain('verifiedDeleted');
  });
});

describe('Conversation deletion — client feedback and state handling', () => {
  const dashboardPath = path.join(
    process.cwd(),
    'src',
    'components',
    'reflection',
    'GuidedReflectionDashboard.tsx'
  );

  const listPath = path.join(
    process.cwd(),
    'src',
    'components',
    'reflection',
    'ConversationList.tsx'
  );

  it('failed deletion keeps the conversation visible and reports honest error', () => {
    const listSource = fs.readFileSync(listPath, 'utf8');
    // On delete error, the catch block sets deleteError (honest failure).
    expect(listSource).toContain('setDeleteError');
    expect(listSource).toContain('err?.message');
    expect(listSource).toContain('Failed to delete reflection session. Please try again.');
    // The conversation is NOT removed on failure (only removed after successful onDelete).
    expect(listSource).toMatch(/await onDeleteConversation\(id\)/);
  });

  it('successful deletion removes conversation from UI state', () => {
    const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');
    // After a successful authenticated DELETE, the conversation is
    // removed from React state and the active id is reconciled.
    expect(dashboardSource).toMatch(/prev\.filter\(\(c\) => c\.id !== id\)/);
    expect(dashboardSource).toContain('removedId');
    // State is updated only AFTER the backend delete resolves (await).
    expect(dashboardSource).toMatch(/const res = await deleteConversation\(token, id\);/);
  });

  it('confirmation state enters on first delete click and cancels restore normal state', () => {
    const listSource = fs.readFileSync(listPath, 'utf8');
    // First trash click enters confirmation state (setConfirmingDeleteId).
    expect(listSource).toContain('setConfirmingDeleteId(id)');
    // Cancel restores normal state.
    expect(listSource).toContain('setConfirmingDeleteId(null)');
    // Confirm invokes the actual deletion.
    expect(listSource).toContain('onDeleteConversation(id)');
  });
});
