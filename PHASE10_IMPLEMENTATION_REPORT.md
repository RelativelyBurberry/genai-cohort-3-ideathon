# Phase 10 — PatternShift Stabilization & Extended Intelligence

## 1. Original Root Cause (STEP 0)

The reported UI failure ("Failed to complete pattern analysis. Please try again later.") was an HTTP 500 returned by `POST /api/patternshift/analyze`. The chain, verified with a reproduction in a scratch test and the runtime `[PATTERNSHIFT_ANALYZE_ERROR]` log:

1. The runtime has no `GEMINI_API_KEY` (no `.env`, no environment variable, Secret Manager not enabled) in this environment.
2. `getSecret()` (`server/config/secrets.ts`) threw `SECRET_CONFIG_ERROR` for the missing key.
3. `getGeminiApiKey()` (`server/services/geminiService.ts`) threw `GEMINI_CONFIGURATION_ERROR`.
4. The PatternShift route's catch-all returned `500 internal_error` instead of classifying the failure.

Three distinct defects were found and fixed:

- **Defect A — poisoned Gemini client cache:** `getAiClient()` permanently cached the *rejected* promise after a failed init, so every later call returned the same rejected promise even if a key became available.
- **Defect B (the real bug) — poisoned secret cache:** `getSecret()` evicted failed entries from `SECRET_CACHE` *inside* an `.catch()` attached synchronously to the promise, but the env-var path **throws synchronously before the promise exists**, so the inner catch ran and then the rejected promise was re-added to `SECRET_CACHE` by the outer caching logic. Result: the missing-key error was cached forever.
- **Defect C — misleading status code:** `patternShift.ts` returned a generic 500 for configuration failures, while the reflection route already classified `GEMINI_CONFIGURATION_ERROR` as 503.

## 2. Original Fixes (STEP 1) — minimal, in-scope, fail-closed

| File | Change |
| --- | --- |
| `server/services/geminiService.ts` | `getAiClient()` resets its module cache to `null` on init failure so a later attempt can re-initialize. |
| `server/config/secrets.ts` | `getSecret()` now attaches `retrievalPromise.catch(() => SECRET_CACHE.delete(name))` so any failure — including the synchronous env-var throw — is always evicted from the cache. |
| `server/routes/patternShift.ts` | `GEMINI_CONFIGURATION_ERROR` is classified as `503 service_unavailable` with message `"PatternShift requires AI configuration, but the AI configuration is incomplete..."`. No fake data; nothing is persisted on failure. |

Constraints honored: no demo fallback in production, no error suppression, no Gemini disabling, no hardcoded success, no backend replacement.

---

## 3. PatternShift Runtime Remediation (Phase 10 Extension)

### 3.1. Confirmed Additional Root Causes (Diagnostic Report)

Two independently verified runtime issues beyond the original Phase 10 scope:

#### Issue A — Immediate Failure (Firebase ID Token → Firestore REST)
`server/services/firestoreRestService.ts` sent Firebase Auth ID tokens (`eyJ...`) to the Google Cloud Firestore v1 REST API. Firestore REST rejects this with:

```
401 UNAUTHENTICATED
ACCESS_TOKEN_TYPE_UNSUPPORTED
```

**Root Cause**: Firebase Auth ID tokens are **not** Google OAuth2 access tokens and **cannot** authenticate Google Cloud REST APIs. The architecture incorrectly forwarded Firebase ID tokens as Bearer tokens to Firestore REST.

#### Issue B — Downstream Sandbox Limitation (Backend Persistence IAM)
Firebase Admin persistence fails in Google AI Studio preview because the sandbox service account lacks Firestore write IAM permissions. Analysis succeeded but the entire request failed due to persistence failure.

**Note**: Gemini API configuration and Gemini generation are VERIFIED HEALTHY.

### 3.2. Remediation Architecture

#### Part 1: Firestore Data Fetch — Admin SDK ONLY
- **Backend-owned reads** (entries, conversations, latest insight): NOW use privileged Admin SDK ONLY
- Firebase ID token is NEVER forwarded to Google Cloud Firestore REST
- If runtime lacks Firestore read IAM (AI Studio sandbox): throws `BackendReadUnavailableError`
- **Verified capability fallback ONLY**: Client may supply minimal, validated `analysisPayload` built from its OWN authenticated Firestore reads
- Identity ALWAYS comes from `requireAuth` middleware; payload schema does NOT include `uid` field

