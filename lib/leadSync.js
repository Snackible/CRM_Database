// Best-effort write-back: when a lead's name, owner, or a lead-sourced contact's name/phone/email is edited in
// the CRM, try to write the same value into the cell it came from in the source Google Sheet. Only clients and
// contacts that remember a (source, row) -- set when that row first created them, see lib/leads.js -- are
// touched; anything made by hand or by CSV has nothing to sync to. Failures never block the CRM save: the
// caller catches and surfaces them, but the database write already happened.
import { query } from "./db.js";
import { sheetsConfigured, updateCells } from "./sheets.js";

const CLIENT_TARGET = { name: "lead.company", owner: "lead.owner" };
const CONTACT_TARGET = { name: "lead.name", phone: "lead.phone", email: "lead.email" };

/** The 1-based column a mapping target sits in, going by the order its headers were mapped in. */
export function columnFor(mapping, targetId) {
  const headers = Object.keys(mapping ?? {});
  const i = headers.findIndex((h) => mapping[h] === targetId);
  return i === -1 ? null : i + 1;
}

async function writeBack(sourceId, row, targetId, value) {
  if (!sourceId || !row || !sheetsConfigured()) return false;
  const s = (await query(`SELECT sheet_id, tab, mapping FROM sheet_sources WHERE id = $1`, [sourceId])).rows[0];
  if (!s) return false;
  const col = columnFor(s.mapping, targetId);
  if (!col) return false;
  await updateCells({ sheetId: s.sheet_id, tab: s.tab, cells: [{ row, col, value }] });
  return true;
}

/** Tries to sync one client field ("name" or "owner") back to its source row. Returns true, false, or throws. */
export async function syncClientField(clientId, field, value) {
  if (!(field in CLIENT_TARGET)) return false;
  const c = (await query(`SELECT lead_source_id, lead_row FROM clients WHERE id = $1`, [clientId])).rows[0];
  if (!c?.lead_source_id || !c.lead_row) return false;
  return writeBack(c.lead_source_id, c.lead_row, CLIENT_TARGET[field], value);
}

/** Tries to sync one contact field ("name", "phone" or "email") back to its source row. */
export async function syncContactField(contactId, field, value) {
  if (!(field in CONTACT_TARGET)) return false;
  const c = (await query(`SELECT lead_source_id, lead_row FROM contacts WHERE id = $1`, [contactId])).rows[0];
  if (!c?.lead_source_id || !c.lead_row) return false;
  return writeBack(c.lead_source_id, c.lead_row, CONTACT_TARGET[field], value);
}

/** Runs a set of field syncs, never throwing: collects which fields reached the sheet and the first error. */
export async function syncFields(fn, fields) {
  const synced = [];
  let error;
  for (const [field, value] of Object.entries(fields)) {
    try {
      if (await fn(field, value)) synced.push(field);
    } catch (e) {
      error ??= e.message;
    }
  }
  return { synced, error };
}
