# Reflectra

> Production-grade, privacy-first personal reflection and journaling application with AI-powered insight synthesis.

<!-- Challenge Verification Label -->
`dev-tutorial=cloud-run-ai-challenge`

---

## 1. Application Architecture

Reflectra follows a strict decoupled full-stack architecture:

- **Frontend**: React 19 Single Page Application (Vite, Tailwind CSS, Lucide icons, Motion).
- **Backend**: Express API server running on port 3000 (`0.0.0.0:3000`).
  - In development: Integrated via Vite middleware mode.
  - In production: Single bundled CommonJS binary (`dist/server.cjs`) serving static assets and handling `/api/*` requests.
- **Authentication**: Firebase Authentication with Google Sign-In on client; backend verification enforced via Firebase Admin SDK.
- **Persistence**: Google Cloud Firestore with granular, collection-level path-scoped security rules under `/users/{uid}/...`.
- **AI Synthesis**: Server-side Gemini API proxy for reflections, conversation summarization, and pattern shift analysis. Gemini credentials are never exposed to the client.

```
┌────────────────────────────────────────────────────────┐
│                   Browser Client                       │
│  React 19 SPA (Google Sign-In, Client-side Firestore)  │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS (Bearer ID Token)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Cloud Run Service                    │
│            Express API Backend (:3000)                 │
│  ├── Observability (Privacy-Safe Metadata Logging)     │
│  ├── Auth Boundary (RS256 ID Token Verification)       │
│  ├── Distributed Rate Limiter (Firestore Transactions) │
│  └── Gemini AI Proxy (Server-side API calls)           │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│     Cloud Firestore     │ │       Gemini API        │
│   (/users/{uid}/...)    │ │ (Server-to-Server calls)│
└─────────────────────────┘ └─────────────────────────┘
```

---

## 2. Security Architecture

### Authentication & Identity Boundary
- Every protected backend route enforces `requireAuth` middleware (`server/middleware/auth.ts`).
- Authenticated user identity (UID) is derived **exclusively from verified Firebase ID tokens**. Client-supplied UIDs in request bodies or parameters are strictly distrusted and rejected.
- Short-lived ID tokens are validated cryptographically against Google's public RS256 x509 certificates, verifying issuer, audience (`industrious-edge-9xhgq`), and expiration.

### Deployment Requirement & Security Invariant: Token Revocation Checking
> **Security Invariant**:
> "Production deployments MUST enable `FIREBASE_CHECK_REVOKED=true` and provide a Cloud Run service identity with the required Firebase/Identity Toolkit permissions for the `industrious-edge-9xhgq` project. `FIREBASE_CHECK_REVOKED=false` is permitted only for the constrained AI Studio Preview environment and MUST NOT be silently used as a production fallback."

- **Production Mode (`FIREBASE_CHECK_REVOKED=true`)**: Verifies token revocation status via the Google Cloud Identity Toolkit API (`verifyIdToken(token, true)`). If revoked or disabled, requests are rejected with HTTP 401. If an internal configuration/credential error occurs, authentication fails safely with HTTP 401 rather than weakening security.
- **Preview Compatibility Mode (`FIREBASE_CHECK_REVOKED=false`)**: Configured specifically in AI Studio Preview where ambient Application Default Credentials (ADC) belong to the hosting project (`413982939225`) and cannot query the Identity Toolkit API for project `industrious-edge-9xhgq`. All cryptographic token claims (RS256 signature, issuer, audience, and expiration) remain fully verified.

### Firestore Data Isolation
- Default deny-all security model (`firestore.rules`).
- All user content is partitioned strictly under `/users/{uid}/`:
  - `/users/{uid}/entries/{entryId}`: Personal journal entries.
  - `/users/{uid}/conversations/{conversationId}`: Guided reflection sessions.
  - `/users/{uid}/conversations/{conversationId}/messages/{messageId}`: Session message transcripts.
  - `/users/{uid}/insights/{insightId}`: PatternShift intelligence records.
  - `/users/{uid}/limits/ai_ratelimit`: Distributed rate limit tracking (inaccessible to clients).
- Message immutability and provenance: Clients may only write messages with `role == "user"`. Assistant responses are persisted exclusively by the backend service.
- Field protection: Sensitive metadata fields (`summary`, `summaryUpdatedAt`, `status`) cannot be modified by clients.

### Backend-Owned Persistence Authority Matrix

Reflectra separates **user-authorized operations** (allowed by Firestore rules for the token holder) from **backend-owned writes** (denied by Firestore rules when authenticated as a user; require privileged server identity):

