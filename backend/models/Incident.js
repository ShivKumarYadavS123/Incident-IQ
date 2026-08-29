import mongoose from "mongoose";

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
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Incident", IncidentSchema);