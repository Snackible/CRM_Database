// Repeated marketplace POs. A marketplace PO number belongs to one order, so the same client's PO number appearing
// twice with the same amount is that order entered twice (the sheet's own STATUS only flags some of them).
// The first copy is kept; later copies are marked `repeated_po` and, like duplicate or cancelled orders, are left out
// of every total (the `sales` view skips them) while staying on file and on the client's order list.
// Only orders that count are compared, so cancelling the first copy lets the second one count. Orders with no
// amount, or with a different amount on the same PO (a changed or part order), are never treated as repeats.
// Runs after every import, and from scripts/recount-sales.mjs for orders loaded earlier.
import { query } from "./db.js";

const COMPARABLE = `client_id IS NOT NULL AND counted AND amount > 0 AND extra ? 'PO code' AND btrim(extra->>'PO code') <> ''`;

/** Marks later copies of the same PO and releases copies that no longer qualify. Returns how many orders changed. */
export async function markRepeatedPos(run = query) {
  const marked = await run(
    `WITH r AS (
       SELECT id, (row_number() OVER (PARTITION BY client_id, btrim(extra->>'PO code'), amount ORDER BY order_date NULLS LAST, id) > 1) AS rep
         FROM purchases WHERE ${COMPARABLE}
     )
     UPDATE purchases p SET repeated_po = r.rep FROM r WHERE p.id = r.id AND p.repeated_po IS DISTINCT FROM r.rep RETURNING p.id`,
  );
  const released = await run(`UPDATE purchases SET repeated_po = false WHERE repeated_po AND NOT (${COMPARABLE}) RETURNING id`);
  return marked.rows.length + released.rows.length;
}

/** How many orders would be marked, without changing anything (for the dry run). */
export async function countRepeatedPos(run = query) {
  const r = await run(
    `SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::float8 AS amount FROM (
       SELECT amount, (row_number() OVER (PARTITION BY client_id, btrim(extra->>'PO code'), amount ORDER BY order_date NULLS LAST, id) > 1) AS rep
         FROM purchases WHERE ${COMPARABLE}) x WHERE rep`,
  );
  return r.rows[0];
}
