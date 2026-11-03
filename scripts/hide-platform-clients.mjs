// One-off: hide the e-commerce/quick-commerce platform entities from the dashboard (Overview, Clients, search,
// every total), confirmed with the user on 2026-11-03. Their order history is untouched; lib/queries.js's
// hiddenClients() and the Imports & backup page list them for review, and ClientView has an Unhide button.
// The exact client IDs were read from the live database beforehand; this script verifies each name still
// matches before touching it, and aborts (printing why) rather than hiding the wrong client if one has changed.
//
//   npm run hide-platform-clients            dry run: shows what would change, writes nothing
//   npm run hide-platform-clients -- --apply do it (take `npm run backup` first)
import { query, closeDb } from "../lib/db.js";

const apply = process.argv.includes("--apply");

// id -> the name confirmed with the user; the script refuses to hide a client whose current name differs.
const TARGETS = {
  7916: "HANDS ON TRADES PRIVATE LIMITED",
  2432: "ZEPTO PRIVATE LIMITED",
  2411: "SCOOTSY LOGISTICS PRIVATE LIMITED",
  5647: "Big Basket",
  6524: "Flipkart Minutes PVT. LTD",
  7682: "FLIPKART MINS PRIVATE LIMITED",
  7511: "FLIPKART INDIA PRIVATE LIMITED",
  8014: "Flipkart Minutes PVT. LTD. FLSFALCAZAXN",
  8266: "Flipkart Mins ltd  FLSPPFAROGRI",
  7509: "FLIPKART INDIA PRIVATE LIMITED  FLSTIDHLJVCP",
};

const ids = Object.keys(TARGETS).map(Number);
const found = (await query(
  `SELECT c.id, c.name, c.hidden, count(p.id)::int AS orders, round(COALESCE(sum(p.amount) FILTER (WHERE p.counted AND NOT p.repeated_po), 0))::float8 AS revenue
     FROM clients c LEFT JOIN purchases p ON p.client_id = c.id WHERE c.id = ANY($1::int[]) GROUP BY c.id`,
  [ids],
)).rows;
const byId = new Map(found.map((r) => [r.id, r]));

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
let totalRevenue = 0;
const ok = [];
const problems = [];
for (const [idStr, expectedName] of Object.entries(TARGETS)) {
  const id = Number(idStr);
  const row = byId.get(id);
  if (!row) problems.push(`#${id}: no longer exists`);
  else if (row.name !== expectedName) problems.push(`#${id}: name is now "${row.name}", expected "${expectedName}" — skipping`);
  else if (row.hidden) problems.push(`#${id} ${row.name}: already hidden`);
  else {
    ok.push(row);
    totalRevenue += row.revenue;
  }
}

console.log(`${apply ? "APPLYING" : "DRY RUN"}: ${ok.length} of ${ids.length} platform clients to hide, ${money(totalRevenue)} combined revenue`);
for (const r of ok) console.log(`  ${String(r.orders).padStart(5)} orders  ${money(r.revenue).padStart(16)}  ${r.name}`);
if (problems.length) {
  console.log("\nNot touching these (check and re-run if needed):");
  for (const p of problems) console.log(`  ${p}`);
}

if (apply) {
  if (!ok.length) {
    console.log("\nNothing to hide.");
  } else {
    const r = await query(`UPDATE clients SET hidden = true WHERE id = ANY($1::int[]) RETURNING id`, [ok.map((r) => r.id)]);
    console.log(`\nHidden ${r.rows.length} clients. Undo any time from a client's own page, or Imports & backup, Hidden clients.`);
  }
} else {
  console.log("\nNothing was changed. Run with --apply to do it.");
}
await closeDb();
