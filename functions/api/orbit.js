import { neon } from "@neondatabase/serverless";

// /api/orbit — data for the Periphery Monitor (Clusters tab).
// Returns finite items (task/trip/milestone, dated or dateless) and standing
// items (type='focus'). The frontend positions by time (distance), importance
// (size), category (color+icon), and uses parent_id for trip-prep tethers and
// last_tended_at for focus-area neglect.
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
        parent_id,
        last_tended_at,
        -- finite vs standing
        CASE WHEN type = 'focus' THEN 'standing' ELSE 'finite' END AS kind,
        -- days until the relevant date (due preferred, else start); NULL if no date
        CASE
          WHEN type = 'focus' THEN NULL
          WHEN COALESCE(due_date, start_date) IS NULL THEN NULL
          ELSE GREATEST(
            DATE_PART('day', COALESCE(due_date, start_date)::timestamp - CURRENT_DATE::timestamp),
            0
          )
        END AS days_left,
        -- neglect 0..1 for focus items: days since tended / 21, NULL-tended = 1 (max)
        CASE
          WHEN type = 'focus' THEN
            CASE
              WHEN last_tended_at IS NULL THEN 1.0
              ELSE LEAST(
                1.0,
                GREATEST(
                  DATE_PART('day', CURRENT_DATE::timestamp - last_tended_at::timestamp),
                  0
                ) / 21.0
              )
            END
          ELSE NULL
        END AS neglect
      FROM items
      WHERE
        -- exclude completed/cancelled finite items
        (status IS NULL OR status NOT IN ('done', 'completed', 'cancelled', 'archived'))
        -- exclude past milestones
        AND NOT (type = 'milestone' AND due_date < CURRENT_DATE)
        -- the monitor handles these four kinds
        AND type IN ('task', 'trip', 'milestone', 'focus')
      ORDER BY
        kind DESC,                                  -- finite first
        COALESCE(due_date, start_date) ASC NULLS LAST,
        importance DESC NULLS LAST
    `;

    return new Response(JSON.stringify(rows), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
