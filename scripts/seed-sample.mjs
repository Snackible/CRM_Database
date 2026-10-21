// Loads the invented demo clients from lib/sample.js into the database, flagged as sample data so one click
// ("Remove sample data" on Imports & backup) deletes them. Safe to run again.
// Run: npm run seed
import { tx } from "../lib/db.js";
import { removeSampleData } from "../lib/services.js";
import { CLIENTS, UNMATCHED } from "../lib/sample.js";

await removeSampleData();

await tx(async (db) => {
  for (const c of CLIENTS) {
    const r = await db.query(
      `INSERT INTO clients (client_code, name, segment, city, owner, email, phone, since, is_sample, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'sample') RETURNING id`,
      [c.code, c.name, c.segment, c.city, c.owner, c.email || null, c.phone || null, c.since],
    );
    const id = r.rows[0].id;
    for (const p of c.contacts) {
      await db.query(`INSERT INTO contacts (client_id, name, role, phone, email) VALUES ($1,$2,$3,$4,$5)`, [id, p.name, p.role, p.phone || null, p.email || null]);
    }
    for (const f of c.facts) {
      await db.query(
        `INSERT INTO facts (client_id, category, key, value, source_type, source_label, source_date, snippet, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sample')`,
        [id, f.category, f.key, f.value, f.source.type, f.source.label, f.source.date, f.snippet || null],
      );
    }
    for (const n of c.notes) {
      await db.query(`INSERT INTO notes (client_id, body, author, created_at) VALUES ($1,$2,$3,$4)`, [id, n.text, n.author, `${n.date}T10:00:00Z`]);
    }
    for (const d of c.documents) {
      const body = c.facts.filter((f) => f.source.label === d.title && f.snippet).map((f) => f.snippet).join("\n") || `Sample document: ${d.title}`;
      await db.query(`INSERT INTO documents (client_id, title, text, chars, created_by, created_at) VALUES ($1,$2,$3,$4,'sample',$5)`, [id, d.title, body, body.length, `${d.date}T10:00:00Z`]);
    }
    for (const p of c.purchases) {
      await db.query(
        `INSERT INTO purchases (client_id, order_ref, order_date, product, quantity, rate, amount, channel, source, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sample')`,
        [id, p.ref, p.date, p.product, p.qty, p.rate, p.amount, p.channel, p.source],
      );
    }
  }
  const files = new Map();
  for (const u of UNMATCHED) {
    if (!files.has(u.file)) {
      const imp = await db.query(`INSERT INTO imports (filename, status, total_rows, rows_done, created_by) VALUES ($1,'done',0,0,'sample') RETURNING id`, [u.file]);
      files.set(u.file, imp.rows[0].id);
    }
    const key = u.identity.code ? `code:${u.identity.code.toLowerCase()}` : u.identity.email ? `email:${u.identity.email}` : u.identity.phone ? `phone:${u.identity.phone.slice(-10)}` : `name:${u.identity.name.toLowerCase()}`;
    for (const r of u.rows) {
      await db.query(
        `INSERT INTO purchases (client_id, raw_client, raw_key, order_ref, order_date, product, quantity, amount, source, import_id, entered_by)
         VALUES (NULL, $1::jsonb, $2, $3, $4, $5, $6, $7, 'csv', $8, 'sample')`,
        [JSON.stringify(u.identity), key, r.ref, r.date, r.product, r.qty, r.amount, files.get(u.file)],
      );
    }
  }
});

console.log(`Seeded ${CLIENTS.length} sample clients and ${UNMATCHED.length} unmatched buyers.`);
process.exit(0);
