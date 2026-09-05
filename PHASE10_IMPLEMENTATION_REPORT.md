# Phase 10 — PatternShift Stabilization & Extended Intelligence

## 1. Root Cause (STEP 0)

The reported UI failure ("Failed to complete pattern analysis. Please try again later.") was an HTTP 500 returned by `POST /api/patternshift/analyze`. The chain, verified with a reproduction in a scratch test and the runtime `[PATTERNSHIFT_ANALYZE_ERROR]` log:

1. The runtime has no `GEMINI_API_KEY` (no `.env`, no environment variable, Secret Manager not enabled) in this environment.
2. `getSecret()` (`server/config/secrets.ts`) threw `SECRET_CONFIG_ERROR` for the missing key.
3. `getGeminiApiKey()` (`server/services/geminiService.ts`) threw `GEMINI_CONFIGURATION_ERROR`.
4. The PatternShift route's catch-all returned `500 internal_error` instead of classifying the failure.

Three distinct defects were found and fixed:

- **Defect A — poisoned Gemini client cache:** `getAiClient()` permanently cached the *rejected* promise after a failed init, so every later call returned the same rejected promise even if a key became available.
- **Defect B (the real bug) — poisoned secret cache:** `getSecret()` evicted failed entries from `SECRET_CACHE` *inside* an `.catch()` attached synchronously to the promise, but the env-var path **throws synchronously before the promise exists**, so the inner catch ran and then the rejected promise was re-added to `SECRET_CACHE` by the outer caching logic. Result: the missing-key error was cached forever.
- **Defect C — misleading status code:** `patternShift.ts` returned a generic 500 for configuration failures, while the reflection route already classified `GEMINI_CONFIGURATION_ERROR` as 503.

## 2. Fixes (STEP 1) — minimal, in-scope, fail-closed

| File | Change |
| --- | --- |
| `server/services/geminiService.ts` | `getAiClient()` resets its module cache to `null` on init failure so a later attempt can re-initialize. |
| `server/config/secrets.ts` | `getSecret()` now attaches `retrievalPromise.catch(() => SECRET_CACHE.delete(name))` so any failure — including the synchronous env-var throw — is always evicted from the cache. |
| `server/routes/patternShift.ts` | `GEMINI_CONFIGURATION_ERROR` is classified as `503 service_unavailable` with message `"PatternShift requires AI configuration, but the AI configuration is incomplete..."`. No fake data; nothing is persisted on failure. |

Constraints honored: no demo fallback in production, no error suppression, no Gemini disabling, no hardcoded success, no backend replacement.

## 3. Extended Intelligence Modules (STEP 2)

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

## 4. Backend Integration (STEP 3)

- `patternShiftEngine.ts` → `RawEntry.location`, imports `analyzePatternIntelligence`, exposes `EngineResult.intelligence`.
- `patternShiftPersistence.ts` → location + intelligence persisted and fetched back.
- `firestoreRestService.ts` → location in `getUserEntriesRest`, intelligence in `getLatestInsightRest`.
- `patternShift.ts` → `newInsight` includes `intelligence`; only `metrics` (never location) is sent to Gemini.
- `src/types/patternshift.ts` → `intelligence?: PatternIntelligence | null` (old persisted insights stay readable; sections simply don't render).

## 5. UI (STEP 4)

`PatternShiftDashboard.tsx` + `src/index.css`:

- **Your Recent Rhythm** — Mood Over Time, When You Reflect (bucket bars), How Often You Reflect cards.
- **How Your Themes Are Evolving** — emerging / growing / persistent / fading chips with earlier → recent counts.
- **Unusual Moments** — timing observation with a non-clinical framing note.
- **Places Connected to Reflection** — recurring-label chips with a privacy note (coordinates never shown).
- Every section includes a **keyboard-accessible "Why am I seeing this?" disclosure** (`aria-expanded` / `aria-controls`) rendering the module's evidence (explanation, sample size, confidence tone, period, breakdown).
- Sections with `insufficient_data` render nothing.
- All copy keeps the existing editorial, non-clinical voice.

## 6. Demo Fixtures (STEP 5)

`src/demo/demoData.ts`:

- Entries now have varied times of day (evening-heavy: 21:15, 22:30, 19:10, 18:45; one late-night 01:20; one afternoon 15:10; one morning 07:30) and optional locations (Brooklyn ×2, London, Paris).
- Completed conversations land in the evening (20:00, 18:30).
- `DEMO_PATTERN_INSIGHT.intelligence` is **computed at module load** from the fixtures via `analyzePatternIntelligence` — the demo insight always matches the synthetic journal data, entirely client-side (no Firebase/Gemini/backend).

Verified demo output: mood `upward` (3.0 → 3.75), evening-dominant rhythm (6/9), cadence `increasing`, `#boundaries` + `#gratitude` emerging, 1 unusual late-night reflection flagged, Brooklyn recurring — every Phase 10 UI section renders in demo.

## 7. Tests (STEP 6)

New / extended test coverage:

| File | Tests | Purpose |
| --- | --- | --- |
| `tests/patternShiftIntelligence.test.ts` | 27 | All six modules: thresholds, honesty on insufficient data, no coordinate leakage, no "streak" language |
| `tests/geminiClientRecovery.test.ts` | 1 | Fails closed on missing key, then **fully recovers** once the key is available (proves both cache fixes) |
| `tests/patternShiftRoutes.test.ts` | +2 (11 total) | 503 service_unavailable fail-closed (no fake insight, nothing persisted); success payload includes all six intelligence modules and does **not** leak location into `metrics` |
| `tests/patternShiftEngine.test.ts` | +4 (15 total) | Intelligence block attached on success, omitted on insufficient data; conversation timestamps feed timing modules; metrics never contain location labels/coordinates |
| `server/config/secrets.test.ts` | +1 (19 total) | Env-path synchronous-throw no longer permanently poisons `SECRET_CACHE` |

## 8. Regression

- `npx tsc --noEmit` — exit 0.
- Full `npx vitest run` — **181 passed**, 11 skipped, and exactly the 11 **pre-existing** failures in `tests/demoMode.test.ts` (Category C infrastructure: `globalThis.import.meta` undefined under Vitest 5; unrelated to Phase 10 and reproducible everywhere; intentionally not fixed).
- `npm run build` — success (pre-existing chunk-size warning only).
- `VITE_DEMO_MODE=true npm run build` — success.

## 9. Known limitations

- A live Gemini call cannot be exercised in this runtime (no real key available); Gemini behavior is verified through the mocked-network boundary tests. The 503 classification is exactly what surfaces in production users' logs when the key is missing.
- Firestore rules for insights were already owner-read/Admin-write; no rule change was required.

## 10. Deliverables

- `PHASE10_FINAL_QA_VERDICT.txt` — independent Nemotron-QA sweep: **PASS, zero defects** (all 13 validation steps green).
- This report.

## 11. Stop

Phase 10 is complete. Per mission instructions, work stops here: no Phase 11, no RBAC, no notifications work is started.