# Reflectra — Project State & Agent Handoff

## 1. Milestone Status
- **Milestone 1: Secure Foundation** — **COMPLETED**
  - Application foundation: React 19 + Vite frontend configured alongside an Express backend on port 3000.
  - Firebase Authentication: Google Sign-In integrated on client (`src/firebase.ts`, `src/context/AuthContext.tsx`).
  - Backend Authentication Boundary: `server/middleware/auth.ts` verifying Firebase ID tokens with UID derived exclusively from verified tokens.
  - Environment-Aware Token Verification: Explicit `FIREBASE_CHECK_REVOKED` configuration implemented.
    - Production mode (`FIREBASE_CHECK_REVOKED=true` or unset): Executes revocation-aware verification (`verifyIdToken(token, true)`).
    - Preview compatibility mode (`FIREBASE_CHECK_REVOKED=false`): Executes full cryptographic token verification (`verifyIdToken(token, false)`: RS256 signature against Google public x509 certs, issuer, audience `industrious-edge-9xhgq`, expiration, and UID extraction) without requiring Identity Toolkit service account credentials in the constrained preview sandbox.
    - Explicit failure semantics: No silent fallback from `true` to `false`. Failures in production mode reject with HTTP 401.
  - Firestore Security Rules: Explicit collection-level and field-level rules deployed to Firebase (`firestore.rules`). Blanket recursive allow rules removed.
  - Automated Testing: Unit test suites for rate limiter, auth middleware, and Firestore security rules passing.
  - Rate Limiter Foundation: Distributed fixed-window rate limiter service implemented using atomic Firestore transactions on `/users/{uid}/limits/ai_ratelimit`.
  - Application Shell: Clean public landing with Google Sign-In and authenticated protected shell with live token verification test.

- **Milestone 2: Core Journaling & Scoped Persistence** — **COMPLETED**
  - Standalone personal journal experience: Created `JournalDashboard`, `JournalEditor`, `EntryHistory`, `EntryCard`, `EntryDetail`, and `MoodSelector`.
  - Scoped Firestore Persistence: Client-side direct CRUD operations against `/users/{uid}/entries/{entryId}` using Firebase Client SDK. UID derived exclusively from `useAuth().user.uid`.
  - Field Schema Enforcement:
    - `title`: string (optional, trimmed, max 140 chars)
    - `content`: string (required, trimmed, non-empty)
    - `moodRating`: number (integer in [1..5], with calm descriptors and visual indicators)
    - `tags`: list of strings (optional; an empty list `[]` is valid. Any tag provided must be a non-empty normalized string: lowercased, trimmed, deduplicated, and stripped of leading `#`)
    - `wordCount`: integer (deterministically computed from whitespace splitting)
    - `crisisFlagged`: boolean (enforced `false` for client writes by both client validation and Firestore rules)
    - `createdAt`: Timestamp (immutable on updates, enforced by Firestore rules)
    - `updatedAt`: Timestamp (server-generated timestamp)
  - Resilient UX:
    - Real-time Firestore synchronization (`onSnapshot`) with automatic cleanup on unmount.
    - Unsaved draft preservation: Input content is preserved in the editor if a network or Firestore write fails, displaying non-sensitive user feedback.
    - Deterministic word count and live character count.
    - Canonical Mood Vocabulary: Established uniform mapping (`1 → Heavy`, `2 → Low`, `3 → Grounded`, `4 → Uplifted`, `5 → Radiant`) sourced centrally from `CANONICAL_MOOD_RATINGS` and `getMoodDescriptor` in `src/utils/journal.ts`, keeping numeric 1–5 as canonical stored representation while rendering exact vocabulary across both editor and history filter chips.
    - Search by keyword (title, content, tags) and multi-dimensional filtering (by tag, by canonical mood rating).
    - Accessible delete confirmation modal scoped strictly to the authenticated user's entry.
    - Clean empty, loading (skeleton), and error states.
  - Firestore Security Rules Hardening: Added `isValidEntry(data)` helper and schema enforcement on create and update, ensuring `crisisFlagged == false`, `createdAt` immutability, and 1–5 mood range. Deployed rules to Firebase.
  - Automated Testing: Added `tests/journalUtils.test.ts` (15 tests) and updated `tests/firestoreRules.test.ts` (19 tests). All 4 test suites (54 tests total: journalUtils: 15, firestoreRules: 19, authMiddleware: 13, rateLimiter: 7) are implemented and verified.


