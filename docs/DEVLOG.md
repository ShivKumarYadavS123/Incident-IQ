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
