import { neon } from "@neondatabase/serverless";

// types that appear in the list view and accept importance/urgency like tasks
const FINITE_TYPES = ["task", "initiative", "trip", "milestone"];
const URGENT_TYPES = ["task", "initiative"]; // get an urgency score + strip

export async function onRequest(context) {
  const sql = neon(context.env.DATABASE_URL);
  const method = context.request.method;

  try {
    if (method === "GET") return await readList(sql);
    if (method === "POST") return await addItem(sql, context);
    if (method === "PUT") return await editItem(sql, context);
    if (method === "PATCH") return await completeItem(sql, context);
    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}

// --- GET: read the list ----------------------------------------------------
async function readList(sql) {
  const rows = await sql`
    SELECT
      id,
      title,
      type,
      category,
      importance,
      body,
      start_date,
      due_date,
      status,
      completed_at,
      urgent_pin,
      GREATEST(
        DATE_PART('day', COALESCE(due_date, start_date)::timestamp - CURRENT_DATE::timestamp),
        0
      ) AS days_left,
      -- urgent if manually pinned, OR (importance >= 4 AND due within the next 2 days)
      (
        urgent_pin
        OR (
          type IN ('task', 'initiative')
          AND importance >= 4
          AND due_date IS NOT NULL
          AND DATE_PART('day', due_date::timestamp - CURRENT_DATE::timestamp) BETWEEN 0 AND 2
        )
      ) AS is_urgent
    FROM items
    WHERE type IN ('task', 'initiative', 'trip', 'milestone')
      AND NOT (type = 'milestone' AND due_date < CURRENT_DATE)
      AND NOT (type = 'trip' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
    ORDER BY COALESCE(due_date, start_date) ASC NULLS LAST, importance DESC NULLS LAST
  `;
  return json(rows, 200);
}

// resolve dates by type: trip uses start+end, others use a single due date
function datesFor(type, b) {
  if (type === "trip") {
    return { start_date: b.due || null, due_date: b.end || null };
  }
  return { start_date: null, due_date: b.due || null };
}

// --- POST: add a new item --------------------------------------------------
// Body: { title, type, category, importance, due, end, body }
async function addItem(sql, context) {
  const b = await context.request.json();

  const title = (b.title || "").trim();
  if (!title) return json({ error: "title required" }, 400);

  const type = FINITE_TYPES.includes(b.type) ? b.type : "task";
  const category = b.category || null;
  const bodyText = b.body || null;
  const importance =
    URGENT_TYPES.includes(type) && b.importance != null ? Number(b.importance) : null;
  const urgentPin = b.urgent_pin === true;
  const { start_date, due_date } = datesFor(type, b);

  const rows = await sql`
    INSERT INTO items
      (title, type, category, importance, body, start_date, due_date, status, urgent_pin, last_tended_at)
    VALUES
      (${title}, ${type}, ${category}, ${importance}, ${bodyText},
       ${start_date}, ${due_date}, 'open', ${urgentPin}, NOW())
    RETURNING id, title, type, category, importance, body,
              start_date, due_date, status, completed_at, urgent_pin
  `;
  return json(rows[0], 200);
}

// --- PUT: edit an existing item -------------------------------------------
// Body: { id, title, type, category, importance, due, end, body }
async function editItem(sql, context) {
  const b = await context.request.json();
  const id = b.id;
  if (id == null) return json({ error: "id required" }, 400);

  const title = (b.title || "").trim();
  if (!title) return json({ error: "title required" }, 400);

  const type = FINITE_TYPES.includes(b.type) ? b.type : "task";
  const category = b.category || null;
  const bodyText = b.body || null;
  const importance =
    URGENT_TYPES.includes(type) && b.importance != null ? Number(b.importance) : null;
  const urgentPin = b.urgent_pin === true;
  const { start_date, due_date } = datesFor(type, b);

  const rows = await sql`
    UPDATE items
    SET title = ${title},
        type = ${type},
        category = ${category},
        importance = ${importance},
        body = ${bodyText},
        start_date = ${start_date},
        due_date = ${due_date},
        urgent_pin = ${urgentPin},
        last_tended_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, type, category, importance, body,
              start_date, due_date, status, completed_at, urgent_pin
  `;

  if (!rows.length) return json({ error: "not found" }, 404);
  return json(rows[0], 200);
}

// --- PATCH: mark done, or undo --------------------------------------------
// Body: { id, undo?: boolean }
async function completeItem(sql, context) {
  const b = await context.request.json();
  const id = b.id;
  if (id == null) return json({ error: "id required" }, 400);

  let rows;
  if (b.undo) {
    rows = await sql`
      UPDATE items
      SET status = 'open', completed_at = NULL, last_tended_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, completed_at
    `;
  } else {
    rows = await sql`
      UPDATE items
      SET status = 'done', completed_at = NOW(), last_tended_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, completed_at
    `;
  }

  if (!rows.length) return json({ error: "not found" }, 404);
  return json(rows[0], 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
