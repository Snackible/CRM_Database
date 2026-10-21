// What a CSV column can become. The importer and the mapping screen both read this list.

export const TARGETS = [
  { id: "client.code", label: "Client code", group: "Client" },
  { id: "client.name", label: "Client name", group: "Client" },
  { id: "client.email", label: "Client email", group: "Client" },
  { id: "client.phone", label: "Client phone", group: "Client" },
  { id: "client.city", label: "City", group: "Client" },
  { id: "client.extra", label: "Other client detail (keep as custom field)", group: "Client" },
  { id: "sale.ref", label: "Order or invoice number", group: "Purchase" },
  { id: "sale.date", label: "Order date", group: "Purchase" },
  { id: "sale.product", label: "Product", group: "Purchase" },
  { id: "sale.quantity", label: "Quantity", group: "Purchase" },
  { id: "sale.amount", label: "Amount", group: "Purchase" },
  { id: "sale.channel", label: "Channel", group: "Purchase" },
  { id: "sale.extra", label: "Other purchase detail (keep as custom field)", group: "Purchase" },
  { id: "ignore", label: "Don't import", group: "" },
];

export const MATCH_KEYS = ["client.code", "client.email", "client.phone", "client.name"];

const RULES = [
  ["client.email", /e ?mail/],
  ["client.phone", /phone|mobile|whatsapp|contact (no|number)|cell/],
  ["sale.date", /date|ordered on|purchase day/],
  ["sale.ref", /(order|invoice|bill|voucher|txn|transaction).*(id|no|number|ref)|^(invoice|voucher|order)$/],
  ["client.code", /(client|customer|party|account|dealer).*(id|code|no|number)|^(client|customer|party) code$/],
  ["sale.quantity", /qty|quantity|units|pieces|pcs|packs/],
  ["sale.amount", /amount|total|value|revenue|net sales|gmv|price/],
  ["sale.product", /product|item|sku|particulars|description/],
  ["sale.channel", /channel|source|mode|platform/],
  ["client.city", /city|town|location/],
  ["client.name", /(client|customer|party|account|dealer|buyer).*name|^(client|customer|party|name)$/],
];

export function guessTarget(header) {
  const h = header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const [target, re] of RULES) if (re.test(h)) return target;
  return null;
}

export function guessMapping(headers) {
  const guesses = headers.map((h) => [h, guessTarget(h)]);
  const hasSale = guesses.some(([, t]) => t && t.startsWith("sale."));
  const used = new Set();
  return Object.fromEntries(
    guesses.map(([h, t]) => {
      if (t && t !== "client.extra" && t !== "sale.extra" && used.has(t)) return [h, hasSale ? "sale.extra" : "client.extra"];
      if (t) used.add(t);
      return [h, t ?? (hasSale ? "sale.extra" : "client.extra")];
    }),
  );
}
