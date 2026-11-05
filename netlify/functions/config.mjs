// Tells the frontend whether a password is required (never reveals it).
export default async () =>
  new Response(
    JSON.stringify({
      passwordRequired: Boolean(process.env.APP_PASSWORD),
      keyConfigured: Boolean(process.env.SUNO_API_KEY),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
