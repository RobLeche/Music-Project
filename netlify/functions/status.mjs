import { guard, suno, json } from "./_lib/suno.mjs";

export default async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,100}$/.test(taskId)) return json(400, { error: "Missing or invalid taskId" });
  return suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
};
