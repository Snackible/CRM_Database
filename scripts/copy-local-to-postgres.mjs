// Copies everything from the local PGlite database (.data/pglite) into an empty Postgres such as Neon, keeping
// ids, then moves the id counters past the copied rows. The local copy is left untouched as a backup.
// Run (with the app stopped): TARGET_DATABASE_URL=... node --env-file=.env.local scripts/copy-local-to-postgres.mjs
import { join } from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA } from "../lib/schema.js";

const TABLES = ["imports", "clients", "contacts", "documents", "notes", "facts", "purchases", "client_aliases", "import_mappings", "sheet_sources", "lead_rows"];
const SERIALS = ["imports", "clients", "contacts", "documents", "notes", "facts", "purchases", "sheet_sources"];
const BATCH = 1000;

const target = process.env.TARGET_DATABASE_URL;
if (!target) throw new Error("Set TARGET_DATABASE_URL to the database to copy into.");

const local = new PGlite(join(process.cwd(), ".data", "pglite"), { parsers: { 1082: (v) => v, 1700: parseFloat, 20: parseFloat } });
await local.waitReady;
const remote = new pg.Pool({ connectionString: target, max: 1 });

await remote.query(SCHEMA);
for (const t of TABLES) {
  const n = (await remote.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  if (n > 0) throw new Error(`The target already has rows in ${t}; refusing to copy over existing data.`);
}

const client = await remote.connect();
try {
  await client.query("BEGIN");
  for (const t of TABLES) {
    const rows = (await local.query(`SELECT * FROM ${t}`)).rows;
    for (let i = 0; i < rows.length; i += BATCH) {
      await client.query(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)`, [JSON.stringify(rows.slice(i, i + BATCH))]);
    }
    console.log(`${t}: ${rows.length} rows`);
  }
  for (const t of SERIALS) {
    await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT max(id) FROM ${t}), 0) + 1, false)`);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  client.release();
}

// Check every table arrived whole.
let ok = true;
for (const t of TABLES) {
  const a = (await local.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  const b = (await remote.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  if (a !== b) {
    ok = false;
    console.log(`MISMATCH ${t}: local ${a}, target ${b}`);
  }
}
const sums = await Promise.all([local.query("SELECT COALESCE(sum(amount),0) AS s FROM purchases"), remote.query("SELECT COALESCE(sum(amount),0)::float8 AS s FROM purchases")]);
console.log(ok ? "All tables match." : "Some tables do not match.", `Purchase total: local ${sums[0].rows[0].s}, target ${sums[1].rows[0].s}`);
await local.close();
await remote.end();
