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

Build and deploy the containerized full-stack application:

```bash
# 1. Build the production bundle
npm run build

# 2. Deploy to Google Cloud Run
gcloud run deploy reflectra \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars="FIREBASE_CHECK_REVOKED=true,APP_URL=https://reflectra-ttdjc5plokhcurtykxiyb2-413982939225.asia-east1.run.app" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

---

## 7. PatternShift Feature Architecture

PatternShift is Reflectra's longitudinal reflection synthesis engine:
1. **Historical Retrieval**: Analyzes only the authenticated user's own historical reflections (`/users/{uid}/entries`).
2. **Structured Aggregation**: Computes objective trend metrics (topic recurrence, tone shift, cognitive confidence markers) before querying Gemini.
3. **Safe Reasoning**: Interprets trends as descriptive observations rather than psychological or medical conclusions. Prohibits mental health diagnoses.
4. **Data Isolation**: Never compares users across accounts or pools reflection datasets.
