// The SDK's real error classes (the mock keeps them), built the way the SDK
// builds them — so isUpstreamOutage / withRetry see exactly what they see live.
import { GoogleGenerativeAIError, GoogleGenerativeAIFetchError } from "@google/generative-ai";

// Google answered with an HTTP error, e.g. 503 "high demand" or 400 bad key.
// The message carries upstream detail that must never reach a client.
export const httpFailure = (status) =>
  new GoogleGenerativeAIFetchError(
    `Error fetching from https://generativelanguage.googleapis.com/v1beta/models/x: [${status}] upstream detail`,
    status,
    "upstream status text"
  );

// Timeout or network failure: the SDK wraps it with no HTTP status
export const networkFailure = () =>
  new GoogleGenerativeAIError(
    "Error fetching from https://generativelanguage.googleapis.com/v1beta/models/x: This operation was aborted"
  );
