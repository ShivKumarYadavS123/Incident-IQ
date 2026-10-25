import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // One in-memory mongod for the whole run (started once, before any test file)
    globalSetup: ["tests/setup/globalSetup.js"],
    // Run before every test file: fake Gemini SDK first, then the test database
    setupFiles: ["tests/setup/fakeGemini.js", "tests/setup/db.js"],
    // Fixed fake values. dotenv never overrides a variable that is already set,
    // so the modules that still call dotenv.config() (#17) can't pull your local
    // key or model list into a test run — results are the same locally and in CI.
    env: {
      GEMINI_API_KEY: "test-key",
      GEMINI_EMBED_MODEL: "test-embed",
      GEMINI_GEN_MODELS: "test-gen-a,test-gen-b"
    }
  }
});
