# Reflectra Firestore Rules — Deployment & Fallback Playbook

> **Purpose:** Keep this file with the project so future Firestore rule changes do not become another “local rules changed but production still denies permissions” incident.

## Project Configuration

Reflectra uses a Firebase project with a **named Firestore database**.

The authoritative deployment configuration is:

- `firebase-applet-config.json`
  - `projectId`
  - `firestoreDatabaseId`
- `firestore.rules`
  - Source of truth for Firestore security rules

### Important

Editing `firestore.rules` locally **does not change the live database rules**.

After any rule change required by a new client-side fallback, the rules must be deployed to the configured Firestore database.

---

# Architecture: Why These Rules Matter

Reflectra normally follows a backend-owned persistence model:

```text
Client
  ↓
Backend API
  ↓
Gemini
  ↓
Firebase Admin SDK
  ↓
Firestore
```

However, the Google AI Studio preview runtime can lack IAM permissions for the backend's Firebase Admin SDK against the named Firestore database.

When that happens:

```text
Gemini succeeds
  ↓
Admin SDK persistence → PERMISSION_DENIED
  ↓
Backend returns generated data + fallbackRequired
  ↓
Authenticated Firebase Client SDK performs a narrowly permitted fallback write
```

Therefore, Firestore rules contain **explicit narrow fallback capabilities**.

These fallbacks exist specifically for preview/runtime infrastructure limitations. Backend persistence remains preferred in production.

---

# Current Security Principles

## 1. Ownership

All user-owned data is scoped by:

```firestore
function isOwner(userId) {
  return request.auth != null && request.auth.uid == userId;
}
```

A user may only access documents beneath their own UID.

---

## 2. Journal Entries

Entries are client-owned raw data.

The client may:

- Create valid entries
- Read own entries
- Update valid entries
- Delete own entries

Validation protects:

- Required fields
- Mood range
- Tags
- Word count
- Crisis flag
- Optional location schema
- Immutable `createdAt`

---

## 3. Conversations

Conversations use a hybrid ownership model.

### Client-owned capabilities

The authenticated owner may:

- Read conversations
- Create an active conversation
- Update legitimate metadata such as title / timestamps
- Delete their own conversation

### Backend-owned lifecycle fields

Normally these fields are controlled by backend persistence:

- `status`
- `summary`
- `summaryUpdatedAt`

Do **not** broadly allow clients to edit these fields.

If preview fallback is required, add only a narrowly constrained state transition.

---

# Fallback Capability A: Assistant Message Persistence

## Why it exists

Normal flow:

```text
User message saved
→ Gemini generates assistant response
→ Backend Admin SDK saves assistant message
```

In AI Studio preview:

```text
Gemini succeeds
→ Admin SDK gets PERMISSION_DENIED
→ Backend returns fallbackRequired
→ Client saves already-generated assistant message
```

## Required message rule

The messages rule intentionally permits the owner to create either a user or assistant message:

```firestore
match /messages/{messageId} {
  allow read: if isOwner(userId);

  allow create: if isOwner(userId)
                && (
                  request.resource.data.role == "user"
                  || request.resource.data.role == "assistant"
                );

  allow update: if false;
  allow delete: if isOwner(userId);
}
```

### Why this is intentionally narrow

It does NOT allow:

- Updating existing messages
- Accessing another user's messages
- Arbitrary conversation lifecycle changes

Messages remain immutable.

---

# Fallback Capability B: Conversation Completion + Summary Persistence

## Why it is needed

The summarization flow is:

```text
End & Save Reflection
  ↓
Backend reads conversation
  ↓
Gemini generates summary
  ↓
Backend Admin SDK updates:
  - summary
  - status = completed
  - summaryUpdatedAt
```

In the AI Studio preview runtime, Admin SDK persistence may fail with:

```text
PERMISSION_DENIED
```

If Gemini already generated the summary successfully, the backend may return:

```json
{
  "status": "success",
  "conversationId": "...",
  "summary": "...",
  "persistence": {
    "persisted": false,
    "fallbackRequired": true,
    "reason": "backend_persistence_unavailable"
  }
}
```

The authenticated client then needs one narrowly permitted completion transition.

---

## Recommended Safe Completion Rule

Do NOT simply remove lifecycle fields from the blocked list.

Instead, permit only:

```text
active → completed
```

with strict constraints.

Recommended rule:

```firestore
allow update: if isOwner(userId)
              && (
                // Normal metadata update
                !request.resource.data
                  .diff(resource.data)
                  .affectedKeys()
                  .hasAny([
                    'status',
                    'summary',
                    'summaryUpdatedAt'
                  ])

                ||

                // Narrow preview fallback:
                // active conversation → completed conversation
                (
                  resource.data.status == "active"
                  && request.resource.data.status == "completed"

                  && request.resource.data.summary is string
                  && request.resource.data.summary.size() >= 10
                  && request.resource.data.summary.size() <= 10000

                  && request.resource.data.summaryUpdatedAt is timestamp

                  && request.resource.data
                    .diff(resource.data)
                    .affectedKeys()
                    .hasOnly([
                      'status',
                      'summary',
                      'summaryUpdatedAt',
                      'updatedAt'
                    ])
                )
              );
```

## Security guarantees

This fallback:

- Requires authentication
- Requires ownership
- Only permits `active → completed`
- Cannot reopen a completed conversation
- Requires a summary string
- Limits summary size
- Restricts modified fields
- Cannot alter unrelated conversation fields

