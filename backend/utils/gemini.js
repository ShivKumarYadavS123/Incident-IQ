import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";

const RETRYABLE_STATUS = new Set([429, 503]); // rate-limited / overloaded: waiting can help
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500; // backoff: ~0.5s, ~1s (+ jitter)
const TIMEOUT_MS = 15_000;

// Env is read at call time, not import time — ESM imports run before any
// dotenv.config() in the importing file's body, so import-time reads can see nothing.
let client;
function getModel(name) {
  client ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: name }, { timeout: TIMEOUT_MS });
}

// Changing this invalidates every stored vector — see backlog #16
export const embedModelName = () => process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

const genModelNames = () =>
  (process.env.GEMINI_GEN_MODELS || "gemini-3.5-flash-lite,gemini-3.8-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google overloaded, rate-limited, timed out or unreachable — not our bug.
// SDK errors without an HTTP status are timeouts / network failures.
export const isUpstreamOutage = (err) =>
  err instanceof GoogleGenerativeAIError &&
  (err.status === undefined || RETRYABLE_STATUS.has(err.status));

// Calls fn(model), retrying with exponential backoff on 429/503 only.
// Anything else (timeout, 400, 404) is thrown at once — retrying won't help.
export async function withRetry(modelName, fn) {
  const model = getModel(modelName);
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(model);
    } catch (err) {
      console.warn(
        `[gemini] ${modelName} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.status ?? "timeout/network"}`
      );
      if (!RETRYABLE_STATUS.has(err.status) || attempt === MAX_ATTEMPTS) throw err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay + Math.random() * delay * 0.5);
    }
  }
}

// Tries each model in GEMINI_GEN_MODELS in order. Returns the hypothesis text,
// or null if every model failed — the caller degrades to matches-only.
export async function generateHypothesis(prompt) {
  for (const name of genModelNames()) {
    try {
      const result = await withRetry(name, (model) => model.generateContent(prompt));
      return result.response.text();
    } catch (err) {
      // SDK messages contain the request URL but never the key (sent as a header)
      console.warn(`[gemini] giving up on ${name}: ${err.message}`);
    }
  }
  return null;
}
