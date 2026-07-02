import { neon } from "@neondatabase/serverless";

export async function onRequest(context) {
  const sql = neon(context.env.DATABASE_URL);
  const method = context.request.method;

  try {
    if (method === "GET") return await readToday(sql);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- GET: today's notes -----------------------------------------------------
// Plain chronological filter, no embedding call — cheap, powers /journal on
// page load. Ascending order: reads top-to-bottom the way the day happened,
// same direction the page itself gets written in.
async function readToday(sql) {
  const rows = await sql`
    SELECT id, content, source_type, tags, item_id, meeting_id, created_at
    FROM notes
    WHERE created_at >= CURRENT_DATE
      AND created_at < CURRENT_DATE + INTERVAL '1 day'
    ORDER BY created_at ASC
  `;
  return json(rows, 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