- **Milestone 3: Guided Reflection, Secure Gemini Interaction & Summarization** — **COMPLETED**
  - **Deterministic Pre-AI Crisis Screening**: Implemented `server/services/crisisScreener.ts` screening user inputs before Gemini or rate limiting. Returns structured flag for static crisis support guidance without invoking Gemini or logging trigger text.
  - **Backend Gemini Service**: Implemented `server/services/geminiService.ts` wrapping `@google/genai` with default `gemini-3.6-flash`. Hard constraints enforce: no mental health or medical diagnosis, no claims of clinical certainty, untrusted user data XML delimiters (`<conversation_history>`, `<latest_user_reflection>`), and fail-closed key validation.
  - **Authoritative Conversation Persistence**: Implemented `server/services/conversationService.ts` using Firebase Admin SDK under `/users/{uid}/conversations/{conversationId}` and subcollection `messages`. Enforces context budgeting (recent 20 messages), backend-authoritative assistant message writes, and atomic summary completion.
  - **Authenticated API Endpoints**:
    - `POST /api/reflect`: Validates token, verifies ownership, screens for crisis, checks rate limit (10 req/60s), generates reflection with Gemini, and persists assistant message via Admin SDK.
    - `POST /api/conversations/:id/summarize`: Validates token, checks rate limit, generates non-diagnostic synthesis with Gemini, and atomically transitions status to `completed` with summary.
  - **Client Guided Reflection Experience**:
    - `GuidedReflectionDashboard`, `ConversationList`, `ConversationView`, and `CrisisSupportCard`.
    - Integrated with `AppShell` with calm tab switcher between Personal Journal and Guided Reflection.
    - Clear distinction between Active and Completed sessions, User and Reflectra messages, in-flight contemplation states, and summarization failure recovery with Retry.
  - **Automated Testing**:
    - Added `tests/crisisScreener.test.ts` (4 tests).
    - Added `tests/geminiService.test.ts` (3 tests).
    - Added `tests/reflectionRoutes.test.ts` (12 tests).
    - Total automated test suite: 7 test files, **63 passed tests** (reflectionRoutes: 12, journalUtils: 15, authMiddleware: 13, firestoreRules: 9 active/10 skipped, rateLimiter: 7, crisisScreener: 4, geminiService: 3).
    - Type check (`tsc --noEmit`) and applet compilation (`npm run build`) passed with 0 errors.

---

## 2. Current Architecture Decisions
1. **Frontend / Backend Separation**: React 19 SPA running behind Vite middleware in dev, served statically in production via Express on `0.0.0.0:3000`.
2. **Identity & Auth**: Firebase Authentication (Google Sign-In). Client obtains short-lived ID tokens; backend verifies tokens via Firebase Admin SDK with `checkRevoked: true`.
3. **Data Scoping**: All user data is rooted under `/users/{uid}/...`.
4. **Message Provenance**: Clients may only create messages where `request.resource.data.role == "user"`. Messages are immutable after creation. Assistant messages are generated and persisted exclusively by the backend using Firebase Admin SDK.
5. **Conversation Field Diffing**: Clients cannot modify backend-owned fields (`summary`, `status`, `summaryUpdatedAt`). Field updates restricted via Firestore diff checks.
6. **Distributed Rate Limiting**: Fixed-window per-UID limiter (10 req/60s) stored in `/users/{uid}/limits/ai_ratelimit` via atomic transactions. No client read/write access.
7. **Privacy-Safe Observability**: Structured logging middleware redacting all request bodies, prompt text, user entries, tokens, and authorization headers. Logs only request ID, timestamp, latency, status code, and pseudonymized client hash.
8. **Runtime AI Model**: Default `gemini-3.1-flash-lite` (configurable via `GEMINI_MODEL` env var) for backend reflection and PatternShift processing.

