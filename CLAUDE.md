# IncidentIQ — context for Claude

RAG-grounded on-call incident-memory assistant (MERN + Gemini). When a new alert
fires, it retrieves similar *resolved* past incidents and drafts a root-cause
hypothesis grounded only in them. Engineers resolve incidents, which feeds back
into future retrieval.

## How to work with me (the developer)
- I'm building this to learn deeply and to present in interviews.
- **Explain the "why" before each change**, then make it. No silent changes.
- Keep changes small and focused, one concern per commit.
- After changing code, tell me exactly how to run/verify it.
- Never read, print, or commit `backend/.env` (holds MONGODB_URI, GEMINI_API_KEY).

## Stack
- Frontend: React 18 + Vite 5 + Tailwind 3 (`frontend/`), dev server :5173, proxies `/api` -> :5000
- Backend: Node (ESM) + Express 4 + Mongoose 8 (`backend/`), port 5000
- DB: MongoDB (local for now; Atlas planned)
- AI: `@google/generative-ai` — `gemini-embedding-001` (embeddings), `gemini-3.6-flash` (hypothesis)

## Commands
```bash
cd backend && npm install && npm run seed && npm start   # seed = 15 sample incidents
cd frontend && npm install && npm run dev
```

## Key files
- `backend/server.js` — Express app, CORS, JSON, mounts `/api/incidents`, connects Mongo then listens
- `backend/models/Incident.js` — schema: title, service, errorType, description, stackTrace, rootCause, resolution, status(open|resolved), embedding[Number], createdAt
- `backend/utils/embed.js` — `getEmbedding()`, `cosineSimilarity()`, `rankIncidents()`
  score = 0.7*cosine + 0.15 (same service) + 0.15*exp(-ageDays/180); top 5
- `backend/routes/incidents.js`
  - `GET /` list incidents
  - `POST /analyze` embed -> rank resolved -> floor similarity > 0.55 -> Gemini hypothesis (cite past incidents) -> save as open
    confidence: >0.8 high, >0.65 medium, else low
  - `PATCH /:id/resolve` save rootCause + resolution, status=resolved (feedback loop)
- `backend/seed/` — seed script + 15 incidents JSON
- `frontend/src/App.jsx` — layout, alert form (collapsible), stats
- `frontend/src/components/AlertFeed.jsx` — incident list
- `frontend/src/components/IncidentDetail.jsx` — hypothesis, confidence badge, match signal bars, ResolveForm

## Known v1 issues (v2 backlog)
1. `GET /` and `PATCH` lack error handling — an async rejection (e.g. invalid ObjectId) crashes Node
   (Node 24 exits on unhandled rejection → one bad request kills the server). Also: a valid but
   nonexistent id makes `PATCH` return `200 null` instead of 404
2. `GET /` returns full embeddings (3072 floats each) to the browser — and so does `POST /analyze`
   (it returns the whole saved `incident` document)
3. Frontend doesn't check `res.ok` — a 500 from `/analyze` crashes IncidentDetail (blank screen; no
   error boundary, so React unmounts the whole app). `loadIncidents()` has no error handling at all
4. Incident saved only after the LLM call — a Gemini failure loses the incident
5. Analysis (matches/hypothesis) not persisted — past open incidents can't show it
6. Recency: half-life is ~125d not 180, it's additive (unrelated-but-recent gets +0.15), seed has no dates.
   Bigger bug: top-5 is cut by *blended* score *before* the similarity > 0.55 filter, and confidence
   uses `topMatches[0].similarity` (best blended, not most similar). Filter first; confidence = max similarity
7. Only `description` is embedded (not title/errorType)
8. No input validation, auth, rate limiting, helmet, CORS allowlist; `err.message` leaked in 500s; prompt injection unhandled
9. Legacy Gemini SDK — evaluate migrating to `@google/genai`
10. O(N) in-memory similarity over all resolved incidents — move to Atlas Vector Search
11. `npm run seed` runs `Incident.deleteMany({})` — wipes every incident you resolved (kills the feedback
    loop). Delete only seed docs, or refuse on non-empty data
12. `PATCH` accepts empty `rootCause`/`resolution` (feeds `Root cause: ` into future prompts) and can
    overwrite already-resolved incidents
13. Selecting an incident from the feed hard-codes `confidence: "low"` (`App.jsx` ~L98) — resolved incidents show LOW CONFIDENCE
14. LLM context includes past rootCause/resolution but not their `description`/`errorType` — model
    can't compare symptoms it never sees
15. Stored prompt injection: resolved rootCause/resolution is user text replayed into every future prompt
16. Latent traps: `cosineSimilarity` returns `NaN` on empty/mismatched-length vectors (breaks sort — will
    bite once save-before-LLM stores `embedding: []`); no `embeddingModel` stored per doc (an SDK/model
    change silently makes vectors incomparable); no embedding `taskType` (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY)
17. `dotenv.config()` called in 3 files (ESM imports run before `server.js` body) — use one
    `import "dotenv/config"` as the first line of `server.js` and `seed.js`
18. Doc drift: README says Atlas (we use local), mentions a pre-filled sample form (it's empty), lists
    resolve flow as a stretch goal (it's built), has two "### 3." headings; model names hard-coded in 2 files (move to env)

## v2 roadmap
- **2.0 Hardening:** error contract (asyncHandler/notFound/errorHandler, PATCH 404), res.ok handling +
  error boundary, strip embeddings, zod validation with per-field length limits (`express.json()`
  already caps bodies at 100kb), non-empty resolve fields, helmet, CORS allowlist, rate limits,
  single dotenv + env check on boot, `/health`, save-before-LLM (+ guard empty/mismatched vectors),
  persist analysis, safe seed, SDK migration (+ store `embeddingModel`), models via env
- **2.1 Retrieval quality:** filter-before-top-k + max-similarity confidence, fix recency, embed
  title/errorType too, embedding taskType, richer LLM context, dated seed data, eval script
  (precision@k, MRR), Atlas Vector Search with service prefilter
- **2.2 Auth:** users with `admin` / `engineer` roles, protected routes (e.g. only engineers+ resolve,
  admins manage users/seed)
- **2.3 Production-grade UI redesign:** full redesign — routing, incident pages, search/filters,
  streaming hypothesis, toasts/skeletons, correct confidence for past incidents
- **2.4 Webhooks:** ingestion endpoint with HMAC signature + idempotency, API keys (built on 2.2 auth),
  dedupe duplicate open alerts
- **2.5 Ship:** tests (vitest + supertest + mongodb-memory-server), GitHub Actions CI, Docker, deploy,
  pino logging, README fixes + architecture diagram + demo GIF

## Status
- v1 committed (b5ae29e) and pushed to github.com/ShivKumarYadavS123/Incident-IQ
- Next: v2.0, starting with issue #1

## NOTE
-"Never push or commit without asking me."
