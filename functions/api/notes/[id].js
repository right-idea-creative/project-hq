import { neon } from "@neondatabase/serverless";

export async function onRequest(context) {
  const sql = neon(context.env.DATABASE_URL);
  const method = context.request.method;

  try {
    if (method === "PATCH") return await updateTags(sql, context);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- PATCH: update a note's tags ---------------------------------------------
// URL: /api/notes/:id   Body: { tags: [...] }
async function updateTags(sql, context) {
  const id = Number(context.params.id);
  if (!id) return json({ error: "valid id required" }, 400);

  const b = await context.request.json();
  if (!Array.isArray(b.tags)) return json({ error: "tags array required" }, 400);

  const rows = await sql`
    UPDATE notes
    SET tags = ${b.tags}
    WHERE id = ${id}
    RETURNING id, content, source_type, tags, item_id, meeting_id, created_at
  `;

  if (!rows.length) return json({ error: "not found" }, 404);
  return json(rows[0], 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
