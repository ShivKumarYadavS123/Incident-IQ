import { vi } from "vitest";

// The fake Gemini behind every model (wired up in tests/setup/fakeGemini.js).
// Each fn is called as (input, modelName). Set per test, e.g.:
//   fakeGemini.embedContent.mockResolvedValue(embedding([1, 0, 0]));
//   fakeGemini.generateContent.mockRejectedValue(httpFailure(503));
// Must not import the SDK: the mock factory imports this file.
export const fakeGemini = {
  embedContent: vi.fn(),
  generateContent: vi.fn()
};

// Response shapes, as the real SDK returns them
export const embedding = (values) => ({ embedding: { values } });
export const generated = (text) => ({ response: { text: () => text } });
