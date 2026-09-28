import mongoose from "mongoose";

// A snapshot of one retrieved past incident, as the engineer saw it at
// analysis time — copied, not referenced, so later edits don't rewrite history.
const MatchSchema = new mongoose.Schema(
  {
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident" },
    title: String,
    service: String,
    rootCause: String,
    resolution: String,
    similarity: Number,
    createdAt: Date
  },
  { _id: false }
);

// The RAG result for an incident. Absent = never analyzed (v1/seed data, or
// the embedding call failed) — distinct from "analyzed, no matches".
const AnalysisSchema = new mongoose.Schema(
  {
    matches: { type: [MatchSchema], default: [] },
    hypothesis: { type: String, default: null },   // null when every Gemini model failed
    confidence: { type: String, enum: ["low", "medium", "high"] },
    aiUnavailable: { type: Boolean, default: false },
    analyzedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

// One "incident" = one past (or current) production problem.
// This is the core data shape your whole project is built around.
const IncidentSchema = new mongoose.Schema({
  title: { type: String, required: true },        // short name, e.g. "Checkout API 500 errors"
  service: { type: String, required: true },       // which microservice/component, e.g. "payments-service"
  errorType: { type: String, default: "" },       // optional — e.g. "ConnectionPoolExhausted", "RateLimitExceeded"
  description: { type: String, required: true },   // what happened, in plain language (this is what gets embedded)
  stackTrace: { type: String, default: "" },        // optional raw error text
  rootCause: { type: String, default: "" },         // filled in once resolved
  resolution: { type: String, default: "" },        // how it was fixed
  status: {
    type: String,
    enum: ["open", "resolved"],
    default: "open"
  },
  embedding: { type: [Number], default: [] },       // vector representation of `description`
  analysis: { type: AnalysisSchema, default: undefined },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Incident", IncidentSchema);