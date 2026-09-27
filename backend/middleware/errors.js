import mongoose from "mongoose";

// Express 4 doesn't catch rejected promises from async handlers — an
// unhandled rejection crashes Node. This forwards them to errorHandler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Create an error that errorHandler will send with this status + message.
export const httpError = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });

// Mounted after all routes: any unmatched URL gets a JSON 404.
export const notFound = (req, res, next) => {
  next(httpError(404, "Not found")); // fixed text: never reflect client input
};

// Single place every error ends up. Response shape is always { error: string }.
// Only errors marked expose: true (our httpError, body-parser's 4xx) keep their
// status + message. Anything else — e.g. a Gemini SDK error carrying Google's
// 400/429 — becomes a generic 500; details are logged here, never sent.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Fixed text for client-input errors: never reflect client input back
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: "Internal server error" });
};
