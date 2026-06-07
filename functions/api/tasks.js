import { neon } from '@neondatabase/serverless';

export async function onRequestGet(context) {
  try {
    const sql = neon(context.env.DATABASE_URL);

    const rows = await sql`
      SELECT
        id,
        title,
        category,
        importance,
        due_date,
        status,
        (due_date - CURRENT_DATE) AS days_left,
        ROUND(
          importance::numeric / GREATEST(due_date - CURRENT_DATE, 1),
          2
        ) AS urgency
      FROM items
      WHERE type = 'task'
        AND status = 'open'
      ORDER BY urgency DESC NULLS LAST
    `;

    return new Response(JSON.stringify(rows), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
