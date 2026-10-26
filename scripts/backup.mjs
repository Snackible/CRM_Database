// Saves every table from the database the app uses (Neon when DATABASE_URL is set) as one JSON file in backups/.
// The same content as "Download everything" on Imports & backup. Run: npm run backup
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportAll } from "../lib/services.js";
import { closeDb } from "../lib/db.js";

const data = await exportAll();
const dir = join(process.cwd(), "backups");
mkdirSync(dir, { recursive: true });
const stamp = data.exportedAt.replace(/[:T]/g, "-").slice(0, 16);
const file = join(dir, `crm-${stamp}.json`);
writeFileSync(file, JSON.stringify(data));
const counts = Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(", ");
console.log(`Saved ${file}\n${counts}`);
await closeDb();
