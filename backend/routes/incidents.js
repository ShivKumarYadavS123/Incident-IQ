import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Incident from "../models/Incident.js";
import { getEmbedding, rankIncidents } from "../utils/embed.js";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// GET all incidents (for the alert feed list on the left panel)
router.get("/", async (req, res) => {
  const incidents = await Incident.find().sort({ createdAt: -1 });
  res.json(incidents);
});

// POST a brand-new incident (simulates an alert firing).
// This is the main RAG endpoint: embed the new incident, retrieve similar
// past ones, then ask the LLM to draft a root-cause hypothesis grounded in them.
router.post("/analyze", async (req, res) => {
  try {
    const { title, service, errorType, description, stackTrace } = req.body;

    // 1. Embed the new incident's description
    const newEmbedding = await getEmbedding(description);

    // 2. Retrieve past incidents to compare against
    const pastIncidents = await Incident.find({ status: "resolved" });

    // 3. Rank them by similarity + service match + recency
    const ranked = rankIncidents(newEmbedding, service, pastIncidents);
    const topMatches = ranked.filter((r) => r.similarity > 0.55); // raised from 0.3 — low-similarity matches were creating misleading "medium confidence" results

    let hypothesis = "No sufficiently similar past incident found. This may be a new failure mode — escalate to a human on-call engineer.";
    let confidence = "low";

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

      const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

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

      const genResult = await model.generateContent(prompt);
      hypothesis = genResult.response.text();
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
      confidence
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

// PATCH to mark an incident resolved (closes the feedback loop — future
// retrievals can now learn from this one too)
router.patch("/:id/resolve", async (req, res) => {
  const { rootCause, resolution } = req.body;
  const updated = await Incident.findByIdAndUpdate(
    req.params.id,
    { rootCause, resolution, status: "resolved" },
    { new: true }
  );
  res.json(updated);
});

export default router;