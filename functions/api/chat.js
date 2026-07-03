// Thin proxy to n8n. No DB access here — the n8n AI Agent talks to Postgres
// only via /api/notes, /api/notes/search, /api/tasks, same as the browser
// would. This function's only job is to keep the n8n webhook URL (and any
// auth on it) off the client.

export async function onRequest(context) {
  const method = context.request.method;

  try {
    if (method === "POST") return await forwardToAgent(context);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- POST: forward a chat turn to the n8n AI Agent --------------------------
// Body: { text, session_id }
// Response (passed through from n8n's "Respond to Webhook" node): { reply, tags }
async function forwardToAgent(context) {
  const b = await context.request.json();

  const text = (b.text || "").trim();
  if (!text) return json({ error: "text required" }, 400);

  const sessionId = (b.session_id || "").trim();
  if (!sessionId) return json({ error: "session_id required" }, 400);

  const res = await fetch(context.env.N8N_CHAT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `agent request failed (${res.status}): ${detail}` }, 502);
  }

  const data = await res.json();
  return json(
    { reply: data.reply ?? "", tags: data.tags ?? [], note_id: data.note_id ?? null },
    200
  );
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