#### Part 2: Persistence Capability Handling — Honest Metadata
- **Normal production**: `persistPatternShiftInsight` succeeds → response includes `{ persistence: { persisted: true } }`
- **Infrastructure capability failure ONLY** (backend IAM unavailable): Analysis succeeds, insight returned with `{ persistence: { persisted: false, reason: 'backend_persistence_unavailable' } }`
- **NOT applied to**: auth failures, authorization failures, malformed data, validation errors, arbitrary Firestore errors
- Unexpected errors still fail normally (500)

#### Part 3: UI Behavior
- PatternShiftDashboard shows subtle, non-alarming notice when `persisted: false`
- Does NOT show "Analysis Encountered an Issue" error banner
- Insight displayed normally

#### Part 4: Demo Mode — Preserved
- Zero Firebase calls, zero backend API calls (where bypassed)
- localStorage-only demo persistence
- Synthetic data isolation
- Existing demo PatternShift insight continues working

#### Part 5: Testing — 9 Required Scenarios (All Passing)
1. Firebase ID token is NOT forwarded to Google Firestore REST
2. Server-side Firestore path works when backend capability exists
3. Client-provided fallback only activates for verified backend infrastructure capability failures
4. Request uid cannot override authenticated req.user.uid
5. Malformed client analysis payload is rejected
6. Successful Gemini analysis returned even when persistence fails due to infrastructure IAM
7. Unexpected persistence errors still fail normally
8. Production persistence success remains unchanged
9. Demo mode remains isolated

### 3.3. Files Changed — Remediation

**Server-side changes:**

| File | Change |
| --- | --- |
| `server/services/privilegedPersistence.ts` | Added `BackendReadUnavailableError` class and `withBackendReadCapability` wrapper. New error code `BACKEND_READ_UNAVAILABLE` for verified infrastructure read capability failures only. |
| `server/services/patternShiftPayload.ts` | **NEW** — Minimal, strictly validated client analysis payload. Schema includes ONLY fields required by PatternShift engine (id/title/content/moodRating/tags/createdAt/updatedAt/location for entries; id/title/summary/createdAt/updatedAt/summaryUpdatedAt for completed conversations). Rejects unknown keys, out-of-bounds values, and any `uid` field. Limits: max 200 entries, 200 conversations. |
| `server/services/patternShiftPersistence.ts` | **REWRITTEN** — All reads (`fetchUserEntriesForPatternShift`, `fetchUserConversationsForPatternShift`, `fetchLatestPatternShiftInsight`) now use Admin SDK ONLY with `withBackendReadCapability`. NO token parameter accepted. Throws `BackendReadUnavailableError` on IAM failure. Write (`persistPatternShiftInsight`) unchanged — still Admin SDK only with `BackendPersistenceUnavailableError`. |
| `server/routes/patternShift.ts` | **REWRITTEN** — POST `/analyze` tries Admin SDK reads first. On `BackendReadUnavailableError`: if client provided `analysisPayload`, uses validated payload; if no payload, returns `200 { status: 'client_data_required' }`. Persistence: on `BackendPersistenceUnavailableError`, returns `{ persistence: { persisted: false, reason: 'backend_persistence_unavailable' } }` with the successful insight. GET `/latest`: on `BackendReadUnavailableError`, returns `null` insight gracefully. |

**Client-side changes:**

| File | Change |
| --- | --- |
| `src/types/patternshift.ts` | Added `PatternShiftPersistenceStatus` interface and `client_data_required` to `PatternShiftResponse` union. |
| `src/services/reflectionService.ts` | Added `getConversations(uid)` one-shot fetch for client fallback payload building. |
| `src/services/patternShiftService.ts` | **REWRITTEN** — `triggerPatternAnalysis` now: (1) tries normal server analysis; (2) on `client_data_required`, builds minimal `analysisPayload` from client's own authenticated Firestore reads (journal entries + completed conversations); (3) retries with payload. **Privacy**: location coordinates NEVER sent — only user-provided label included. |
| `src/components/insights/PatternShiftDashboard.tsx` | Added `persistenceNotice` state. Shows subtle `.patternshift-persistence-notice` when `persistence.persisted === false` OR `status === 'client_data_required'`. Does NOT show error banner. |
| `src/index.css` | Added `.patternshift-persistence-notice` style (muted, non-alarming). |

