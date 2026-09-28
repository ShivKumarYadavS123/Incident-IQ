// Lists the Gemini models this API key can use for generateContent.
// Usage (from backend/): node scripts/list-models.mjs
// Never prints the key: it's sent as a header, not in the URL.
import "dotenv/config";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set");
  process.exit(1);
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const names = [];
let pageToken = "";

do {
  const url = `${BASE}?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
  const res = await fetch(url, { headers: { "x-goog-api-key": key } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`ListModels failed: ${res.status} ${data.error?.message ?? ""}`);
    process.exit(1);
  }
  for (const m of data.models ?? []) {
    if (m.supportedGenerationMethods?.includes("generateContent")) {
      names.push(m.name.replace(/^models\//, ""));
    }
  }
  pageToken = data.nextPageToken ?? "";
} while (pageToken);

console.log(names.sort().join("\n"));
