// Second clean-up after merge-po-clients: clients that are the same company spelled slightly differently
// ("Big Basket PO No", "BigBasket PO No", "Bigbasket Ltd"; "Flipkart Minutes PVT. LTD" and "...LTD."; "ZEPTO LIMITED"
// and "ZEPTO PRIVATE LIMITED"). Names are compared with punctuation, spacing, legal suffixes (pvt, private, limited,
// ltd, llp, inc) and PO words removed. Each group is merged onto its biggest client, and an alias is saved for every
// merged name so the next sheet read lands on the same client instead of creating it again.
//
//   npm run merge-name-variants             dry run: lists every group, writes nothing
//   npm run merge-name-variants -- --apply  do it, in one transaction (take `npm run backup` first)
import { query, tx, closeDb } from "../lib/db.js";
import { looseNameKey } from "../lib/normalize.js";

const apply = process.argv.includes("--apply");
const CHILD_TABLES = ["purchases", "contacts", "notes", "facts", "documents"];

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const keyOf = looseNameKey;
// The name shown for a merged company: the biggest client's name without a trailing "PO No" and stray punctuation.
const tidy = (name) => {
  const out = name.replace(/[\s.,\-–]*\bpo\.?\s*(?:no|number)?\.?[\s.,\-–]*$/i, "").replace(/^["'\s]+/, "").replace(/[\s,."'\-–]+$/, "").trim();
  return out || name;
};

const clients = (await query(
  `SELECT c.id, c.name, c.lead_key, c.since::text AS since, COALESCE(p.n, 0)::int AS orders, COALESCE(p.amt, 0)::float8 AS amt
     FROM clients c
     LEFT JOIN (SELECT client_id, count(*) n, sum(amount) amt FROM purchases GROUP BY 1) p ON p.client_id = c.id
    WHERE c.stage = 'client' AND NOT c.is_sample`,
)).rows;

const byKey = new Map();
for (const c of clients) {
  const k = keyOf(c.name);
  if (!k) continue; // too little left to trust
  byKey.set(k, [...(byKey.get(k) ?? []), c]);
}
const plan = [...byKey.values()]
  .filter((g) => g.length > 1)
  .map((g) => {
    const sorted = g.slice().sort((a, b) => b.orders - a.orders || a.id - b.id);
    const keeper = sorted[0];
    return { keeper, drop: sorted.slice(1), display: tidy(keeper.name), orders: g.reduce((a, c) => a + c.orders, 0), amt: g.reduce((a, c) => a + c.amt, 0), since: g.map((c) => c.since).filter(Boolean).sort()[0] ?? null };
  })
  .sort((a, b) => b.orders - a.orders);

const money = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const total = clients.length;
const dropCount = plan.reduce((a, p) => a + p.drop.length, 0);
console.log(`${apply ? "APPLYING" : "DRY RUN"}: ${plan.length} companies to merge; clients ${total} -> ${total - dropCount}`);
for (const p of plan) {
  console.log(`\n${p.display}   (${p.orders} orders, ${money(p.amt)})`);
  console.log(`   keep:  ${p.keeper.name}  [${p.keeper.orders} orders]`);
  for (const d of p.drop) console.log(`   merge: ${d.name}  [${d.orders} orders]`);
}

if (!apply) {
  console.log("\nNothing was changed. Run with --apply to do it.");
  await closeDb();
  process.exit(0);
}

await tx(async (db) => {
  for (const p of plan) {
    const ids = p.drop.map((d) => d.id);
    for (const t of CHILD_TABLES) await db.query(`UPDATE ${t} SET client_id = $1 WHERE client_id = ANY($2::int[])`, [p.keeper.id, ids]);
    for (const d of p.drop) {
      for (const key of new Set([d.lead_key, `name:${norm(d.name)}`].filter(Boolean))) {
        await db.query(`INSERT INTO client_aliases (alias_key, client_id) VALUES ($1,$2) ON CONFLICT (alias_key) DO UPDATE SET client_id = EXCLUDED.client_id`, [key, p.keeper.id]);
      }
    }
    // aliases that pointed at a merged client follow it
    await db.query(`UPDATE client_aliases SET client_id = $1 WHERE client_id = ANY($2::int[])`, [p.keeper.id, ids]);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::int[])`, [ids]);
    await db.query(`UPDATE clients SET name = $2, since = LEAST(since, $3::date) WHERE id = $1`, [p.keeper.id, p.display, p.since]);
  }
});
const now = (await query(`SELECT (SELECT count(*)::int FROM clients) clients, (SELECT count(*)::int FROM purchases) purchases, (SELECT count(*)::int FROM purchases WHERE client_id IS NULL) unmatched, COALESCE((SELECT sum(amount) FROM purchases), 0)::float8 amt`)).rows[0];
console.log(`\nDone. Clients ${now.clients}, purchases ${now.purchases} (unmatched ${now.unmatched}), total ${money(now.amt)}`);
await closeDb();
