import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Turns text into a vector (list of numbers) that captures its *meaning*.
// Two similar-meaning incidents will produce vectors that are close together.
// Uses Gemini's free embedding model.
export async function getEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// Cosine similarity: measures how "close" two vectors are (1 = identical, 0 = unrelated).
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// THE CORE RAG LOGIC of this project.
// Given a new incident + all past incidents, find the most relevant past ones —
// weighted by (1) semantic similarity, (2) same service, (3) recency.
export function rankIncidents(newEmbedding, newService, pastIncidents) {
  const now = Date.now();
  const DAY = 1000 * 60 * 60 * 24;

  const scored = pastIncidents.map((incident) => {
    const similarity = cosineSimilarity(newEmbedding, incident.embedding);

    // Same service gets a boost — a payments bug is more relevant to another
    // payments bug than to a similarly-worded bug in an unrelated service.
    const serviceBoost = incident.service === newService ? 0.15 : 0;

    // Recency decay — older incidents matter less, but never drop to zero,
    // since a well-known recurring bug from a year ago can still be relevant.
    const ageInDays = (now - new Date(incident.createdAt).getTime()) / DAY;
    const recencyWeight = Math.exp(-ageInDays / 180); // ~half-life of 180 days

    const finalScore = similarity * 0.7 + serviceBoost + recencyWeight * 0.15;

    return { incident, similarity, finalScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, 5); // top 5 most relevant past incidents
}
