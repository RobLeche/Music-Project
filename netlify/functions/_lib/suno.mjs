const BASE_URL = "https://api.sunoapi.org";

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Returns a Response if the request should be rejected, otherwise null. */
export function guard(req) {
  if (!process.env.SUNO_API_KEY) {
    return json(500, { error: "Server is missing the SUNO_API_KEY environment variable." });
  }
  const pw = process.env.APP_PASSWORD;
  if (pw && req.headers.get("x-app-password") !== pw) {
    return json(401, { error: "Incorrect or missing app password.", needsPassword: true });
  }
  return null;
}

export function callbackUrl() {
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://example.com";
  return `${site.replace(/\/$/, "")}/.netlify/functions/callback`;
}

/** Calls the Suno API and normalises the result into { ok, status, data | error }. */
export async function suno(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return json(502, { error: `Could not reach Suno API: ${err.message}` });
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return json(502, { error: `Suno API returned a non-JSON response (HTTP ${res.status}).` });
  }

  // Suno returns HTTP 200 with its own "code" field; treat non-200 codes as errors.
  const code = payload?.code ?? res.status;
  if (!res.ok || code !== 200) {
    const messages = {
      400: "Invalid parameters",
      401: "Unauthorized - check the SUNO_API_KEY",
      405: "Rate limit exceeded - try again shortly",
      413: "Prompt or style is too long",
      429: "Insufficient credits on the Suno API account",
      430: "Requests are too frequent - slow down",
      455: "Suno API is under maintenance",
    };
    const status = code >= 400 && code < 600 ? code : 502;
    return json(status, { error: payload?.msg || messages[code] || `Suno API error (code ${code})`, code });
  }
  return json(200, { data: payload.data });
}