### 3.4. Security Boundaries Preserved

- **Backend reads**: Admin SDK only — Firebase ID tokens NEVER reach Google Cloud Firestore REST API for PatternShift
- **Backend writes**: Admin SDK only — unchanged
- **Client payload**: Minimal schema, unknown keys rejected, no `uid` field, no raw message content, no coordinates
- **Identity**: Always derived from verified token via `requireAuth` — request body `uid` ignored
- **Capability fallback**: Only activates for verified `BackendReadUnavailableError` (code 7 / PERMISSION_DENIED from Admin SDK). NOT for auth failures, validation errors, or arbitrary errors.
- **Demo isolation**: Zero Firebase/backend calls, localStorage-only, synthetic data, unchanged

---

## 4. Extended Intelligence Modules (STEP 2)

New pure, deterministic, framework-independent modules in `src/intelligence/patternAnalysis/`:

| Module | Claim | Minimum evidence |
| --- | --- | --- |
| `moodTrajectory` | Early-half vs recent-half average movement plus a variability guard (never first-vs-last, never clinical) | 4 mood-rated entries |
| `reflectionRhythm` | Which time-of-day bucket (night/morning/afternoon/evening, runtime-local) dominates | 4 timestamped items |
| `reflectionFrequency` | Cadence from inter-arrival gaps: increasing / decreasing / consistent / irregular. Explicitly **no "streak" language** | 4 items (3 gaps) |
| `themeEvolution` | Emerging / increasing / persistent / fading themes from normalized tags | 8 total tag occurrences and 4 tag-bearing entries |
| `unusualTiming` | Recent reflections outside the user's established writing window (purely observational) | 5-item baseline with dominant share >= 0.5 |
| `locationPatterns` | Recurring places, grouped **by label only**; coordinates used for counting and **never exposed** | 4 located entries |

Every surfaced observation carries `PatternEvidence { sampleSize, confidence, explanation, breakdown?, periodStart?, periodEnd? }` so the UI can answer *"Why am I seeing this?"*. Confidence is graded strictly from sample size (`>=8` strong, `>=5` moderate, else low). Every module returns `insufficient_data` honestly when its threshold isn't met.

## 5. Backend Integration (STEP 3)