| Operation | Authority | Transport | Notes |
|---|---|---|---|
| Read `/users/{uid}/conversations/{cid}` | USER-AUTHORIZED READ | User ID token over REST (Admin SDK fallback) | Rules: `allow read: if isOwner(userId)` |
| Read `/users/{uid}/conversations/{cid}/messages/{mid}` | USER-AUTHORIZED READ | User ID token over REST (Admin SDK fallback) | Rules: `allow read: if isOwner(userId)` |
| Read `/users/{uid}/entries/{eid}` | USER-AUTHORIZED READ | User ID token over REST (Admin SDK fallback) | Rules: `allow read: if isOwner(userId)` |
| Read `/users/{uid}/insights/{iid}` | USER-AUTHORIZED READ | User ID token over REST (Admin SDK fallback) | Rules: `allow read: if isOwner(userId)`, `allow write: if false` |
| Delete conversation + subcollection | USER-AUTHORIZED DELETE | User ID token over REST (Admin SDK fallback) | Rules: `allow delete: if isOwner(userId)` |
| Create `/users/{uid}/entries/{eid}` | CLIENT WRITE | Client SDK | Owner + schema validation |
| Create `/users/{uid}/conversations/{cid}` (status=active, no summary) | CLIENT WRITE | Client SDK | Owner + initial-state guard |
| Create `/users/{uid}/conversations/{cid}/messages/{mid}` (role=user) | CLIENT WRITE | Client SDK | Owner + provenance check |
| **`persistAssistantMessage`** (role=assistant) | **BACKEND-OWNED WRITE** | **Admin SDK only** | **NEVER user-token REST** |
| **`completeAndSummarizeConversation`** (status, summary, summaryUpdatedAt) | **BACKEND-OWNED WRITE** | **Admin SDK only** | **NEVER user-token REST** |
| **`persistPatternShiftInsight`** (`/insights/{iid}`) | **BACKEND-OWNED WRITE** | **Admin SDK only** | **NEVER user-token REST** |
| `/users/{uid}/limits/{docId}` | BACKEND-OWNED | Admin SDK only | Rules: `allow read, write: if false` |

The three backend-owned writes in bold (assistant message persistence, conversation completion/summarization, PatternShift insight persistence) are the privilege boundary. If the runtime identity lacks Firestore IAM for the target database, these operations throw `BackendPersistenceUnavailableError` and the API returns HTTP 503 with `error: "BACKEND_PERSISTENCE_UNAVAILABLE"`. The handler MUST NOT fall back to user-token REST, MUST NOT weaken the rules, and MUST NOT silently swallow the failure. See `server/services/privilegedPersistence.ts` for the typed error and the classification of Admin SDK permission failures.

### Privacy-Safe Observability
- Strict redaction in operational logs: Server logs never record journal contents, conversation text, prompts, model completions, raw tokens, or authorization headers.
- Structured audit logs contain only: `requestId`, `timestamp`, `method`, `path`, `statusCode`, `latencyMs`, and a pseudonymized client identifier (`clientHash`: SHA-256 substring of UID).

---

## 3. Environment Configuration

Define required variables in `.env` (or Google Cloud Run environment settings):

```bash
# Gemini API Key (managed via Secret Manager in production)
GEMINI_API_KEY="your-gemini-api-key"

# Application URL
APP_URL="https://your-cloud-run-service.run.app"

# Token Revocation Checking
# MUST be true in production. Set to false ONLY in AI Studio Preview sandbox.
FIREBASE_CHECK_REVOKED=true
```

Never commit `.env` or sensitive credentials to version control.

---

## 4. Google Cloud & Secret Manager Setup

### Required IAM Permissions
The Cloud Run runtime service account requires:
- `roles/datastore.user` (Cloud Datastore / Firestore access)
- `roles/secretmanager.secretAccessor` (Access to `GEMINI_API_KEY` secret)
- `roles/firebaseauth.viewer` or `roles/identitytoolkit.viewer` (Identity Toolkit lookup for `FIREBASE_CHECK_REVOKED=true`)

### Secret Manager Configuration
```bash
# Create secret for Gemini API key
gcloud secrets create gemini-api-key --data-file=- <<< "your-secret-key"

# Grant Cloud Run service account access
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:reflectra-backend@industrious-edge-9xhgq.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Local Development & Testing

### Development Server
```bash
npm run dev
```
Starts Express backend and Vite development server bound to `http://0.0.0.0:3000`.

### Type Checking & Linting
```bash
npm run lint
```

