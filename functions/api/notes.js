import { neon } from "@neondatabase/serverless";

const SOURCE_TYPES = ["chat_capture", "meeting_transcript", "manual"];
const EMBEDDING_MODEL = "voyage-3.5"; // 1024-dim (default), matches notes.embedding column

export async function onRequest(context) {
  const sql = neon(context.env.DATABASE_URL);
  const method = context.request.method;

  try {
    if (method === "POST") return await addNote(sql, context);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- POST: create a note ----------------------------------------------------
// Body: { content, source_type, session_id?, meeting_id?, item_id?, tags? }
async function addNote(sql, context) {
  const b = await context.request.json();

  const content = (b.content || "").trim();
  if (!content) return json({ error: "content required" }, 400);

  const sourceType = SOURCE_TYPES.includes(b.source_type) ? b.source_type : null;
  if (!sourceType) {
    return json({ error: `source_type must be one of ${SOURCE_TYPES.join(", ")}` }, 400);
  }

  const sessionId = b.session_id || null;
  const meetingId = b.meeting_id != null ? Number(b.meeting_id) : null;
  const itemId = b.item_id != null ? Number(b.item_id) : null;
  const tags = Array.isArray(b.tags) ? b.tags : [];

  const embedding = await embed(content, context.env.VOYAGE_API_KEY);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  const rows = await sql`
    INSERT INTO notes
      (content, source_type, session_id, meeting_id, item_id, tags, embedding)
    VALUES
      (${content}, ${sourceType}, ${sessionId}, ${meetingId}, ${itemId}, ${tags},
       ${embeddingLiteral}::vector)
    RETURNING id, content, source_type, session_id, meeting_id, item_id, tags, created_at
  `;
  return json(rows[0], 200);
}

// --- embeddings --------------------------------------------------------------
// input_type: "document" tells Voyage this text is being stored for later
// retrieval (vs. "query", which the search endpoint will use) — asymmetric
// embeddings tuned per-side improve retrieval quality over a single shared prompt.
async function embed(text, apiKey) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [text],
      input_type: "document",
      output_dimension: 1024,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`embedding request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