- `patternShiftEngine.ts` → `RawEntry.location`, imports `analyzePatternIntelligence`, exposes `EngineResult.intelligence`.
- `patternShiftPersistence.ts` → location + intelligence persisted and fetched back.
- `firestoreRestService.ts` → location in `getUserEntriesRest`, intelligence in `getLatestInsightRest`.
- `patternShift.ts` → `newInsight` includes `intelligence`; only `metrics` (never location) is sent to Gemini.
- `src/types/patternshift.ts` → `intelligence?: PatternIntelligence | null` (old persisted insights stay readable; sections simply don't render).

## 6. UI (STEP 4)

`PatternShiftDashboard.tsx` + `src/index.css`:

- **Your Recent Rhythm** — Mood Over Time, When You Reflect (bucket bars), How Often You Reflect cards.
- **How Your Themes Are Evolving** — emerging / growing / persistent / fading chips with earlier → recent counts.
- **Unusual Moments** — timing observation with a non-clinical framing note.
- **Places Connected to Reflection** — recurring-label chips with a privacy note (coordinates never shown).
- Every section includes a **keyboard-accessible "Why am I seeing this?" disclosure** (`aria-expanded` / `aria-controls`) rendering the module's evidence (explanation, sample size, confidence tone, period, breakdown).
- Sections with `insufficient_data` render nothing.
- All copy keeps the existing editorial, non-clinical voice.

## 7. Demo Fixtures (STEP 5)

`src/demo/demoData.ts`:

- Entries now have varied times of day (evening-heavy: 21:15, 22:30, 19:10, 18:45; one late-night 01:20; one afternoon 15:10; one morning 07:30) and optional locations (Brooklyn ×2, London, Paris).
- Completed conversations land in the evening (20:00, 18:30).
- `DEMO_PATTERN_INSIGHT.intelligence` is **computed at module load** from the fixtures via `analyzePatternIntelligence` — the demo insight always matches the synthetic journal data, entirely client-side (no Firebase/Gemini/backend).

Verified demo output: mood `upward` (3.0 → 3.75), evening-dominant rhythm (6/9), cadence `increasing`, `#boundaries` + `#gratitude` emerging, 1 unusual late-night reflection flagged, Brooklyn recurring — every Phase 10 UI section renders in demo.

## 8. Tests (STEP 6 + Remediation)

New / extended test coverage:

| File | Tests | Purpose |
| --- | --- | --- |
| `tests/patternShiftIntelligence.test.ts` | 27 | All six modules: thresholds, honesty on insufficient data, no coordinate leakage, no "streak" language |
| `tests/geminiClientRecovery.test.ts` | 1 | Fails closed on missing key, then **fully recovers** once the key is available (proves both cache fixes) |
| `tests/patternShiftRoutes.test.ts` | +2 (11 total) | 503 service_unavailable fail-closed (no fake insight, nothing persisted); success payload includes all six intelligence modules and does **not** leak location into `metrics` |
| `tests/patternShiftEngine.test.ts` | +4 (15 total) | Intelligence block attached on success, omitted on insufficient data; conversation timestamps feed timing modules; metrics never contain location labels/coordinates |
| `server/config/secrets.test.ts` | +1 (19 total) | Env-path synchronous-throw no longer permanently poisons `SECRET_CACHE` |
| `tests/patternShiftPayload.test.ts` | 11 | **REMEDIATION** — Payload validation: schema bounds, unknown-key rejection, uid rejection, coordinate exclusion |
| `tests/patternShiftPersistence.test.ts` | 6 | **REMEDIATION** — Admin SDK read path, IAM → BackendReadUnavailableError mapping, non-IAM errors pass through, signature assertions (no token arg) |
| `tests/patternShiftService.test.ts` | 4 | **REMEDIATION** — Client fallback flow, payload building, coordinates excluded, active conversations excluded |
| `tests/patternShiftDemoIsolation.test.ts` | 4 | **REMEDIATION** — Demo identity/storage synthetic, insight carries intelligence, fixtures demo- namespaced |
| `tests/patternShiftRemediation.test.ts` | 9 | **REMEDIATION** — All 9 required scenarios from the diagnostic report |

## 9. Regression

- `npx tsc --noEmit` — exit 0.
- Full `npx vitest run` — **217 passed**, 11 skipped, and exactly the 11 **pre-existing** failures in `tests/demoMode.test.ts` (Category C infrastructure: `globalThis.import.meta` undefined under Vitest 5; unrelated to Phase 10 and reproducible everywhere; intentionally not fixed).
- `npm run build` — success (pre-existing chunk-size warning only).
- `VITE_DEMO_MODE=true npm run build` — success.

## 10. Known Limitations

- A live Gemini call cannot be exercised in this runtime (no real key available); Gemini behavior is verified through the mocked-network boundary tests. The 503 classification is exactly what surfaces in production users' logs when the key is missing.
- Firestore rules for insights were already owner-read/Admin-write; no rule change was required.
- The client fallback requires the authenticated client to have local Firestore read access (normal in AI Studio preview). If both backend and client reads fail, analysis returns `client_data_required`.

## 11. Deliverables

- `PHASE10_FINAL_QA_VERDICT.txt` — independent Nemotron-QA sweep: **PASS, zero defects** (all 13 validation steps green).
- This report.

## 12. Independent QA Verification

**Nemotron-QA Verdict (Post-Remediation)**: **PASS, zero defects**

Verification performed by independent Nemotron-QA subagent:
- TypeScript compilation: ✅ PASSED
- Full test suite (excluding pre-existing demoMode infra failures): ✅ PASSED (24 test files, 217 passed, 11 skipped)
- Production build: ✅ PASSED
- Demo build (VITE_DEMO_MODE=true): ✅ PASSED
- Firebase ID token NOT forwarded to Google Firestore REST for PatternShift: ✅ VERIFIED
- All 9 remediation test scenarios: ✅ VERIFIED PASSING
- Production auth boundaries: ✅ INTACT
- Demo isolation: ✅ PRESERVED
- Secret Manager: ✅ NO REGRESSION

## 13. Stop

Phase 10 is complete. Per mission instructions, work stops here: no Phase 11, no RBAC, no notifications work is started.

**HARD STOP.**