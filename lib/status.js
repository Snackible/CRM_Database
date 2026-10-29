// What counts as a sale. An order sheet's STATUS column also holds orders that are not sales: ones marked Duplicate
// (the same order entered twice), Cancelled, RTO (returned to origin, in any stage: "RTO - Delivered",
// "RTO - Intransit"...) and Internal PO. They stay on file and show on the client's order list, but are left out of
// revenue, order counts, standings and every other total. Anything else (Delivered, Pending, In-Transit, blank,
// a stray word like "WEDNESDAY") is a sale. The same words are used by scripts/recount-sales.mjs for old rows.
export const NOT_A_SALE = /^\s*(duplicate|cancel|rto|internal po|void)/i;

/** The order's status from the extra columns kept with it, whatever the sheet calls the column (STATUS, Status...). */
export function statusOf(extra) {
  if (!extra || typeof extra !== "object") return "";
  const key = Object.keys(extra).find((k) => k.trim().toLowerCase() === "status");
  return key ? String(extra[key] ?? "").trim() : "";
}

export const isSale = (status) => !NOT_A_SALE.test(String(status ?? ""));
export const countsAsSale = (extra) => isSale(statusOf(extra));
