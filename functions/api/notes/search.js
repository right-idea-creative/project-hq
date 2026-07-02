import { neon } from "@neondatabase/serverless";

const EMBEDDING_MODEL = "voyage-3.5"; // must match notes.js — same model/dims for query + document embeddings
const OUTPUT_DIMENSION = 1024;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Recency half-life: how many days until a note's recency weight decays to 0.5.
// Tune this single number to make ranking lean more/less toward recent notes.
const HALF_LIFE_DAYS = 30;

export async function onRequest(context) {
  const sql = neon(context.env.DATABASE_URL);
  const method = context.request.method;

  try {
    if (method === "GET") return await search(sql, context);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- GET: semantic search ---------------------------------------------------
// Query params: q (required), date_from?, date_to?, limit?
async function search(sql, context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "q required" }, 400);

  const dateFrom = url.searchParams.get("date_from") || null;
  const dateTo = url.searchParams.get("date_to") || null;

  const limitParam = Number(url.searchParams.get("limit"));
  const limit = limitParam > 0 && limitParam <= MAX_LIMIT ? limitParam : DEFAULT_LIMIT;

  const embedding = await embed(q, context.env.VOYAGE_API_KEY);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  // A stated date range narrows the pool AND overrides recency-weighting —
  // if you asked for "last week," you want the best match within last week,
  // not last week's notes further re-biased toward whichever day was most recent.
  const rows =
    dateFrom || dateTo
      ? await searchWithRange(sql, embeddingLiteral, dateFrom, dateTo, limit)
      : await searchRecencyWeighted(sql, embeddingLiteral, limit);

  return json(rows, 200);
}

async function searchRecencyWeighted(sql, embeddingLiteral, limit) {
  // similarity: 1 - cosine_distance, range [0,1] for normalized embeddings (higher = closer)
  // recency: exponential decay by age in days, range (0,1], = 0.5 at HALF_LIFE_DAYS
  // score: similarity * recency — a highly-similar old note can still surface,
  // but among similar notes, more recent ones rank higher.
  return await sql`
    SELECT
      id, content, source_type, tags, item_id, meeting_id, created_at,
      1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity,
      EXP(
        -LN(2) * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 / ${HALF_LIFE_DAYS}
      ) AS recency,
      (1 - (embedding <=> ${embeddingLiteral}::vector)) *
      EXP(
        -LN(2) * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 / ${HALF_LIFE_DAYS}
      ) AS score
    FROM notes
    ORDER BY score DESC
    LIMIT ${limit}
  `;
}

async function searchWithRange(sql, embeddingLiteral, dateFrom, dateTo, limit) {
  return await sql`
    SELECT
      id, content, source_type, tags, item_id, meeting_id, created_at,
      1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
    FROM notes
    WHERE (${dateFrom}::date IS NULL OR created_at >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR created_at < (${dateTo}::date + INTERVAL '1 day'))
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}

// --- embeddings --------------------------------------------------------------
// input_type: "query" — asymmetric to the "document" type used when notes are
// stored (notes.js). Same model, different prompt Voyage prepends internally;
// meaningfully improves retrieval quality over embedding both sides the same way.
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
      input_type: "query",
      output_dimension: OUTPUT_DIMENSION,
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
