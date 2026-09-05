import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Firestore Security Rules Static Analysis & Invariant Verification', () => {
  let rulesContent: string;

  beforeAll(() => {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);
    rulesContent = fs.readFileSync(rulesPath, 'utf8');
  });

  it('prohibits any blanket recursive wildcard allow rules under /users/{userId}', () => {
    // Invariant: No match /users/{userId}/{allPaths=**} { allow read, write: if ... }
    expect(rulesContent).not.toMatch(/match\s*\/users\/\{userId\}\/\{allPaths=\*\*\}/);
    expect(rulesContent).not.toMatch(/match\s*\/users\/\{uid\}\/\{allPaths=\*\*\}/);
  });

  it('enforces isOwner helper checking request.auth != null && request.auth.uid == userId', () => {
    expect(rulesContent).toContain('function isOwner(userId)');
    expect(rulesContent).toContain('request.auth != null && request.auth.uid == userId');
  });

  it('scopes entries collection strictly to isOwner with schema validation', () => {
    const entriesMatch = rulesContent.includes('match /users/{userId}/entries/{entryId}');
    expect(entriesMatch).toBe(true);
    expect(rulesContent).toContain('allow read, delete: if isOwner(userId);');
    expect(rulesContent).toContain('isValidEntry(request.resource.data)');
    expect(rulesContent).toContain('request.resource.data.createdAt is timestamp');
    expect(rulesContent).toContain('request.resource.data.updatedAt is timestamp');
    expect(rulesContent).toContain('data.moodRating >= 1 && data.moodRating <= 5');
    expect(rulesContent).toContain('data.crisisFlagged == false');
    expect(rulesContent).toContain('request.resource.data.createdAt == resource.data.createdAt');
  });

  it('strictly enforces message role provenance: clients may only create role == "user" with no serverAuth backdoor', () => {
    expect(rulesContent).toContain('match /messages/{messageId}');
    expect(rulesContent).toMatch(/request\.resource\.data\.role\s*==\s*["']user["']/);
    // Disallows assistant messages from client and forbids any serverAuth workaround
    expect(rulesContent).not.toMatch(/role\s*==\s*["']assistant["']/);
    expect(rulesContent).not.toContain('serverAuth');
  });

  it('strictly enforces message update immutability while allowing owner deletion for cascade', () => {
    expect(rulesContent).toContain('match /messages/{messageId}');
    expect(rulesContent).toContain('allow update: if false;');
    expect(rulesContent).toContain('allow delete: if isOwner(userId);');
  });

  it('enforces field-level protection on conversation updates prohibiting status, summary, and summaryUpdatedAt tampering', () => {
    expect(rulesContent).toContain('match /users/{userId}/conversations/{conversationId}');
    expect(rulesContent).toContain('allow update: if isOwner(userId)');
    expect(rulesContent).toContain('!request.resource.data.diff(resource.data).affectedKeys().hasAny');
    expect(rulesContent).toContain("'status'");
    expect(rulesContent).toContain("'summary'");
    expect(rulesContent).toContain("'summaryUpdatedAt'");
  });

  it('locks backend-only rate limit documents: allow read, write: if false', () => {
    expect(rulesContent).toContain('match /users/{userId}/limits/{documentId}');
    expect(rulesContent).toMatch(
      /match\s*\/users\/\{userId\}\/limits\/\{documentId\}\s*\{\s*allow read, write:\s*if false;/
    );
  });

  it('restricts PatternShift insights: read-only for owner, write denied', () => {
    expect(rulesContent).toContain('match /users/{userId}/insights/{insightId}');
    expect(rulesContent).toMatch(
      /match\s*\/users\/\{userId\}\/insights\/\{insightId\}\s*\{\s*allow read:\s*if isOwner\(userId\);\s*allow write:\s*if false;/
    );
  });

  it('enforces default deny for all unspecified paths: match /{document=**}', () => {
    expect(rulesContent).toMatch(
      /match\s*\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/
    );
  });
});

// Emulator adversarial suite if emulator is active
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
describe.runIf(!!emulatorHost)('Firestore Security Rules Emulator Integration Suite', () => {
  let testEnv: any;

  beforeAll(async () => {
    const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
    testEnv = await initializeTestEnvironment({
      projectId: 'reflectra-rules-test',
      firestore: {
        rules: fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8'),
        host: emulatorHost?.split(':')[0] || 'localhost',
        port: parseInt(emulatorHost?.split(':')[1] || '8080', 10),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('rejects unauthenticated read access to user entries', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const docRef = unauthedDb.collection('users').doc('userA').collection('entries').doc('e1');
    await assertFails(docRef.get());
  });

  it('allows User A to read and write their own entries', async () => {
    const { assertSucceeds } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const docRef = userADb.collection('users').doc('userA').collection('entries').doc('e1');
    await assertSucceeds(docRef.set({
      title: 'My Entry',
      content: 'Today was reflective',
      moodRating: 4,
      tags: ['reflection', 'calm'],
      wordCount: 3,
      crisisFlagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await assertSucceeds(docRef.get());
  });

  it('rejects entries with invalid schema or crisisFlagged set to true', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const docRef = userADb.collection('users').doc('userA').collection('entries').doc('e2');
    await assertFails(docRef.set({
      title: 'Tampered Entry',
      content: 'Attempting exploit',
      moodRating: 10, // invalid mood
      tags: [],
      wordCount: 2,
      crisisFlagged: true, // client cannot set true
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('prevents User A from reading or writing User B entries', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const userBDoc = userADb.collection('users').doc('userB').collection('entries').doc('e1');
    await assertFails(userBDoc.get());
    await assertFails(userBDoc.set({ title: 'Hacked', content: 'Exploit' }));
  });

  it('forbids client from writing to rate limit document', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const limitDoc = userADb.collection('users').doc('userA').collection('limits').doc('ai_ratelimit');
    await assertFails(limitDoc.get());
    await assertFails(limitDoc.set({ count: 0 }));
  });

  it('forbids client from creating an assistant-role message', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const msgDoc = userADb.collection('users').doc('userA').collection('conversations').doc('c1').collection('messages').doc('m1');
    await assertFails(msgDoc.set({ role: 'assistant', content: 'Forged assistant message' }));
  });

  it('forbids client from creating an assistant-role message even with serverAuth field attached', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const msgDoc = userADb.collection('users').doc('userA').collection('conversations').doc('c1').collection('messages').doc('m_bypass');
    await assertFails(msgDoc.set({
      role: 'assistant',
      content: 'Attempted backdoor exploit',
      serverAuth: 'REFLECTRA_SERVER_AUTH_SECRET_v1',
    }));
  });

  it('allows client to create a user-role message', async () => {
    const { assertSucceeds } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const msgDoc = userADb.collection('users').doc('userA').collection('conversations').doc('c1').collection('messages').doc('m2');
    await assertSucceeds(msgDoc.set({ role: 'user', content: 'User reflection' }));
  });

  it('forbids client from modifying existing messages (immutability)', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const msgDoc = userADb.collection('users').doc('userA').collection('conversations').doc('c1').collection('messages').doc('m2');
    await assertFails(msgDoc.update({ content: 'Modified' }));
  });

  it('forbids client from modifying conversation backend-owned fields (status, summary, summaryUpdatedAt)', async () => {
    const { assertSucceeds, assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const convDoc = userADb.collection('users').doc('userA').collection('conversations').doc('c1');

    // Initial creation with active status and no summary
    await assertSucceeds(convDoc.set({
      title: 'My Reflection',
      status: 'active',
      summary: null,
      summaryUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Tampering with summary should fail
    await assertFails(convDoc.update({ summary: 'Client forged summary' }));

    // Tampering with status should fail
    await assertFails(convDoc.update({ status: 'completed' }));

    // Tampering with summaryUpdatedAt should fail
    await assertFails(convDoc.update({ summaryUpdatedAt: new Date() }));

    // Updating legitimate client-owned metadata (title, updatedAt) should succeed
    await assertSucceeds(convDoc.update({
      title: 'Updated Reflection Title',
      updatedAt: new Date(),
    }));
  });

  it('forbids client from writing or deleting insights', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const userADb = testEnv.authenticatedContext('userA').firestore();
    const insightDoc = userADb.collection('users').doc('userA').collection('insights').doc('ins1');
    await assertFails(insightDoc.set({ narrativeSynthesis: 'Fake insight' }));
    await assertFails(insightDoc.delete());
  });
});
