import { vi, beforeEach } from "vitest";
import { fakeGemini } from "../helpers/fakeGemini.js";

// Replaces the Gemini SDK — our network boundary — in every test file, so no
// test can ever reach Google. Only the client class is faked: the SDK's real
// error classes stay, so our own retry / model-fallback / isUpstreamOutage
// code in utils/gemini.js runs unmodified against them.
vi.mock("@google/generative-ai", async (importOriginal) => {
  const sdk = await importOriginal();
  const { fakeGemini } = await import("../helpers/fakeGemini.js");

  class FakeGoogleGenerativeAI {
    getGenerativeModel({ model }) {
      // The model name is passed along so tests can see which model was called
      return {
        embedContent: (input) => fakeGemini.embedContent(input, model),
        generateContent: (input) => fakeGemini.generateContent(input, model)
      };
    }
  }

  return { ...sdk, GoogleGenerativeAI: FakeGoogleGenerativeAI };
});

// No behaviour carries over between tests: each test says what Gemini does
beforeEach(() => {
  fakeGemini.embedContent.mockReset();
  fakeGemini.generateContent.mockReset();
});
