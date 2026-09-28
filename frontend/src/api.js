const UNREACHABLE = "Can't reach the server — is the backend running?";

// Every call to our backend goes through here. Returns parsed JSON on success;
// otherwise throws an Error whose message is safe to show the user.
export async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    // Network failure: connection refused, DNS, CORS, offline
    throw new Error(UNREACHABLE);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Body isn't JSON — handled below
  }

  if (!res.ok) {
    // Our backend always answers errors as JSON { error }. A non-JSON error
    // body came from something in between — in dev, the Vite proxy replying
    // 5xx because the backend is down. That means the server is unreachable.
    throw new Error(typeof data?.error === "string" ? data.error : UNREACHABLE);
  }
  if (data === null) {
    throw new Error("Unexpected response from server");
  }
  return data;
}
