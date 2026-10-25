import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";
import { fakeGemini } from "./helpers/fakeGemini.js";
import { httpFailure, networkFailure } from "./helpers/geminiErrors.js";

// The error contract (middleware/errors.js): every error is { error: string },
// client mistakes get a fixed 4xx text, our own 503 passes through, and
// anything else — including Google's own statuses — is a generic 500.

const newAlert = {
  title: "Checkout requests timing out",
  service: "payments-service",
  errorType: "TimeoutError",
  description: "Checkout API requests time out waiting for a DB connection"
};

const analyze = (body = newAlert) => request(app).post("/api/incidents/analyze").send(body);

beforeEach(() => {
  // errorHandler and withRetry log by design; keep test output readable
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("client errors", () => {
  it("400 'Invalid id' for a malformed id", async () => {
    const res = await request(app)
      .patch("/api/incidents/not-an-id/resolve")
      .send({ rootCause: "x", resolution: "y" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid id" });
  });

  it("404 'Incident not found' for a valid id that doesn't exist", async () => {
    const res = await request(app)
      .patch(`/api/incidents/${new mongoose.Types.ObjectId()}/resolve`)
      .send({ rootCause: "x", resolution: "y" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Incident not found" });
  });

  it("404 'Not found' for an unknown route, without echoing the URL back", async () => {
    const res = await request(app).get("/api/no-such-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("400 'Invalid JSON body' for malformed JSON, before any AI call", async () => {
    const res = await request(app)
      .post("/api/incidents/analyze")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
    expect(fakeGemini.embedContent).not.toHaveBeenCalled();
  });
});

describe("Gemini errors", () => {
  it.each([400, 404])("SDK %i -> generic 500; the detail is logged, never sent", async (status) => {
    fakeGemini.embedContent.mockRejectedValue(httpFailure(status));

    const res = await analyze();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" }); // exact: no SDK text leaks
    expect(console.error).toHaveBeenCalledWith(
      "[POST /api/incidents/analyze]",
      expect.objectContaining({ status })
    );
    expect(fakeGemini.embedContent).toHaveBeenCalledTimes(1); // not retryable
  });

  // Uses the real backoff (~0.5s + ~1s), so each case takes ~1.5-2.3s
  it.each([429, 503])("SDK %i -> retried 3 times, then our own 503", async (status) => {
    fakeGemini.embedContent.mockRejectedValue(httpFailure(status));

    const res = await analyze();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "Incident saved, but AI analysis is unavailable right now — please try again shortly"
    });
    expect(fakeGemini.embedContent).toHaveBeenCalledTimes(3);
  });

  it("timeout / network failure -> our own 503 at once, no retry", async () => {
    fakeGemini.embedContent.mockRejectedValue(networkFailure());

    const res = await analyze();

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/^Incident saved, but AI analysis is unavailable/);
    expect(fakeGemini.embedContent).toHaveBeenCalledTimes(1);
  });
});
