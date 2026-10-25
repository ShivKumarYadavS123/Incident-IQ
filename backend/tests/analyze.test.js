import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import Incident from "../models/Incident.js";
import { fakeGemini, embedding, generated } from "./helpers/fakeGemini.js";
import { httpFailure, networkFailure } from "./helpers/geminiErrors.js";

// POST /analyze end to end: what it answers AND what it leaves in the database.

const newAlert = {
  title: "Checkout requests timing out",
  service: "payments-service",
  errorType: "TimeoutError",
  description: "Checkout API requests time out waiting for a DB connection"
};

// A resolved past incident. Test vectors have 3 dimensions instead of 3072:
// cosine similarity only depends on direction, so [1,0,0] vs [1,0,0] = 1 and
// [1,0,0] vs [0,1,0] = 0, which keeps expected values obvious.
const createResolved = (overrides = {}) =>
  Incident.create({
    title: "DB connection pool exhausted",
    service: "payments-service",
    description: "Checkout hanging, connection pool at its maximum",
    rootCause: "Pool size of 10 too small for peak traffic",
    resolution: "Raised pool size to 50 and added a pool-wait alert",
    status: "resolved",
    embedding: [1, 0, 0],
    ...overrides
  });

const analyze = (body = newAlert) => request(app).post("/api/incidents/analyze").send(body);

// Which generation models were called, in order
const genModelsCalled = () => fakeGemini.generateContent.mock.calls.map(([, model]) => model);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("happy path", () => {
  it("retrieves the similar resolved incident, grounds the prompt in it, persists the analysis", async () => {
    const past = await createResolved();
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));
    fakeGemini.generateContent.mockResolvedValue(generated("Pool exhaustion again (Past Incident #1)"));

    const res = await analyze();

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect(res.body.analysis).toMatchObject({
      hypothesis: "Pool exhaustion again (Past Incident #1)",
      confidence: "high",
      aiUnavailable: false,
      matches: [{ incidentId: past.id, title: past.title, rootCause: past.rootCause, similarity: 1 }]
    });

    // The description is embedded with the configured model (no fallback for embeddings)
    expect(fakeGemini.embedContent).toHaveBeenCalledExactlyOnceWith(newAlert.description, "test-embed");

    // Grounded: the prompt carries the new alert and the past incident's fix
    const [prompt, model] = fakeGemini.generateContent.mock.calls[0];
    expect(model).toBe("test-gen-a");
    expect(prompt).toContain(newAlert.description);
    expect(prompt).toContain(past.rootCause);
    expect(prompt).toContain(past.resolution);

    // Persisted, not just returned: the vector and the analysis are in the DB
    const saved = await Incident.findById(res.body._id).lean();
    expect(saved.embedding).toEqual([1, 0, 0]);
    expect(saved.analysis.hypothesis).toBe("Pool exhaustion again (Past Incident #1)");
    expect(String(saved.analysis.matches[0].incidentId)).toBe(past.id);
  });
});

describe("save before AI (#4)", () => {
  it("embedding outage: 503, but the alert is saved — open, no vector, no analysis", async () => {
    fakeGemini.embedContent.mockRejectedValue(networkFailure());

    const res = await analyze();

    expect(res.status).toBe(503);
    const all = await Incident.find().lean();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ ...newAlert, status: "open", embedding: [] });
    expect(all[0]).not.toHaveProperty("analysis"); // absent = never analyzed
    expect(fakeGemini.generateContent).not.toHaveBeenCalled();
  });

  it("a non-outage AI error (e.g. invalid key -> 500) still keeps the alert", async () => {
    fakeGemini.embedContent.mockRejectedValue(httpFailure(400));

    const res = await analyze();

    expect(res.status).toBe(500);
    expect(await Incident.countDocuments({ title: newAlert.title, status: "open" })).toBe(1);
  });
});

describe("degrade to matches-only (#19)", () => {
  it("every generation model fails: 201 with the matches, hypothesis null, aiUnavailable", async () => {
    await createResolved();
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));
    fakeGemini.generateContent.mockRejectedValue(networkFailure());

    const res = await analyze();

    expect(res.status).toBe(201);
    expect(res.body.analysis).toMatchObject({ hypothesis: null, aiUnavailable: true, confidence: "high" });
    expect(res.body.analysis.matches).toHaveLength(1);
    expect(genModelsCalled()).toEqual(["test-gen-a", "test-gen-b"]); // every model tried

    const saved = await Incident.findById(res.body._id).lean();
    expect(saved.analysis).toMatchObject({ hypothesis: null, aiUnavailable: true });
  });

  it("a model that is gone (404) falls through to the next one", async () => {
    await createResolved();
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));
    fakeGemini.generateContent
      .mockRejectedValueOnce(httpFailure(404))
      .mockResolvedValueOnce(generated("Answer from model B"));

    const res = await analyze();

    expect(res.status).toBe(201);
    expect(res.body.analysis).toMatchObject({ hypothesis: "Answer from model B", aiUnavailable: false });
    expect(genModelsCalled()).toEqual(["test-gen-a", "test-gen-b"]); // 404: no retry on model A
  });
});

describe("retrieval", () => {
  it("no similar past incident: honest 'new failure mode' answer, and no LLM call", async () => {
    await createResolved({ embedding: [0, 1, 0] }); // similarity 0
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));

    const res = await analyze();

    expect(res.status).toBe(201);
    expect(res.body.analysis).toMatchObject({ matches: [], confidence: "low", aiUnavailable: false });
    expect(res.body.analysis.hypothesis).toMatch(/^No sufficiently similar past incident found/);
    expect(fakeGemini.generateContent).not.toHaveBeenCalled();
  });

  it("only resolved incidents are retrieved — an identical open one is ignored", async () => {
    await createResolved({ status: "open", rootCause: "", resolution: "" });
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));

    const res = await analyze();

    expect(res.body.analysis.matches).toEqual([]);
    expect(fakeGemini.generateContent).not.toHaveBeenCalled();
  });

  it("skips past vectors that can't be compared (#16) and still ranks the rest", async () => {
    const good = await createResolved();
    await createResolved({ title: "Saved during an embedding outage", embedding: [] });
    await createResolved({ title: "Embedded by another model", embedding: [1, 0] });
    fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));
    fakeGemini.generateContent.mockResolvedValue(generated("hypothesis"));

    const res = await analyze();

    expect(res.status).toBe(201);
    expect(res.body.analysis.matches.map((m) => m.incidentId)).toEqual([good.id]);
  });
});
