export async function onRequest(context) {
  const obj = await context.env.NATEPAREIL.get("daily.html");

  if (!obj) {
    return new Response("No edition today.", { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
