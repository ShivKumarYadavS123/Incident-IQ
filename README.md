# IncidentIQ — RAG-Grounded On-Call Memory Assistant

An on-call assistant that retrieves the most relevant *past* production
incidents when a new alert fires, and drafts a root-cause hypothesis grounded
in that history — instead of an engineer manually searching old Slack threads
and postmortems at 2am.

## How it works (the RAG pipeline)

1. Every past incident is stored with a text embedding of its description.
2. When a new incident comes in, it's embedded the same way.
3. `rankIncidents()` in `backend/utils/embed.js` retrieves the closest past
   incidents, weighted by:
   - semantic similarity (cosine similarity of embeddings)
   - same-service boost (a payments bug matters more to another payments bug)
   - recency decay (older incidents matter less, but never hit zero)
4. The top matches are passed to the LLM as context, and it's explicitly
   instructed to only use that context and cite which past incident it's
   drawing from — this is what keeps it grounded instead of hallucinating.
5. If nothing matches well enough, it honestly says so instead of guessing.

## Setup

### 1. MongoDB Atlas
Create a free cluster at mongodb.com/atlas, get your connection string.

### 2. Gemini API key (free)
Go to https://aistudio.google.com/app/apikey, sign in with Google, click
"Create API key" — no card required for the free tier.

### 3. Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in MONGODB_URI and GEMINI_API_KEY
npm run seed            # loads the 15 sample past incidents + embeddings
npm start                # runs on http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev              # runs on http://localhost:5173
```

Open http://localhost:5173 — you'll see the alert feed on the left. Click
"Trigger Alert" with the pre-filled sample incident (a checkout/payments
error) to see it retrieve the matching past incident and draft a hypothesis.

## What to build next (stretch goals)
- Resolve flow: mark an "open" incident resolved with its root cause, feeding
  it back into future retrieval (closes the feedback loop).
- Swap the in-memory cosine similarity for MongoDB Atlas Vector Search
  (`$vectorSearch` aggregation stage) for a resume-line-worthy detail.
- Slack webhook endpoint so alerts can come from a real source, not just the
  manual form.

## Why this project (for interviews)
This isn't "chat with a PDF." The retrieval is multi-factor (semantic +
service-scoped + time-decayed), it has an explicit confidence/honesty
mechanism instead of forcing an answer, and it's grounded in a real,
common engineering pain point — teams re-solving the same incidents because
institutional memory lives in people's heads, not a searchable system.
