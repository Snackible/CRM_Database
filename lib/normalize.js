// Turning messy CSV cells into clean values, and a row into a purchase plus the identity of its buyer.
import { createHash } from "node:crypto";

const NULLISH = /^(n\/?a|null|nan|none|nil|-+)$/i;

export function cleanText(v) {
  const s = String(v ?? "").trim();
  return s === "" || NULLISH.test(s) ? null : s;
}

export const last10 = (s) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export function parseNumber(value) {
  let s = String(value ?? "").trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma > dot) {
    const tail = s.length - comma - 1;
    s = tail === 3 && dot === -1 ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");

function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(value, dayFirst = true) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,].*)?$/))) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12) return iso(y, b, a);
    if (b > 12) return iso(y, a, b);
    return dayFirst ? iso(y, b, a) : iso(y, a, b);
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{4}|\d{2})\b/i))) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return mo ? iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, +m[1]) : null;
  }
  if ((m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return mo ? iso(+m[3], mo, +m[2]) : null;
  }
  if (/^\d{5}$/.test(s) && +s > 20000 && +s < 70000) {
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

/** The buyer's identity in priority order: client code, email, phone, name. Same key the aliases use. */
export function identityKey({ code, email, phone, name }) {
  if (code) return `code:${code.trim().toLowerCase()}`;
  if (email) return `email:${email.trim().toLowerCase()}`;
  if (last10(phone)) return `phone:${last10(phone)}`;
  if (name) return `name:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
  return null;
}

/**
 * Some sheets put the purchase order number in the buyer's name ("ZEPTO PRIVATE LIMITED P4779366",
 * "SCOOTSY LOGISTICS PRIVATE LIMITED FC5PO345070"), which would make every order a different client. This drops
 * a trailing token of 5+ characters that contains a digit, up to twice, and returns the name and what it removed.
 */
export function stripReferenceCode(name) {
  let s = String(name ?? "").trim().replace(/\s+/g, " ");
  const removed = [];
  for (let i = 0; i < 2; i++) {
    const m = s.match(/^(.*\S)\s+(?=[A-Za-z0-9/_-]*\d)([A-Za-z0-9/_-]{5,})$/);
    if (!m || m[1].length < 3) break;
    removed.unshift(m[2]);
    s = m[1];
  }
  return { name: s, code: removed.join(" ") || null };
}

/** One CSV row, read through the column mapping. */
export function readRow(row, mapping, options = {}) {
  const dayFirst = options.dayFirst !== false;
  const identity = { code: null, email: null, phone: null, name: null, city: null, extra: {} };
  const sale = { ref: null, date: null, product: null, quantity: null, amount: null, channel: null, extra: {} };
  const notes = [];
  for (const [header, target] of Object.entries(mapping)) {
    if (!target || target === "ignore") continue;
    const value = cleanText(row[header]);
    if (value === null) continue;
    switch (target) {
      case "client.code": identity.code = value; break;
      case "client.name": identity.name = value; break;
      case "client.email": identity.email = value.toLowerCase(); break;
      case "client.phone": identity.phone = value; break;
      case "client.city": identity.city = value; break;
      case "client.extra": identity.extra[header] = value; break;
      case "sale.ref": sale.ref = value; break;
      case "sale.product": sale.product = value; break;
      case "sale.channel": sale.channel = value; break;
      case "sale.extra": sale.extra[header] = value; break;
      case "sale.date": {
        sale.date = parseDate(value, dayFirst);
        if (!sale.date) notes.push(`unreadable date "${value}"`);
        break;
      }
      case "sale.quantity": {
        sale.quantity = parseNumber(value);
        if (sale.quantity === null) notes.push(`unreadable quantity "${value}"`);
        break;
      }
      case "sale.amount": {
        sale.amount = parseNumber(value);
        if (sale.amount === null) notes.push(`unreadable amount "${value}"`);
        break;
      }
    }
  }
  // `key` fingerprints the row (it must never change, or re-reading a sheet would add every order again);
  // `clientKey` is who the buyer is, which may ignore a PO number in the name.
  const key = identityKey(identity);
  let clientKey = key;
  if (options.stripPoCodes && identity.name) {
    const { name, code } = stripReferenceCode(identity.name);
    if (code) {
      identity.name = name;
      sale.extra["PO code"] = code;
      clientKey = identityKey(identity);
    }
  }
  const hasSale = ["ref", "date", "product", "quantity", "amount"].some((k) => sale[k] !== null);
  return { key, clientKey, identity, sale: hasSale ? sale : null, notes };
}

export function rowHash(key, sale, occurrence = 0) {
  return createHash("sha256")
    .update([key, sale.ref, sale.date, sale.product, sale.quantity, sale.amount, sale.channel, occurrence].join("\u001f"))
    .digest("hex");
}

// Looser name comparison for suggesting "looks like <client>" on unmatched buyers.
const tokens = (s) => new Set(String(s ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((t) => t.length > 1));
export function nameSimilarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  const stem = (t) => t.replace(/s$/, "");
  const xs = new Set([...x].map(stem));
  const ys = new Set([...y].map(stem));
  const both = [...xs].filter((t) => ys.has(t)).length;
  return both / Math.max(xs.size, ys.size);
}

/** One row of a leads sheet, read through the column mapping. The company, when there is one, is the client. */
export function readLead(row, mapping, options = {}) {
  const lead = { company: null, name: null, phone: null, email: null, owner: null, date: null, remarks: null, followup: null, status: [], extra: {} };
  for (const [header, target] of Object.entries(mapping)) {
    if (!target || target === "ignore") continue;
    const value = cleanText(row[header]);
    if (value === null) continue;
    switch (target) {
      case "lead.company": lead.company = value; break;
      case "lead.name": lead.name = value; break;
      case "lead.phone": lead.phone = value; break;
      case "lead.email": lead.email = value.toLowerCase(); break;
      case "lead.owner": lead.owner = value; break;
      case "lead.date": lead.date = parseDate(value, options.dayFirst !== false); break;
      case "lead.remarks": lead.remarks = value; break;
      case "lead.followup": lead.followup = value; break;
      case "lead.status": lead.status.push(`${header}: ${value}`); break;
      case "lead.extra": lead.extra[header] = value; break;
    }
  }
  const clientName = lead.company ?? lead.name;
  // A company is one client however many people from it appear; a lone person is keyed by email, phone or name.
  const key = lead.company ? `name:${lead.company.toLowerCase().replace(/\s+/g, " ")}` : identityKey({ email: lead.email, phone: lead.phone, name: lead.name });
  const noteLines = [lead.remarks && `Remarks: ${lead.remarks}`, lead.followup && `Follow-up: ${lead.followup}`, ...lead.status].filter(Boolean);
  return { key, clientName, lead, note: noteLines.join("\n") };
}

export function leadHash(sourceId, r) {
  const l = r.lead;
  return createHash("sha256").update([sourceId, r.key, l.name, l.phone, l.email, l.date, l.remarks, l.followup, l.status.join("|")].join("\u001f")).digest("hex");
}
