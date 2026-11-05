import { guard, suno } from "./_lib/suno.mjs";

export default async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;
  return suno("/api/v1/generate/credit");
};
