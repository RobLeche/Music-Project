// Suno requires a callBackUrl. The app polls for results instead, so this
// endpoint simply acknowledges the callback so Suno doesn't retry.
export default async () =>
  new Response(JSON.stringify({ code: 200, msg: "received" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
