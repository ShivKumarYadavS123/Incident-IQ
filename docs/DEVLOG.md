# IncidentIQ — Dev Log

Running log of what was built, tested and learned. `CLAUDE.md` holds the backlog and roadmap;
this file holds the history and test results. **Any new AI chat/session: read `CLAUDE.md` + this file first.**

## Local setup cheat-sheet
- Repo root: `C:\Incident Iq\incidentiq` (open THIS folder in VS Code, not the parent)
- Backend: `cd backend && npm start` (= `node server.js`, port 5000)
- Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` → 5000)
- MongoDB: Windows service on 27017. Stop/start (admin PowerShell): `Stop-Service MongoDB` / `Start-Service MongoDB`.
  Compass "Disconnect" does NOT stop the server.
- Fake-Gemini-key test: `GEMINI_API_KEY=invalid npm start` (shell env overrides `.env`)
- ⚠️ Do NOT run `npm run seed` until issue #11 is fixed — it wipes all incidents.
- Workflow: Claude Code (Manual mode) writes code → review diff → manual test → commit → `git push`.

---

## Day 1 — 2026-09-27

### Commits
| Hash | Message |
|---|---|
| b5ae29e | v1: working RAG pipeline with feedback loop |
| 7e3c7c8 | docs: add CLAUDE.md with expanded v1 backlog and reordered v2 roadmap |
| cc49e39 | chore: add Claude settings with env-file deny rules and PreToolUse guard hook |
| 8244acc | chore: add .gitattributes to normalize line endings to LF |
| 147285f | fix(api): add centralized error handling so bad requests can't crash the server |
| 1524804 | docs: add Gemini resilience to 2.0 backlog and update status |

### What was built
- **Secret protection for the AI agent:** `.claude/settings.json` deny rules + `PreToolUse` hook
  (`.claude/hooks/block-env.mjs`) that blocks any tool input referencing a `.env` file (allows `.env.example`, `process.env`).
- **Error contract** (`backend/middleware/errors.js`):
  - `asyncHandler` forwards async rejections to `next(err)` (Express 4 doesn't; Node 24 would crash).
  - `notFound` → `404 {"error":"Not found"}` (fixed text, never reflects input).
  - `errorHandler`: CastError → `400 "Invalid id"`; `entity.parse.failed` → `400 "Invalid JSON body"`;
    only errors with `expose: true` (our `httpError`, body-parser 4xx) keep their status/message;
    everything else (incl. Gemini SDK 400/429/503) → `500 "Internal server error"`, logged server-side only.
  - `PATCH /:id/resolve` returns 404 for a missing incident.

### Manual error checklist — results
| # | Test | Result |
|---|---|---|
| A1 | PATCH invalid id | ✅ 400 Invalid id |
| A2 | PATCH valid-but-missing id | ✅ 404 Incident not found |
| A3 | Unknown route | ✅ 404 Not found |
| A4 | Malformed JSON (`{bad json`, `hello`) | ✅ 400 Invalid JSON body |
| A5 | /analyze missing description | ⚠️ 500 (correct for now; should be 400 via zod validation before calling Gemini) |
| A6 | Body > 100kb | ✅ 413 |
| A7 | Server alive after all | ✅ 200 |
| — | Leak check (stack/paths/SDK text in bodies) | ✅ none |
| B8 | Fake Gemini key | ✅ 500, details in server log only |
| B9 | MongoDB stopped while running | ✅ 500 after ~10s, server alive |
| B10 | MongoDB down at boot | ⚠️ hangs with connection error — should exit clearly (env check on boot) |
| C11 | Normal UI flow | ⚠️ Real Gemini **503 "high demand"** → backend correct, **frontend black screen (#3)**, **incident lost (#4)** |
| C12 | Backend stopped, trigger in UI | ⚠️ nothing shown, console error (#3) |
| D14 | `git ls-files \| grep env` | ✅ only `.env.example` (+ hook script name) |
| D15 | Ask agent to read `backend/.env` | ✅ refused (intent) + hook/deny rules verified |

**Baseline metric:** `GET /api/incidents` = **915,253 bytes** (full embeddings). Target after #2: ~20 KB.

### Findings
- **Upstream status leak (found in manual testing):** `errorHandler` trusted any `err.status`, so Gemini's
  400/429 reached clients. Fixed with the expose-only rule.
- **UI: "Similar Past Incidents (0)" on every past incident** — `App.jsx` onSelect hard-codes `matches: []`
  and `confidence: "low"`; analysis is never persisted (#5, #13). Fix: persist analysis on the incident + load it on select.
- **UI: old incident detail stays visible while composing a new alert** — works but ambiguous. Handle in 2.3
  redesign (new alert as its own route/drawer, or dim detail while composing).

### Next (Day 2)
1. **#3** frontend error handling: `res.ok` checks in all fetches, user-facing error message, React error boundary, network-down case.
2. **#19** Gemini resilience: retry w/ exponential backoff on 429/503, timeout, graceful degradation
   (save incident + return matches with "hypothesis unavailable"), map outage → our own 503 via `httpError`.
3. Rest of 2.0: #4 save-before-LLM, #5 persist analysis, #13 confidence, #2 strip embeddings, zod validation,
   resolve validation, safe seed, single dotenv + exit on boot failure, helmet/CORS/rate limit.
4. When 2.0 is complete: `git tag v2.0.0` and push the tag (GitHub release).

---

## Day 2 — 2026-09-28

### What was built — #3 frontend error handling
- **`frontend/src/api.js` → `request(url, options)`**: single fetch wrapper. Returns parsed JSON on success,
  otherwise throws an Error whose message is safe to show:
  - `fetch` throws (network down) → "Can't reach the server — is the backend running?"
  - `!res.ok` + JSON `{ error }` → the backend's message (our error contract)
  - `!res.ok` + non-JSON body → also "Can't reach the server". Our backend always answers errors as JSON,
    so a non-JSON error came from something in between — in dev, the **Vite proxy returns a 5xx when the
    backend is down**, so `fetch` does *not* throw in that case.
  - `res.ok` + non-JSON → "Unexpected response from server" (never return `null` into state)
- **`App.jsx`**: `loadIncidents` never throws — keeps the last list and shows a sidebar banner with Retry.
  `triggerAlert` shows the error next to the button and keeps the form open with the user's input;
  `setResult` only ever receives real analysis data (the direct cause of the C11 black screen).
- **`ResolveForm`**: `onResolved()` only on success. Before, a failed PATCH still flipped the UI to
  "resolved" — the engineer thought the fix was fed back into RAG when it wasn't.
- **`ErrorBoundary.jsx`** (class component — no hook equivalent): wraps `<App />` (full-page fallback + Reload)
  and `<IncidentDetail>` (panel-only fallback; `key={incident._id}` remounts it so selecting another incident clears the error).

### Learned
- Error boundaries only catch errors **during render**. Not event handlers, not async code. The C11
  black screen started in an async fetch (bad data → later render crash), so the real fix is checking
  `res.ok`; the boundary is a safety net.
- `errorHandler` only exposes 4xx. For #19 ("outage → our own 503 via `httpError`") it must also allow 503.

### Manual test checklist — #3
| # | Test | Result |
|---|---|---|
| E1 | Normal flow: trigger alert, resolve it | ⚠️ Error path ✅: real Gemini 503 on every try (`gemini-3.6-flash` generateContent "high demand"; embeddings fine) → clean "Internal server error", no black screen. Happy path not verifiable → retest after #19 |
| E2 | Backend stopped, reload page → sidebar banner; Retry after restart | ✅ |
| E3 | Backend stopped, trigger alert → "Can't reach the server", form keeps input | ✅ |
| E4 | Backend stopped, resolve → inline error, incident stays open | ✅ |
| E5 | `GEMINI_API_KEY=invalid` → "Internal server error" by the button, no black screen | ✅ |
| E6 | Forced render error → panel fallback, sidebar still works | ✅ |

**Finding:** `gemini-3.6-flash` is persistently overloaded for this key — a single hard-coded model is a
single point of failure. Drives #19: model fallback list via env, retry/backoff, degrade to matches-only.

Committed as `97d4788`.

### What was built — #19 Gemini resilience
- **`backend/scripts/list-models.mjs`**: lists models this key can use for `generateContent`
  (REST ListModels, key sent as `x-goog-api-key` header — never in the URL, never printed).
- **`backend/utils/gemini.js`**: one client + one retry policy.
  - `withRetry`: 429/503 → retry same model, 3 attempts, backoff ~0.5s/~1s + jitter.
    Timeout (15s)/network, 400, 404 → no retry (won't help).
  - `generateHypothesis`: tries each model in `GEMINI_GEN_MODELS` in order; returns `null` if all fail.
  - Env read at call time (not import time) — sidesteps the #17 dotenv ordering problem.
- **Models via env**: `GEMINI_EMBED_MODEL` (default `gemini-embedding-001`, **no fallback** — vectors from
  different models aren't comparable), `GEMINI_GEN_MODELS` (default `gemini-3.5-flash-lite,gemini-3.8-flash`).
- **`/analyze`**: embedding outage (429/503/timeout/network) → our own `503 "AI service is temporarily
  unavailable…"`; embedding 400 (bad key) stays 500. All gen models fail → incident **still saved**, matches
  returned with `hypothesis: null, aiUnavailable: true`.
- **`errorHandler`**: `expose` errors pass through for 4xx **or 503**. SDK errors never have `expose`, so
  Google's own statuses still become a generic 500.
- **UI**: `aiUnavailable` → "AI hypothesis temporarily unavailable — similar incidents below."

### Verified by script (before manual testing)
- Offline (fake errors): 503,503,ok → 3 calls ✅; 429 forever → gives up after 3 ✅; 400 → 1 call ✅;
  outage classification: 503/timeout = outage, 400/TypeError = not ✅.
- Live, 2026-09-28: `gemini-3.5-flash-lite` → 15s timeout; `gemini-3.8-flash` → 503 ×3 → `null` after 30.8s
  (degrade path works for real). Embeddings fine. No key in any log line.
- **Learned:** ListModels ≠ callable. `gemini-2.5-flash` is listed but returns 404 "no longer available to new
  users" (fell through instantly, no retry — correct). `gemini-flash-lite-latest` also timed out.
- **Trade-off:** worst case ≈ 15s per model (timeout) → with 2 models the user can wait ~30s before the
  degraded answer. Future: overall deadline across models, honor `Retry-After`, stream progress (2.3).

### Manual test checklist — #19
| # | Test | Result |
|---|---|---|
| F1 | Gemini gen down (current reality): trigger alert → matches + "AI hypothesis temporarily unavailable", incident saved in feed | ✅ |
| F2 | Gemini gen up: trigger alert → real hypothesis (retest E1 happy path + resolve) | ⏳ blocked — Gemini still overloaded; retest when it recovers |
| F3 | Bad model name first in `GEMINI_GEN_MODELS` → falls through to next (404, no retry) | ✅ |
| F4 | `GEMINI_API_KEY=invalid` → still 500 "Internal server error" (misconfig ≠ outage) | ✅ |
| F5 | Embedding outage (turn Wi-Fi off; local Mongo still works) → UI shows "AI service is temporarily unavailable…" (our 503) | ✅ |

Committed as `8c9eb92`.

---

## Day 3 — 2026-09-29

### What was built — #4 save-before-AI + #5 persist analysis (+ #13, #16 guard)
- **`/analyze` order:** `Incident.create` (open, no vector) → embed → save vector → rank → hypothesis →
  save `analysis` → `201` + the incident. No AI failure can lose an alert; bad input fails before any AI cost.
- **Embedding outage** → still our 503, message now "Incident saved, but AI analysis is unavailable…"
  (tells the engineer not to resubmit → no duplicate).
- **Schema `analysis`** `{ matches[], hypothesis, confidence, aiUnavailable, analyzedAt }`, no default:
  absent = never analyzed (seed/v1, or embedding down) ≠ analyzed-with-no-matches.
  Matches are **snapshots** (+ `incidentId`), not refs: a record of what the engineer saw at that time.
- **#16 guard:** `rankIncidents` skips vectors whose length ≠ the new one (empty = saved during outage,
  or another model). Needed now: an unembedded incident can be resolved and enter retrieval → `NaN` sort.