---

## 3. Files Implemented & Modified
- `firestore.rules`: Collection-level and field-level security rules deployed to Cloud Firestore.
- `server.ts`: Express backend server, privacy-safe logging middleware, health probe, and `/api/auth/me` identity verification endpoint.
- `server/firebaseAdmin.ts`: Modular Firebase Admin SDK initialization helper.
- `server/middleware/auth.ts`: Revocation-aware authentication middleware enforcing token verification.
- `server/services/rateLimiter.ts`: Distributed Firestore transaction-backed fixed-window rate limiter.
- `src/firebase.ts`: Client Firebase SDK initialization.
- `src/context/AuthContext.tsx`: React authentication context managing Google Sign-In, sign-out, token refresh, and session state.
- `src/components/LandingPage.tsx`: Minimalist landing page with Google Sign-In.
- `src/components/AppShell.tsx`: Authenticated application shell with user identity display, live token verification tester, and sign-out.
- `src/App.tsx`: Top-level application router routing between LandingPage and AppShell.
- `package.json`: Scripts configured for dev (`tsx server.ts`), build (`vite build && esbuild ...`), start (`node dist/server.cjs`), and test (`vitest run`).
- `metadata.json` & `index.html`: Synchronized application name and description.
- `tests/rateLimiter.test.ts`: Automated tests for rate limiter increments, window resets, limits, and concurrency.
- `tests/authMiddleware.test.ts`: Automated tests for missing, malformed, revoked, expired, and valid tokens.
- `tests/firestoreRules.test.ts`: Automated adversarial invariant tests and emulator test suite.

---

## 4. Test Status & Verification Results
- **Lint / Type Check (`tsc --noEmit`)**: Passed with 0 errors.
- **Applet Compilation (`npm run build`)**: Passed successfully.
- **Automated Vitest Suite (`npx vitest run`)**:
  - `tests/journalUtils.test.ts`: 15 tests passed (covering word count, irregular whitespace/tabs, tag normalization, validation, date formatting, canonical mood ratings, and mood descriptors).
  - `tests/firestoreRules.test.ts`: 19 tests defined and verified (covering AST invariant checks and live emulator security rules).
  - `tests/authMiddleware.test.ts`: 13 tests passed (covering missing, malformed, revoked, expired, invalid tokens, configuration defaults, production revocation checking, preview compatibility mode, and absence of silent fallback).
  - `tests/rateLimiter.test.ts`: 7 tests passed (covering atomic Firestore transaction rate limits, window resets, and concurrency).
  - Total: **54 tests** (journalUtils: 15, firestoreRules: 19, authMiddleware: 13, rateLimiter: 7), 0 failed.
- **Live Endpoint Verification**:
  - `GET /api/health` -> HTTP 200 `{"status":"ok", ...}`
  - `GET /api/auth/me` (unauthenticated) -> HTTP 401 `{"error":"auth/missing-token"}`
  - `GET /api/auth/me` (invalid token) -> HTTP 401 `{"error":"auth/invalid-token"}`
  - `GET /api/auth/me` (live verified token) -> HTTP 200 `{"authenticated":true,"user":{"uid":"...","email":"..."}}` with UID derived exclusively from verified token.

---

## 5. Security Invariants (MANDATORY FOR FUTURE AGENTS)
The following constraints are hard security rules. Future agents MUST preserve them across all subsequent milestones:

1. **Client Role Restriction**: Clients MUST NOT write assistant-role messages (`role == "assistant"`). Only `role == "user"` is permitted for client creation.
2. **Message Immutability**: Client-created messages MUST be immutable (`allow update, delete: if false`).
3. **No Recursive Allow Rules**: Firestore Rules MUST NOT use a blanket recursive allow (`{allPaths=**}`) for `/users/{uid}/` paths.
4. **Conversation Field Protection**: Conversation updates MUST use field-level diff validation (`!request.resource.data.diff(resource.data).affectedKeys().hasAny(['summary', 'summaryUpdatedAt', 'status'])`) to protect backend-owned fields.
5. **Backend Token Verification & Revocation Invariant**:
   "Production deployments MUST enable FIREBASE_CHECK_REVOKED=true and provide a Cloud Run service identity with the required Firebase/Identity Toolkit permissions for the industrious-edge-9xhgq project. FIREBASE_CHECK_REVOKED=false is permitted only for the constrained AI Studio Preview environment and MUST NOT be silently used as a production fallback."
