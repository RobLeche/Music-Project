import { guard, suno, json, callbackUrl } from "./_lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];
const clamp01 = (v) => Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100;
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";
  const body = { customMode, instrumental, model, callBackUrl: callbackUrl() };

  const style = str(input.style, 1000);
  const lyrics = str(input.lyrics, 5000);

  if (!customMode) {
    // Simple mode: describe the song; lyrics are written automatically.
    const prompt = str(input.prompt, 3000);
    if (!prompt && !style) return json(400, { error: "Describe the song you want." });
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
    if (lyrics && !instrumental) body.lyrics = lyrics;
  } else {
    // Custom mode: full control over style, lyrics and title.
    const title = str(input.title, 80);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json(400, { error: "Custom mode needs at least a style or lyrics." });
    }
    if (!instrumental && !lyrics) {
      return json(400, { error: "Add lyrics, or switch on Instrumental." });
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics && !instrumental) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && ["m", "f"].includes(input.vocalGender)) body.vocalGender = input.vocalGender;
    if (input.duration !== undefined && input.duration !== "") {
      const d = Math.round(Number(input.duration));
      if (Number.isFinite(d)) body.duration = Math.min(360, Math.max(10, d));
    }
    if (input.styleWeight !== undefined) body.styleWeight = clamp01(input.styleWeight);
    if (input.weirdnessConstraint !== undefined) body.weirdnessConstraint = clamp01(input.weirdnessConstraint);
    if (input.variety !== undefined) body.variety = Math.min(4, Math.max(0, Math.round(Number(input.variety)) || 0));
  }

  return suno("/api/v1/generate", { method: "POST", body });
};
