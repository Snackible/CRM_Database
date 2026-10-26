// Everything that writes. Plain functions over the database, so they can be tested without Next.js.
import { query, tx } from "./db.js";
import { HttpError, bad, notFound } from "./errors.js";
import { isoDay } from "./metrics.js";
import { last10, parseDate } from "./normalize.js";

const text = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const today = () => isoDay(new Date());
const FACT_CATEGORIES = ["Commercial", "Delivery", "Identity", "Contact", "Product interest", "Other"];

/* ---------- clients ---------- */

async function findTwin(db, { code, email, phone, name }, exceptId = 0) {
  const r = await db.query(
    `SELECT id, name, client_code AS code, city FROM clients
      WHERE id <> $5 AND (
        ($1 <> '' AND lower(client_code) = lower($1)) OR
        ($2 <> '' AND lower(email) = lower($2)) OR
        ($3 <> '' AND right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $3) OR
        ($4 <> '' AND lower(name) = lower($4))
      ) LIMIT 1`,
    [code ?? "", email ?? "", last10(phone), name ?? "", exceptId],
  );
  return r.rows[0] ?? null;
}

export async function createClient(input, user) {
  const name = text(input.name);
  if (!name) throw bad("A client needs a name.");
  const data = { name, code: text(input.code), email: text(input.email)?.toLowerCase() ?? null, phone: text(input.phone), segment: text(input.segment), city: text(input.city), owner: text(input.owner) };
  return tx(async (db) => {
    if (!input.force) {
      const twin = await findTwin(db, data);
      if (twin) throw new HttpError(409, `${twin.name} already matches this name, code, email or phone.`, { duplicate: twin });
    }
    const c = await db.query(
      `INSERT INTO clients (client_code, name, segment, city, owner, email, phone, since, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [data.code, data.name, data.segment, data.city, data.owner, data.email, data.phone, today(), user],
    );
    const id = c.rows[0].id;
    for (const p of input.people ?? []) {
      if (text(p.name) || text(p.email) || text(p.phone)) {
        await db.query(`INSERT INTO contacts (client_id, name, role, phone, email) VALUES ($1,$2,$3,$4,$5)`, [id, text(p.name), text(p.role), text(p.phone), text(p.email)]);
      }
    }
    const addFact = (category, key, value) =>
      db.query(
        `INSERT INTO facts (client_id, category, key, value, source_type, source_label, source_date, created_by) VALUES ($1,$2,$3,$4,'manual',$5,$6,$5)`,
        [id, category, key, value, user, today()],
      );
    if (text(input.gstin)) await addFact("Identity", "GSTIN", text(input.gstin).toUpperCase());
    for (const f of input.custom ?? []) if (text(f.k) && text(f.v)) await addFact("Other", text(f.k), text(f.v));
    if (input.linkKey) await linkRows(db, input.linkKey, id);
    return { id };
  });
}

export async function updateClient(id, patch) {
  const fields = { client_code: "code", name: "name", segment: "segment", city: "city", owner: "owner", email: "email", phone: "phone" };
  const sets = [];
  const values = [];
  for (const [col, key] of Object.entries(fields)) {
    if (key in patch) {
      values.push(col === "email" ? text(patch[key])?.toLowerCase() ?? null : text(patch[key]));
      sets.push(`${col} = $${values.length}`);
    }
  }
  if ("name" in patch && !text(patch.name)) throw bad("A client needs a name.");
  if (!sets.length) return { id };
  return tx(async (db) => {
    if (text(patch.code)) {
      const twin = await findTwin(db, { code: text(patch.code) }, id);
      if (twin) throw new HttpError(409, `Client code ${patch.code} already belongs to ${twin.name}.`, { duplicate: twin });
    }
    values.push(id);
    const r = await db.query(`UPDATE clients SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING id`, values);
    if (!r.rows[0]) throw notFound("That client");
    return { id };
  });
}

export async function deleteClient(id) {
  const r = await query(`DELETE FROM clients WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows[0]) throw notFound("That client");
  return { id };
}

/* ---------- notes, facts, documents ---------- */

async function mustHaveClient(db, id) {
  const r = await db.query(`SELECT id FROM clients WHERE id = $1`, [id]);
  if (!r.rows[0]) throw notFound("That client");
}

export async function addNote(clientId, body, user) {
  const b = text(body);
  if (!b) throw bad("Write something in the note.");
  return tx(async (db) => {
    await mustHaveClient(db, clientId);
    const r = await db.query(`INSERT INTO notes (client_id, body, author) VALUES ($1,$2,$3) RETURNING id`, [clientId, b, user]);
    return { id: r.rows[0].id };
  });
}

export async function deleteNote(id) {
  const r = await query(`DELETE FROM notes WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows[0]) throw notFound("That note");
  return { id };
}

function factFields(input) {
  const category = FACT_CATEGORIES.includes(input.category) ? input.category : "Other";
  const key = text(input.key);
  const value = text(input.value);
  if (!key || !value) throw bad("A fact needs both a name and a value.");
  const confirmedOn = input.confirmedOn ? parseDate(input.confirmedOn) : null;
  return { category, key, value, confirmedOn };
}

export async function addFact(clientId, input, user) {
  const f = factFields(input);
  return tx(async (db) => {
    await mustHaveClient(db, clientId);
    const r = await db.query(
      `INSERT INTO facts (client_id, category, key, value, source_type, source_label, source_date, confirmed_on, created_by)
       VALUES ($1,$2,$3,$4,'manual',$5,$6,$7,$5) RETURNING id`,
      [clientId, f.category, f.key, f.value, user, today(), f.confirmedOn],
    );
    return { id: r.rows[0].id };
  });
}

export async function updateFact(id, input) {
  const f = factFields(input);
  const r = await query(`UPDATE facts SET category=$2, key=$3, value=$4, confirmed_on=COALESCE($5, confirmed_on) WHERE id=$1 RETURNING id`, [id, f.category, f.key, f.value, f.confirmedOn]);
  if (!r.rows[0]) throw notFound("That fact");
  return { id };
}

export async function deleteFact(id) {
  const r = await query(`DELETE FROM facts WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows[0]) throw notFound("That fact");
  return { id };
}

/** Saves the text of a document and the facts a person approved from it. The original file never reaches here. */
export async function saveDocument({ clientId, title, text: body, facts = [] }, user) {
  const t = text(body);
  if (!t) throw bad("There is no text to save.");
  const name = text(title) || "Pasted text";
  return tx(async (db) => {
    await mustHaveClient(db, clientId);
    const d = await db.query(`INSERT INTO documents (client_id, title, text, chars, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [clientId, name, t, t.length, user]);
    const documentId = d.rows[0].id;
    let saved = 0;
    for (const raw of facts) {
      const f = factFields(raw);
      await db.query(
        `INSERT INTO facts (client_id, category, key, value, source_type, source_label, source_date, snippet, document_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [clientId, f.category, f.key, f.value, raw.sourceType === "ai" ? "ai" : "pattern", name, today(), text(raw.snippet), documentId, user],
      );
      saved++;
    }
    return { documentId, facts: saved };
  });
}

/* ---------- purchases ---------- */

export async function addPurchases(clientId, lines, user) {
  if (!Array.isArray(lines) || !lines.length) throw bad("Add at least one line.");
  const rows = lines.map((l, i) => {
    const date = parseDate(l.date);
    const quantity = Number(l.quantity);
    const rate = Number(l.rate);
    if (!date) throw bad(`Line ${i + 1}: the date is not valid.`);
    if (!(quantity > 0)) throw bad(`Line ${i + 1}: quantity must be more than zero.`);
    if (!(rate >= 0)) throw bad(`Line ${i + 1}: rate must be a number.`);
    return { date, quantity, rate, product: text(l.product), ref: text(l.ref), channel: text(l.channel) };
  });
  return tx(async (db) => {
    await mustHaveClient(db, clientId);
    for (const r of rows) {
      await db.query(
        `INSERT INTO purchases (client_id, order_ref, order_date, product, quantity, rate, amount, channel, source, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)`,
        [clientId, r.ref, r.date, r.product, r.quantity, r.rate, r.quantity * r.rate, r.channel, user],
      );
    }
    return { added: rows.length, total: rows.reduce((s, r) => s + r.quantity * r.rate, 0) };
  });
}

export async function deletePurchase(id) {
  const r = await query(`DELETE FROM purchases WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows[0]) throw notFound("That purchase");
  return { id };
}

/* ---------- unmatched rows, imports ---------- */

async function linkRows(db, rawKey, clientId) {
  const r = await db.query(`UPDATE purchases SET client_id = $2 WHERE client_id IS NULL AND raw_key = $1 RETURNING id`, [rawKey, clientId]);
  await db.query(`INSERT INTO client_aliases (alias_key, client_id) VALUES ($1,$2) ON CONFLICT (alias_key) DO UPDATE SET client_id = EXCLUDED.client_id`, [rawKey, clientId]);
  return r.rowCount;
}

export async function linkUnmatched(rawKey, clientId) {
  if (!rawKey) throw bad("Missing buyer.");
  return tx(async (db) => {
    await mustHaveClient(db, clientId);
    return { linked: await linkRows(db, rawKey, clientId) };
  });
}

export async function undoImport(id) {
  return tx(async (db) => {
    const i = await db.query(`SELECT id, status FROM imports WHERE id = $1`, [id]);
    if (!i.rows[0]) throw notFound("That import");
    if (i.rows[0].status === "undone") throw bad("That import was already undone.");
    const r = await db.query(`DELETE FROM purchases WHERE import_id = $1`, [id]);
    // A leads import: forget its rows and remove the leads it created that have not ordered since.
    await db.query(`DELETE FROM lead_rows WHERE import_id = $1`, [id]);
    const gone = await db.query(`DELETE FROM clients c WHERE c.import_id = $1 AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.client_id = c.id) RETURNING id`, [id]);
    await db.query(`UPDATE imports SET status = 'undone' WHERE id = $1`, [id]);
    return { removed: r.rowCount + gone.rowCount };
  });
}

export async function getMapping(source) {
  const r = await query(`SELECT mapping FROM import_mappings WHERE source = $1`, [source]);
  return r.rows[0]?.mapping ?? null;
}

export async function saveMapping(source, mapping) {
  await query(
    `INSERT INTO import_mappings (source, mapping) VALUES ($1,$2::jsonb) ON CONFLICT (source) DO UPDATE SET mapping = EXCLUDED.mapping, updated_at = now()`,
    [source, JSON.stringify(mapping)],
  );
}

/* ---------- housekeeping ---------- */

export async function removeSampleData() {
  return tx(async (db) => {
    const ids = (await db.query(`SELECT id FROM clients WHERE is_sample`)).rows.map((r) => r.id);
    await db.query(`DELETE FROM purchases WHERE client_id IS NULL AND entered_by = 'sample'`);
    await db.query(`DELETE FROM imports WHERE created_by = 'sample'`);
    await db.query(`DELETE FROM clients WHERE is_sample`);
    return { clients: ids.length };
  });
}

/** Every table as JSON, for the backup download. */
export async function exportAll() {
  const tables = ["clients", "contacts", "notes", "facts", "documents", "purchases", "imports", "client_aliases", "import_mappings"];
  const out = { exportedAt: new Date().toISOString() };
  for (const t of tables) out[t] = (await query(`SELECT * FROM ${t}`)).rows;
  return out;
}