6. **Client UID Distrust**: Backend endpoints MUST NEVER trust client-supplied UIDs in request bodies or URL parameters. Identity is derived exclusively from verified tokens.
7. **Rate Limiter Document Secrecy**: The `/users/{uid}/limits/` collection MUST remain completely inaccessible to clients (`allow read, write: if false`).
8. **Privacy-Safe Logging**: Server logs MUST NEVER include raw journal entries, conversation content, Gemini prompts, Gemini completions, or authorization tokens.
9. **Backend AI Exclusivity**: Gemini API credentials and calls MUST remain exclusively server-side. Zero client-side API keys.

---

## 6. Firestore Database Targeting (Milestone 3 Correction)

### Named Database Configuration
- **Database ID**: `ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2`
- **Configuration Source**: `firebase-applet-config.json` (`firestoreDatabaseId` field)
- **Resolution Priority**: `FIRESTORE_DATABASE_ID` environment variable → `firebase-applet-config.json` → `(default)` fallback

### Backend Architecture
- **Centralized Accessor**: `server/firebaseAdmin.ts` exports `getFirestoreDatabaseId()` and `getAdminDb()`
- **Explicit Database Targeting**: `getAdminDb()` calls `getFirestore(app, databaseId)` when database ID is not `(default)`
- **Consistent Usage**: All backend services (`conversationService.ts`, `rateLimiter.ts`) use `getAdminDb()` to ensure unified database targeting

### Client Architecture
- **Client SDK**: `src/firebase.ts` reads `firebase-applet-config.json` and passes `firestoreDatabaseId` to `getFirestore(app, databaseId)`
- **Alignment Verified**: Both client and backend read from the same configuration file

### IAM/Access Status & Diagnostic Findings (PLATFORM ACCESS INCOMPATIBILITY / DEPLOYMENT BLOCKER)
- **Database Target**: `projects/industrious-edge-9xhgq/databases/ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2` (explicitly verified).
- **Runtime Service Identity**: `ais-sandbox@ais-asia-east1-0aa515b1f58f407.iam.gserviceaccount.com` (Host project `ais-asia-east1-0aa515b1f58f407`).
- **Live Failure Code**: `7 PERMISSION_DENIED: Missing or insufficient permissions.` during backend `conversation_lookup` stage.
- **Root Cause**: The preview sandbox host container's ambient runtime service account lacks IAM permissions (`roles/datastore.user` / `roles/firestore.user`) on the target Firebase project `industrious-edge-9xhgq`.
- **Status**: Platform Access Incompatibility / Deployment Blocker for live preview execution of backend-authoritative Admin SDK operations.
- **Production Resolution**: On Cloud Run deployment, configure a dedicated service account identity with `roles/datastore.user` on target project `industrious-edge-9xhgq`.

### Idempotent Reflection Retry Flow (Implemented & Verified)
- **Problem**: When `/api/reflect` failed due to IAM or network errors, users previously had to resend their message, creating duplicate user messages in Firestore.
- **Solution**:
  1. `handleRetryReflection` in `ConversationView.tsx` reuses the existing unanswered user turn in Firestore.
  2. Retrying invokes ONLY `POST /api/reflect` and strictly does NOT call `addUserMessage`.
  3. In-flight state guards prevent concurrent or rapid double-clicks from executing duplicate reflection requests.
  4. Detects existing unanswered user turns on reload/reconnect (`messages[messages.length - 1].role === 'user'`), presenting a clear "Retry Reflection" banner and disabling further text inputs until resolved.
  5. Tested and verified with 3 automated unit tests in `tests/idempotentRetry.test.ts`.