- **Frontend:** `resultFromIncident(inc)` builds the detail view for new alert, feed click and resolve alike.
  No more fabricated `matches: []` / `confidence: "low"` → **#13 fixed** (badge only when there's a confidence).
  Resolved incidents show a **Resolution** card above the AI hypothesis (real fix vs. AI guess).
  Unanalyzed incidents: "No AI analysis on record", matches section hidden. Failed trigger refreshes the feed.

### Verified by script
- Never-analyzed doc has no `analysis` key ✅; degraded analysis (`hypothesis: null`) validates ✅;
  bad `confidence` rejected ✅; rank with `[1,0,0]` vs `[1,0,0]`, `[]`, `[1,0]` → 1 result, similarity 1 ✅. Frontend builds ✅.

### Known gaps (follow-ups)
- An incident saved during an embedding outage is never analyzed later → add `POST /:id/analyze` (re-run).
- Missing required field is now a Mongoose `ValidationError` → still generic 500 (A5) → zod → 400.

### Manual test checklist — #4/#5
| # | Test | Result |
|---|---|---|
| G1 | Trigger alert → click another incident, click back, reload page → same matches/hypothesis (or AI-unavailable note) | ✅ |
| G2 | Wi-Fi off, trigger → "Incident saved, but AI analysis is unavailable…"; incident appears in feed; shows "No AI analysis on record", no badge | ✅ |
| G3 | Wi-Fi on, resolve the G2 incident, trigger a similar alert → works, no crash (unembedded incident skipped) | ✅ |
| G4 | Click a resolved seed incident → Resolution card, no "LOW CONFIDENCE" badge (#13) | ✅ |
| G5 | Resolve an analyzed incident → Resolution card appears at once, analysis still shown | ✅ |
| G6 | Compass: newest incident has an `analysis` subdocument | ✅ |
