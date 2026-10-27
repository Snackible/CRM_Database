// One-off clean-up for sheets that put the PO number in the buyer's name ("ZEPTO PRIVATE LIMITED P4779366"): every
// PO became its own client. This groups the clients an import created by their name without the PO code, moves
// each group's orders, contacts, notes, facts, documents and links onto one client, and removes the empties.
//
//   npm run merge-po-clients            dry run: prints what would change, writes nothing
//   npm run merge-po-clients -- --apply do it, in one transaction (take `npm run backup` first)
import { query, tx, closeDb } from "../lib/db.js";
import { stripReferenceCode } from "../lib/normalize.js";

const apply = process.argv.includes("--apply");
const CHILD_TABLES = ["purchases", "contacts", "notes", "facts", "documents", "client_aliases"];

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

const candidates = (await query(
  `SELECT c.id, c.name, c.since::text AS since, COALESCE(p.n, 0)::int AS orders, COALESCE(p.amt, 0)::float8 AS amt
     FROM clients c
     LEFT JOIN (SELECT client_id, count(*) n, sum(amount) amt FROM purchases GROUP BY 1) p ON p.client_id = c.id
    WHERE c.stage = 'client' AND c.import_id IS NOT NULL AND c.created_by = 'Import' AND NOT c.is_sample`,
)).rows;
const others = (await query(
  `SELECT id, name FROM clients WHERE NOT (stage = 'client' AND import_id IS NOT NULL AND created_by = 'Import')`,
)).rows;
const existing = new Map(others.map((o) => [norm(o.name), o.id]));

// group by cleaned name
const groups = new Map();
for (const c of candidates) {
  const { name, code } = stripReferenceCode(c.name);
  const key = norm(name);
  const g = groups.get(key) ?? { key, members: [], names: new Map(), keeper: existing.get(key) ?? null };
  g.members.push({ ...c, code });
  g.names.set(name, (g.names.get(name) ?? 0) + 1);
  groups.set(key, g);
}

const plan = [];
for (const g of groups.values()) {
  const display = [...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
  const keeper = g.keeper ?? g.members.slice().sort((a, b) => b.amt - a.amt || a.id - b.id)[0].id;
  const drop = g.members.filter((m) => m.id !== keeper).map((m) => m.id);
  const changes = g.members.some((m) => m.code) || drop.length > 0;
  if (!changes) continue;
  plan.push({
    key: g.key,
    display,
    keeper,
    existing: g.keeper !== null,
    drop,
    orders: g.members.reduce((a, m) => a + m.orders, 0),
    amt: g.members.reduce((a, m) => a + m.amt, 0),
    since: g.members.map((m) => m.since).filter(Boolean).sort()[0] ?? null,
  });
}

const dropCount = plan.reduce((a, p) => a + p.drop.length, 0);
const total = (await query(`SELECT count(*)::int n FROM clients`)).rows[0].n;
const money = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
console.log(`${apply ? "APPLYING" : "DRY RUN"}: ${candidates.length} import-created clients -> ${groups.size} companies`);
console.log(`Clients in the CRM: ${total} -> ${total - dropCount}   (merging away ${dropCount}; ${plan.length} companies renamed or merged)`);
console.log("Biggest companies after the merge:");
for (const p of plan.slice().sort((a, b) => b.orders - a.orders).slice(0, 15)) console.log(`  ${String(p.orders).padStart(5)} orders  ${money(p.amt).padStart(16)}  ${p.display}${p.existing ? "  (joins an existing client)" : ""}`);
const single = [...groups.values()].filter((g) => g.members.length === 1 && !g.members[0].code).length;
console.log(`Left exactly as they are (no PO code, one client): ${single}`);
const after = [...groups.values()].filter((g) => g.members.length === 1).length;
console.log(`Companies that still have just one order-client after the merge: ${after} of ${groups.size}`);

if (!apply) {
  console.log("\nNothing was changed. Run with --apply to do it.");
  await closeDb();
  process.exit(0);
}

await tx(async (db) => {
  const map = plan.flatMap((p) => p.drop.map((id) => ({ id, keeper: p.keeper })));
  for (let i = 0; i < map.length; i += 2000) {
    const chunk = JSON.stringify(map.slice(i, i + 2000));
    for (const t of CHILD_TABLES) {
      await db.query(`UPDATE ${t} x SET client_id = m.keeper FROM jsonb_to_recordset($1::jsonb) AS m(id int, keeper int) WHERE x.client_id = m.id`, [chunk]);
    }
    await db.query(`DELETE FROM clients WHERE id IN (SELECT id FROM jsonb_to_recordset($1::jsonb) AS m(id int, keeper int))`, [chunk]);
  }
  const fix = JSON.stringify(plan.filter((p) => !p.existing).map((p) => ({ id: p.keeper, name: p.display, key: `name:${p.key}`, since: p.since })));
  await db.query(
    `UPDATE clients c SET name = m.name, lead_key = m.key, since = LEAST(c.since, m.since::date)
       FROM jsonb_to_recordset($1::jsonb) AS m(id int, name text, key text, since text) WHERE c.id = m.id`,
    [fix],
  );
});
const now = (await query(`SELECT (SELECT count(*)::int FROM clients) clients, (SELECT count(*)::int FROM purchases) purchases, (SELECT count(*)::int FROM purchases WHERE client_id IS NULL) unmatched, COALESCE((SELECT sum(amount) FROM purchases), 0)::float8 amt`)).rows[0];
console.log(`Done. Clients ${now.clients}, purchases ${now.purchases} (unmatched ${now.unmatched}), total ${money(now.amt)}`);
await closeDb();
