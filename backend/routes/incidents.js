import dotenv from "dotenv";
dotenv.config();
import express from "express";
import Incident from "../models/Incident.js";
import { getEmbedding, rankIncidents } from "../utils/embed.js";
import { generateHypothesis, isUpstreamOutage } from "../utils/gemini.js";
import { asyncHandler, httpError } from "../middleware/errors.js";

const router = express.Router();

// GET all incidents (for the alert feed list on the left panel)
router.get("/", asyncHandler(async (req, res) => {
  const incidents = await Incident.find().sort({ createdAt: -1 });
  res.json(incidents);
}));

// POST a brand-new incident (simulates an alert firing).
// This is the main RAG endpoint: embed the new incident, retrieve similar
// past ones, then ask the LLM to draft a root-cause hypothesis grounded in them.
router.post("/analyze", asyncHandler(async (req, res) => {
  const { title, service, errorType, description, stackTrace } = req.body;

  // 1. Embed the new incident's description. Without a vector we can't
  // retrieve or save anything useful, so an outage here fails the request —
  // as our own 503, never Google's status passed through.
  let newEmbedding;
  try {
    newEmbedding = await getEmbedding(description);
  } catch (err) {
    if (!isUpstreamOutage(err)) throw err; // e.g. invalid key: our bug -> 500
    console.warn("[analyze] embedding unavailable:", err.message);
    throw httpError(503, "AI service is temporarily unavailable — please try again shortly");
  }

  // 2. Retrieve past incidents to compare against
  const pastIncidents = await Incident.find({ status: "resolved" });

  // 3. Rank them by similarity + service match + recency
  const ranked = rankIncidents(newEmbedding, service, pastIncidents);
  const topMatches = ranked.filter((r) => r.similarity > 0.55); // raised from 0.3 — low-similarity matches were creating misleading "medium confidence" results

  let hypothesis = "No sufficiently similar past incident found. This may be a new failure mode — escalate to a human on-call engineer.";
  let confidence = "low";
  let aiUnavailable = false;

  if (topMatches.length > 0) {
    confidence = topMatches[0].similarity > 0.8 ? "high" : topMatches[0].similarity > 0.65 ? "medium" : "low";

    // 4. Ask the LLM to draft a hypothesis, GROUNDED in the retrieved incidents.
    // This is what stops it from hallucinating a random guess.
    const context = topMatches
      .map(
        (m, i) =>
          `Past Incident #${i + 1} (similarity: ${m.similarity.toFixed(2)}):
Title: ${m.incident.title}
Service: ${m.incident.service}
Root cause: ${m.incident.rootCause}
Resolution: ${m.incident.resolution}`
      )
      .join("\n\n");

    const prompt = `You are an on-call engineering assistant. Given a new incident and similar past incidents, draft a short, specific root-cause hypothesis. ONLY use information from the provided past incidents — cite which past incident # you're drawing from. If the past incidents don't clearly explain the new one, say so honestly instead of guessing.

New incident:
Title: ${title}
Service: ${service}
Error type: ${errorType}
Description: ${description}
Stack trace: ${stackTrace || "none provided"}

Similar past incidents:
${context}

Draft a root-cause hypothesis for the new incident, citing which past incident(s) support it.`;

    // Tries each model in GEMINI_GEN_MODELS with retries; null = all failed.
    // Degrade instead of failing: the retrieved matches are still useful.
    hypothesis = await generateHypothesis(prompt);
    aiUnavailable = hypothesis === null;
  }

  // 5. Save the new incident (as "open" — not yet resolved)
  const newIncident = await Incident.create({
    title, service, errorType, description, stackTrace,
    embedding: newEmbedding,
    status: "open"
  });

  res.json({
    incident: newIncident,
    matches: topMatches.map((m) => ({
      title: m.incident.title,
      service: m.incident.service,
      rootCause: m.incident.rootCause,
      resolution: m.incident.resolution,
      similarity: m.similarity,
      createdAt: m.incident.createdAt
    })),
    hypothesis,
    aiUnavailable,
    confidence
  });
}));

// PATCH to mark an incident resolved (closes the feedback loop — future
// retrievals can now learn from this one too)
router.patch("/:id/resolve", asyncHandler(async (req, res) => {
  const { rootCause, resolution } = req.body;
  const updated = await Incident.findByIdAndUpdate(
    req.params.id,
    { rootCause, resolution, status: "resolved" },
    { new: true }
  );
  if (!updated) throw httpError(404, "Incident not found");
  res.json(updated);
}));

export default router;