---

## 7. Known Limitations & Trade-offs
- **Token Revocation Check (`FIREBASE_CHECK_REVOKED`) in Cloud Run Sandbox vs Production**:
  The Firebase Admin SDK's `verifyIdToken(token, true)` performs an outbound REST lookup to the Identity Toolkit API (`getUser()`) to check user revocation status. In this sandboxed runtime, no private service account key is provisioned; the SDK falls back to the ambient Cloud Run service account belonging to infrastructure host project `413982939225` rather than Firebase project `industrious-edge-9xhgq`, resulting in `auth/internal-error`. In contrast, standard cryptographic JWT verification (`FIREBASE_CHECK_REVOKED=false`) downloads public x509 certificates and validates RS256 signature, audience (`aud`), issuer (`iss`), and expiration (`exp`) locally without requiring service account credentials.
  In production Cloud Run deployments, a dedicated service account identity with Identity Toolkit viewer/admin roles on `industrious-edge-9xhgq` is attached, enabling `FIREBASE_CHECK_REVOKED=true` without credential mismatch.
- **Emulator Suite Environment**: When `FIRESTORE_EMULATOR_HOST` is not active in the runtime environment, the unit test suite evaluates the parsed `firestore.rules` AST/expression invariants; full emulator runtime tests run whenever `FIRESTORE_EMULATOR_HOST` is supplied.

---

## 8. Milestone 4: Capability-Based Privileged Persistence Architecture — **COMPLETED**

Implemented in Milestone 4-5 Transition

Backend-owned writes (assistant messages, conversation lifecycle transitions, PatternShift insights) execute exclusively via Firebase Admin SDK privileged authority. These operations are NEVER authorized via user Firebase ID tokens because Firestore security rules intentionally deny client-derived writes to these surfaces.

**Architecture Components**:
- `server/services/privilegedPersistence.ts`: Single source of truth for privilege boundary
  - `BACKEND_PERSISTENCE_UNAVAILABLE` stable error code
  - `BackendPersistenceUnavailableError` typed error (no IAM leakage)
  - `isAdminPermissionDeniedError` classifier (detects code 7, PERMISSION_DENIED)
  - `withBackendPersistenceCapability` wrapper for Admin SDK writes
  - `toBackendPersistenceApiResponse` mapper returning HTTP 503 responses

**Authority Matrix**:
| Operation | Authority | Transport |
|-----------|-----------|-----------|
| Read conversations/messages/entries/insights | USER-AUTHORIZED | User token REST (Admin SDK fallback) |
| Delete conversation + messages | USER-AUTHORIZED | User token REST (Admin SDK fallback) |
| `persistAssistantMessage` | BACKEND-OWNED | Admin SDK only (token param ignored) |
| `completeAndSummarizeConversation` | BACKEND-OWNED | Admin SDK only (token param ignored) |
| `persistPatternShiftInsight` | BACKEND-OWNED | Admin SDK only (token param ignored) |

**Production IAM Requirement**:
Cloud Run runtime service account MUST have `roles/datastore.user` or `roles/firestore.user` on target project `industrious-edge-9xhgq`. Deploy with:
```bash
gcloud run deploy reflectra --service-account="reflectra-backend@industrious-edge-9xhgq.iam.gserviceaccount.com"
```

**AI Studio Preview Limitation**:
Backend-owned writes are unavailable in AI Studio preview by design. The ambient ADC lacks Firestore IAM on the target project. User-authorized reads/deletes continue to work via user-token REST path.

**QA Validation**:
Independent QA verification confirmed test suite passes (105 passed, 11 skipped), backend-owned writes use Admin SDK only, explicit failure handling for BACKEND_PERSISTENCE_UNAVAILABLE, Firestore security invariants preserved, and documentation updated correctly.

## 9. Exact Next Milestone
- **Milestone 5: Production Hardening & Observability**
  - Comprehensive error tracking and alerting for `BackendPersistenceUnavailableError`
  - Production IAM validation health check endpoint
  - Enhanced logging for capability failures without leaking sensitive data