### Automated Vitest Suite
```bash
npm test
```
Runs:
- `tests/rateLimiter.test.ts`: Distributed Firestore transaction-backed rate limiter unit tests.
- `tests/authMiddleware.test.ts`: Missing, malformed, revoked, expired token tests across production and preview modes.
- `tests/firestoreRules.test.ts`: Security rules AST invariant tests and emulator tests.

---

## 6. Cloud Run Deployment

### Named Firestore Database

This application targets a **named Firestore database** (not the default):

- **Database ID**: `ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2`
- **Project**: `industrious-edge-9xhgq`

Both the client (`src/firebase.ts`) and the backend Admin SDK (`server/firebaseAdmin.ts`) are configured to target this database via `firebase-applet-config.json`. The Admin SDK uses `getFirestore(app, databaseId)` for privileged writes. This is **not** optional — all backend-owned writes must target the named database.

### Production IAM Requirement

**CRITICAL**: Backend-owned writes (assistant messages, conversation lifecycle transitions, PatternShift insights) execute via the Firebase Admin SDK. This requires the Cloud Run **runtime service account** to have Firestore IAM on the target project and database.

The deployment MUST:
1. Create or designate a service account in project `industrious-edge-9xhgq`.
2. Grant `roles/datastore.user` (or `roles/firestore.user`) on the project.
3. Attach that service account to the Cloud Run service via `--service-account`.

If the Cloud Run service runs under a service account that lacks Firestore IAM, backend-owned writes will fail with `BACKEND_PERSISTENCE_UNAVAILABLE` (HTTP 503). The AI Studio preview sandbox cannot be granted IAM on the user's Firebase project; therefore, backend-owned persistence is **unavailable in preview by design**.

### Deployment Command

Build and deploy the containerized full-stack application:

```bash
# 1. Build the production bundle
npm run build

# 2. (One-time) Create dedicated service account if not exists
gcloud iam service-accounts create reflectra-backend \
  --display-name="Reflectra Backend Service Account" \
  --project=industrious-edge-9xhgq

# 3. Grant Firestore IAM to the service account
gcloud projects add-iam-policy-binding industrious-edge-9xhgq \
  --member="serviceAccount:reflectra-backend@industrious-edge-9xhgq.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# 4. (Optional) Grant Identity Toolkit access for token revocation checking
gcloud projects add-iam-policy-binding industrious-edge-9xhgq \
  --member="serviceAccount:reflectra-backend@industrious-edge-9xhgq.iam.gserviceaccount.com" \
  --role="roles/identitytoolkit.viewer"

# 5. Deploy to Cloud Run with explicit service account
gcloud run deploy reflectra \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --service-account="reflectra-backend@industrious-edge-9xhgq.iam.gserviceaccount.com" \
  --set-env-vars="FIREBASE_CHECK_REVOKED=true,APP_URL=https://reflectra-ttdjc5plokhcurtykxiyb2-413982939225.asia-east1.run.app" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

**Do not deploy without `--service-account`** unless the project's default Compute Engine service account already has the required Firestore IAM (not recommended for production).

---

## 7. AI Studio Preview Limitations

The AI Studio preview runtime is constrained:

- The ambient Application Default Credentials (ADC) belong to the hosting/sandbox project, **not** to `industrious-edge-9xhgq`. No IAM grant on the target project is available from the preview sandbox.
- User-authorized reads and deletes (owner-scoped) continue to work in preview because Firestore rules allow them.
- **Backend-owned writes are unavailable in preview by design**:
  - `POST /api/reflect` — assistant message persistence will fail with `BACKEND_PERSISTENCE_UNAVAILABLE` (HTTP 503) if privileged IAM is absent. The API does NOT return a generated assistant response that was never persisted; the user is informed that reflection services are temporarily unavailable.
  - `POST /api/conversations/:id/summarize` — conversation completion/summarization will fail with `BACKEND_PERSISTENCE_UNAVAILABLE` (HTTP 503) if privileged IAM is absent. The conversation remains in `active` state; no summary is written.
  - `POST /api/patternshift/analyze` — insight persistence will fail with `BACKEND_PERSISTENCE_UNAVAILABLE` (HTTP 503) if privileged IAM is absent. No insight is reported as generated unless it was successfully persisted.
- `GET /api/patternshift/latest` and all read endpoints continue to work via the user-token REST path.
- `DELETE /api/conversations/:id` continues to work via the user-token REST path (rules allow owner delete).

Production Cloud Run deployments with a correctly-attached service account do NOT exhibit this limitation.

---

## 8. PatternShift Feature Architecture
