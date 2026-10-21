// Runs the backend tests through the real `pg` driver, the one Vercel uses with Neon. PGlite is served over the
// Postgres wire protocol on a local port, and the tests connect to it with DATABASE_URL like production would.
// The in-process server takes one connection at a time, so the pool is limited to one here (Neon allows many).
// Run: npm run test:pg
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 54329, host: "127.0.0.1" });
await server.start();

// Async spawn: the database server lives in this process, so the event loop must stay free while the tests run.
const child = spawn(process.execPath, ["--test", "--test-reporter=spec", "tests/backend.test.js"], {
  stdio: "inherit",
  env: { ...process.env, PG_POOL_MAX: "1", TEST_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable" },
});
const timer = setTimeout(() => child.kill(), 120000);
const code = await new Promise((resolve) => child.on("exit", (c) => resolve(c ?? 1)));
clearTimeout(timer);

await server.stop();
await db.close();
process.exit(code);
