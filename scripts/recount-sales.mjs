// Marks the orders already on file that are not sales (Duplicate, Cancelled, RTO, Internal PO, or no amount
// entered yet: see lib/status.js) so they are left out of revenue and every other total. New and re-read orders
// are marked as they come in; this brings the older ones in line, and is safe to run again.
//
//   npm run recount-sales            dry run: shows what would change, writes nothing
//   npm run recount-sales -- --apply do it (take `npm run backup` first)
import { query, closeDb } from "../lib/db.js";
import { countRepeatedPos, markRepeatedPos } from "../lib/sales.js";

const apply = process.argv.includes("--apply");
const STATUS = `(SELECT btrim(value) FROM jsonb_each_text(extra) WHERE lower(btrim(key)) = 'status' LIMIT 1)`;
const NOT_A_SALE = `COALESCE(${STATUS}, '') ~* '^\\s*(duplicate|cancel|rto|internal po|void)'`;
const IS_SALE = `NOT (${NOT_A_SALE}) AND amount IS NOT NULL AND amount <> 0`;
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const before = (await query(`SELECT count(*)::int AS lines, COALESCE(sum(amount) FILTER (WHERE counted), 0)::float8 AS counted_revenue, count(*) FILTER (WHERE NOT counted)::int AS already_left_out FROM purchases WHERE client_id IS NOT NULL`)).rows[0];
const change = (await query(
  `SELECT lower(COALESCE(btrim(${STATUS}), '')) AS status, (amount IS NULL OR amount = 0) AS no_amount, count(*)::int AS lines, COALESCE(sum(amount), 0)::float8 AS revenue
     FROM purchases WHERE client_id IS NOT NULL AND counted IS DISTINCT FROM (${IS_SALE}) GROUP BY 1, 2 ORDER BY 4 DESC`,
)).rows;

console.log(`${apply ? "APPLYING" : "DRY RUN"}: revenue counted today ${money(before.counted_revenue)} on ${before.lines.toLocaleString("en-IN")} orders (${before.already_left_out} already left out)`);
if (!change.length) console.log("Nothing to change.");
const repeats = await countRepeatedPos();
for (const c of change) console.log(`  ${String(c.lines).padStart(5)} orders  ${money(c.revenue).padStart(16)}  ${c.no_amount ? "no amount entered yet" : `status "${c.status}"`}`);

console.log(`  ${String(repeats.n).padStart(5)} orders  ${money(repeats.amount).padStart(16)}  the same PO entered again (same client, PO number and amount)`);

if (apply) {
  const r = await query(`UPDATE purchases SET counted = (${IS_SALE}) WHERE counted IS DISTINCT FROM (${IS_SALE}) RETURNING id`);
  const marked = await markRepeatedPos();
  console.log(`Marked or released ${marked} repeated-PO orders.`);
  const after = (await query(`SELECT COALESCE(sum(amount), 0)::float8 AS revenue FROM sales WHERE client_id IS NOT NULL`)).rows[0];
  console.log(`Updated ${r.rows.length} orders. Revenue now ${money(after.revenue)} (was ${money(before.counted_revenue)}).`);
} else {
  console.log("\nNothing was changed. Run with --apply to do it.");
}
await closeDb();
