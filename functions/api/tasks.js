import { neon } from "@neondatabase/serverless";

export async function onRequest(context) {
  try {
    const sql = neon(context.env.DATABASE_URL);

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
        GREATEST(
          DATE_PART('day', COALESCE(due_date, start_date)::timestamp - CURRENT_DATE::timestamp),
          0
        ) AS days_left,
        CASE
          WHEN type = 'task' AND importance IS NOT NULL THEN
            ROUND(
              importance::numeric
              / GREATEST(
                  DATE_PART('day', due_date::timestamp - CURRENT_DATE::timestamp),
                  1
                ),
              2
            )
          ELSE NULL
        END AS urgency
      FROM items
      WHERE type IN ('task', 'trip', 'milestone')
        AND NOT (type = 'milestone' AND due_date < CURRENT_DATE)
      ORDER BY COALESCE(start_date, due_date) ASC NULLS LAST
    `;

    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