---

# Complete Current Rule Structure

The intended conceptual structure is:

```text
/databases/{database}/documents
│
├── /users/{userId}
│   └── Owner-only root document
│
├── /users/{userId}/entries/{entryId}
│   └── Client-owned validated journal entries
│
├── /users/{userId}/conversations/{conversationId}
│   │
│   ├── Conversation metadata
│   │   ├── Normal client metadata updates
│   │   └── Narrow active → completed fallback
│   │
│   └── /messages/{messageId}
│       ├── User message create
│       ├── Assistant fallback create
│       ├── Immutable after creation
│       └── Owner deletion
│
├── /users/{userId}/insights/{insightId}
│   └── Backend-only writes
│
└── /users/{userId}/limits/{documentId}
    └── Backend-only
```

---

# Deployment Checklist — DO THIS EVERY TIME RULES CHANGE

Whenever `firestore.rules` changes:

### 1. Verify the local rule change

Check that the intended capability is narrow.

Ask:

- Is it owner-scoped?
- Is it a one-way transition?
- Are unrelated fields protected?
- Is the fallback only enabling the exact operation needed?

### 2. Run rule tests

Run the relevant Firestore rules / emulator tests if available.

### 3. Deploy the rules

**This step is mandatory.**

In Google AI Studio, use the platform's Firebase deployment mechanism so rules are deployed using:

- `firebase-applet-config.json`
- configured `projectId`
- configured `firestoreDatabaseId`
- root `firestore.rules`

### 4. Verify the live runtime

Do not assume deployment happened just because:

- the local file changed
- TypeScript compiled
- the frontend built

Actually test the affected operation against the live preview.

---

# Common Failure Pattern

## Symptom

```text
FirebaseError: Missing or insufficient permissions.
```

## First things to check

### Check 1 — Is the local rule actually deployed?

This is the most common issue.

```text
Local firestore.rules = correct
Live Firestore rules = old
```

Result:

```text
Code looks correct
Build passes
Runtime still gets permission-denied
```

### Check 2 — Is the write path identical to the rule path?

Example:

```text
Write:
/users/{uid}/conversations/{conversationId}/messages/{messageId}
```

Must match:

```firestore
match /users/{userId}/conversations/{conversationId}/messages/{messageId}
```

### Check 3 — Does the exact payload satisfy the rule?

Inspect:

- `role`
- changed fields
- timestamps
- state transition
- authenticated UID

### Check 4 — Are you connected to the expected database?

Reflectra uses a named Firestore database.

Confirm `firebase-applet-config.json` matches the runtime database used by:

```ts
getFirestore(app, dbId)
```

---

# AI Studio Preview Runtime Warning

The preview environment may have this limitation:

```text
Backend Admin SDK
↓
Firestore named database
↓
PERMISSION_DENIED (IAM)
```

This does NOT necessarily mean:

- Gemini failed
- Firebase Authentication failed
- Firestore rules are wrong
- the user's credentials are invalid

Always identify **which persistence identity failed**:

| Operation | Identity | Rules Apply? |
|---|---|---|
| Firebase Client SDK | Authenticated user | Yes |
| Firestore REST with user token | Authenticated user | Yes |
| Firebase Admin SDK | Runtime service identity | IAM, normally bypasses rules |

A backend Admin SDK IAM failure and a client Firestore rules failure are different problems.

---

# Recommended Debugging Order

When a Reflectra write fails:

```text
1. Did Gemini generate the content?
        ↓
2. Which persistence layer failed?
        ↓
3. What exact HTTP / Firestore error occurred?
        ↓
4. Did a fallback response get returned?
        ↓
5. Did the client fallback execute?
        ↓
6. Does the live Firestore ruleset permit that exact fallback?
        ↓
7. Were the rules actually deployed?
```

Do not immediately blame Gemini.

---

# API Fallback Contract Convention

For infrastructure-only persistence failures after successful AI generation, use:

```json
{
  "status": "success",
  "persistence": {
    "persisted": false,
    "fallbackRequired": true,
    "reason": "backend_persistence_unavailable"
  }
}
```

The generated AI content must already exist.

## Important

Fallback must **not** trigger for:

- Authentication failures
- Invalid requests
- Rate limits
- Gemini generation failures
- Arbitrary server errors

Only use it when:

```text
AI generation succeeded
AND
persistence infrastructure specifically failed
```

---

# Before Adding Another Client Fallback

Use this decision checklist:

### Is backend persistence failing because of preview infrastructure IAM?

- No → fix the actual backend issue.
- Yes → continue.

### Did the server successfully generate the data?

- No → fail honestly.
- Yes → continue.

### Can the client perform the exact write safely under a narrow Firestore rule?

- No → do not broaden rules casually.
- Yes → create a constrained fallback.

### Does the fallback need a state transition?

If yes:

- enforce previous state
- enforce next state
- validate data type
- bound size
- restrict affected fields
- make irreversible transitions one-way where appropriate

### Have the rules been deployed?

If no:

```text
STOP.
Deploy them before debugging application code further.
```

---

# Golden Rule

> **A local `firestore.rules` change is not a fix until the live Firestore database is enforcing it.**

For Reflectra, always treat a Firestore rules change as a two-part change:

```text
1. Modify firestore.rules
2. Deploy firestore.rules to the configured named database
```

Never consider step 1 alone complete.
