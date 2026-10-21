// Postgres access. With DATABASE_URL (Neon, or any Postgres) it uses `pg`. Without it, and outside Vercel,
// it runs PGlite (Postgres compiled to WASM) in .data/, so local work needs no account.
// Dates come back as 'YYYY-MM-DD' strings and numerics as numbers.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA } from "./schema.js";

const DATE = 1082;
const NUMERIC = 1700;
const INT8 = 20;

async function openPostgres() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX) || 3 });
  pool.on("error", (e) => console.error("database pool:", e.message));
  const types = {
    getTypeParser: (oid, format) => (oid === DATE ? (v) => v : oid === NUMERIC || oid === INT8 ? parseFloat : pg.types.getTypeParser(oid, format)),
  };
  const runner = (client) => async (text, params = []) => {
    const res = await client.query({ text, values: params, types });
    // A multi-statement script (the schema) comes back as one result per statement: keep the last.
    const r = Array.isArray(res) ? res[res.length - 1] ?? { rows: [], rowCount: 0 } : res;
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 };
  };
  const db = {
    close: () => pool.end(),
    query: runner(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: runner(client) });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
  await db.tx(async (t) => {
    await t.query("SELECT pg_advisory_xact_lock(727001)");
    await t.query(SCHEMA);
  });
  return db;
}

async function openLocal() {
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add the Neon connection string in the Vercel project settings.");
  const name = "@electric-sql/pglite"; // kept out of the bundler's sight on purpose
  const { PGlite } = await import(name);
  const dir = process.env.PGLITE_DIR || join(process.cwd(), ".data", "pglite");
  if (!dir.startsWith("memory://")) mkdirSync(join(dir, ".."), { recursive: true });
  const lite = new PGlite(dir, { parsers: { [DATE]: (v) => v, [NUMERIC]: parseFloat, [INT8]: parseFloat } });
  await lite.waitReady;
  const wrap = (c) => async (text, params = []) => {
    const r = await c.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await lite.exec(SCHEMA);
  return { close: () => lite.close(), query: wrap(lite), tx: (fn) => lite.transaction((t) => fn({ query: wrap(t) })) };
}

// One connection per server process, shared across hot reloads in development.
export function getDb() {
  globalThis.__crmDb ??= (process.env.DATABASE_URL ? openPostgres() : openLocal()).catch((e) => {
    globalThis.__crmDb = undefined;
    throw e;
  });
  return globalThis.__crmDb;
}

export async function query(text, params) {
  return (await getDb()).query(text, params);
}

export async function tx(fn) {
  return (await getDb()).tx(fn);
}

export const usingLocalDatabase = () => !process.env.DATABASE_URL;

/** For tests and scripts: close the connection so the process can exit. */
export async function closeDb() {
  const pending = globalThis.__crmDb;
  globalThis.__crmDb = undefined;
  if (pending) await (await pending).close?.();
}
