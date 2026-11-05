import { guard, suno, json, callbackUrl } from "./_lib/suno.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const blocked = guard(req);
  if (blocked) return blocked;
  let input;
  try {
    input = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 200) : "";
  if (!prompt) return json(400, { error: "Describe what the lyrics should be about." });
  return suno("/api/v1/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl() } });
};
