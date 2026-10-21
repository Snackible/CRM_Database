// SAMPLE DATA. Every client, person, number and document below is invented to show the design.
// Replace with the database once the API exists.

export const TODAY = new Date("2026-10-21T00:00:00");

// Month 0 is Nov 2025, month 11 is Oct 2026: the twelve cells of the berth strip.
export const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2025, 10 + i, 1);
  return {
    index: i,
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    short: d.toLocaleString("en-IN", { month: "short" }),
    letter: d.toLocaleString("en-IN", { month: "short" }).slice(0, 1),
    label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    year: d.getFullYear(),
    month: d.getMonth(),
  };
});

export const PRODUCTS = [
  { name: "Chatpata Millet Finger 40g", rate: 18 },
  { name: "Peri Peri Ragi Chips 50g", rate: 22 },
  { name: "Cream & Onion Jowar Puffs 35g", rate: 16 },
  { name: "Roasted Makhana Pudina 30g", rate: 38 },
  { name: "Millet Mixture 150g", rate: 54 },
];

export const OWNERS = ["Aditi", "Karan", "Meera"];
export const SEGMENTS = ["Modern trade", "Kirana", "Distributor", "Cafe", "Corporate cafeteria", "Sweet shop", "Retail kiosk", "Organic store"];
export const FACT_CATEGORIES = ["Commercial", "Delivery", "Identity", "Contact", "Product interest", "Other"];

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildPurchases(client) {
  const rand = rng(client.seed);
  const rows = [];
  let n = 1;
  client.pattern.forEach((count, mi) => {
    const m = MONTHS[mi];
    for (let k = 0; k < count; k++) {
      const lastDay = mi === 11 ? Math.min(client.lastDay ?? 20, 20) : 28;
      const day = Math.max(1, Math.min(lastDay, Math.round(((k + 0.5) / count) * lastDay - rand() * 4)));
      const date = new Date(m.year, m.month, day);
      if (date > TODAY) continue;
      const lines = 1 + Math.floor(rand() * 2);
      for (let l = 0; l < lines; l++) {
        const p = PRODUCTS[(client.mix[(k + l) % client.mix.length]) % PRODUCTS.length];
        const qty = client.qty * (1 + Math.floor(rand() * 3));
        rows.push({
          id: `${client.id}-${n++}`,
          date: date.toISOString().slice(0, 10),
          ref: `INV-${client.code.slice(-3)}${String(mi + 1).padStart(2, "0")}${k + 1}`,
          product: p.name,
          qty,
          rate: p.rate,
          amount: qty * p.rate,
          channel: client.channel,
          source: client.csvFrom !== undefined && mi >= client.csvFrom ? "csv" : "manual",
        });
      }
    }
  });
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

const RAW = [
  {
    id: "greenleaf-mart", code: "SN-0412", name: "Greenleaf Mart", segment: "Modern trade", city: "Bengaluru", owner: "Aditi", since: "2025-03-14",
    status: "Active", seed: 11, pattern: [2, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2], lastDay: 17, mix: [0, 1, 3, 2], qty: 120, channel: "Direct", csvFrom: 4,
    gstin: "29AABCG4421K1Z7", email: "purchase@greenleafmart.example", phone: "+91 98450 00117",
    contacts: [
      { name: "Ritika Menon", role: "Category buyer", phone: "+91 98450 00117", email: "ritika@greenleafmart.example" },
      { name: "Suresh Pai", role: "Warehouse in-charge", phone: "+91 98450 00342", email: "" },
    ],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Net 30 from invoice date", source: { type: "document", label: "Supply MoU.pdf", date: "2026-01-12" }, snippet: "Payment shall be made within thirty (30) days of the invoice date. Net 30." },
      { category: "Commercial", key: "Minimum order", value: "MOQ 120 packs per SKU", source: { type: "document", label: "Supply MoU.pdf", date: "2026-01-12" }, snippet: "Minimum order quantity of 120 packs per SKU per delivery." },
      { category: "Commercial", key: "Trade margin", value: "22% on MRP", source: { type: "manual", label: "Aditi", date: "2026-02-03" }, snippet: "" },
      { category: "Delivery", key: "Delivery day", value: "Every Tuesday, before 11 am", source: { type: "document", label: "Re: weekly drop timing", date: "2026-06-09" }, snippet: "Please plan the drop every Tuesday before 11 am; the dock closes for lunch." },
      { category: "Delivery", key: "Receiving address", value: "Plot 14, Peenya Industrial Area, Bengaluru 560058", source: { type: "document", label: "Supply MoU.pdf", date: "2026-01-12" }, snippet: "Goods to be delivered to Plot 14, Peenya Industrial Area, Bengaluru 560058." },
      { category: "Identity", key: "GSTIN", value: "29AABCG4421K1Z7", source: { type: "pattern", label: "Supply MoU.pdf", date: "2026-01-12" }, snippet: "GSTIN: 29AABCG4421K1Z7" },
      { category: "Product interest", key: "Asks about", value: "No Palm Oil range, Roasted Makhana", source: { type: "manual", label: "Karan", date: "2026-08-21" }, snippet: "" },
    ],
    notes: [
      { text: "Ritika wants a shelf-ready display tray for the Peri Peri chips before Diwali. Sent photos; waiting on her layout.", author: "Aditi", date: "2026-10-14" },
      { text: "Warehouse rejected two cartons for dented corners. Credit note raised, reason logged with ops.", author: "Karan", date: "2026-08-28" },
      { text: "Onboarded six stores in the first phase, four more planned for Q1.", author: "Aditi", date: "2026-03-20" },
    ],
    documents: [
      { title: "Supply MoU.pdf", date: "2026-01-12", chars: 6120 },
      { title: "Re: weekly drop timing", date: "2026-06-09", chars: 740 },
    ],
  },
  {
    id: "sharma-general", code: "SN-0388", name: "Sharma & Sons General Store", segment: "Kirana", city: "Delhi", owner: "Karan", since: "2025-02-02",
    status: "Active", seed: 21, pattern: [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1], lastDay: 9, mix: [0, 2, 4], qty: 24, channel: "Phone",
    gstin: "07AAAFS9910F1ZP", email: "", phone: "+91 98100 22091",
    contacts: [{ name: "Mohan Sharma", role: "Owner", phone: "+91 98100 22091", email: "" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Cash on delivery", source: { type: "manual", label: "Karan", date: "2025-02-02" }, snippet: "" },
      { category: "Delivery", key: "Delivery day", value: "Any weekday after 3 pm", source: { type: "manual", label: "Karan", date: "2025-02-02" }, snippet: "" },
      { category: "Contact", key: "WhatsApp", value: "+91 98100 22091", source: { type: "pattern", label: "WhatsApp export.txt", date: "2026-05-11" }, snippet: "12/05/26, 4:32 pm - Mohan Sharma: bhej do kal, 98100 22091 pe call karna" },
    ],
    notes: [{ text: "Skips the months when the shop is closed for the family wedding season. Call early Nov.", author: "Karan", date: "2026-09-02" }],
    documents: [{ title: "WhatsApp export.txt", date: "2026-05-11", chars: 3410 }],
  },
  {
    id: "brew-bite", code: "SN-0431", name: "Brew & Bite Cafe", segment: "Cafe", city: "Pune", owner: "Meera", since: "2025-10-06",
    status: "Active", seed: 31, pattern: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], lastDay: 5, mix: [3, 4], qty: 12, channel: "Phone",
    gstin: "", email: "hello@brewbite.example", phone: "+91 98220 55014",
    contacts: [{ name: "Neha Joshi", role: "Owner", phone: "+91 98220 55014", email: "hello@brewbite.example" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Advance payment by UPI", source: { type: "manual", label: "Meera", date: "2026-01-09" }, snippet: "" },
      { category: "Product interest", key: "Prefers", value: "Roasted Makhana Pudina for the counter display", source: { type: "manual", label: "Meera", date: "2026-03-18" }, snippet: "" },
    ],
    notes: [{ text: "Said August was slow after the second branch closed. Last call went to voicemail.", author: "Meera", date: "2026-09-17" }],
    documents: [],
  },
  {
    id: "metro-fresh", code: "SN-0402", name: "Metro Fresh Foods", segment: "Distributor", city: "Mumbai", owner: "Aditi", since: "2025-04-21",
    status: "Active", seed: 41, pattern: [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 3], lastDay: 19, mix: [0, 1, 2, 4], qty: 240, channel: "Direct", csvFrom: 2,
    gstin: "27AAECM7821Q1Z2", email: "orders@metrofresh.example", phone: "+91 98670 31220",
    contacts: [
      { name: "Imran Qureshi", role: "Purchase head", phone: "+91 98670 31220", email: "imran@metrofresh.example" },
      { name: "Pooja Naik", role: "Accounts", phone: "+91 98670 31288", email: "accounts@metrofresh.example" },
    ],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Net 45", source: { type: "document", label: "Distributor agreement.docx", date: "2025-05-02" }, snippet: "Net 45 days from the date of delivery." },
      { category: "Commercial", key: "Discount", value: "8% on orders above ₹2,00,000", source: { type: "document", label: "Distributor agreement.docx", date: "2025-05-02" }, snippet: "A volume discount of 8% applies to any single order exceeding Rs. 2,00,000." },
      { category: "Delivery", key: "Lead time", value: "5 working days", source: { type: "ai", label: "Re: Diwali stock", date: "2026-09-30" }, snippet: "We need the stock at least five working days before the festival window." },
      { category: "Identity", key: "GSTIN", value: "27AAECM7821Q1Z2", source: { type: "pattern", label: "Distributor agreement.docx", date: "2025-05-02" }, snippet: "GSTIN 27AAECM7821Q1Z2" },
    ],
    notes: [{ text: "Largest account by volume. Imran is planning a Diwali pack-out; wants first call on new flavours.", author: "Aditi", date: "2026-10-10" }],
    documents: [{ title: "Distributor agreement.docx", date: "2025-05-02", chars: 9840 }, { title: "Re: Diwali stock", date: "2026-09-30", chars: 1260 }],
  },
  {
    id: "vedic-organics", code: "SN-0359", name: "Vedic Organics Retail", segment: "Organic store", city: "Hyderabad", owner: "Karan", since: "2024-11-18",
    status: "Lapsed", seed: 51, pattern: [2, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0], lastDay: 5, mix: [1, 3], qty: 36, channel: "Direct",
    gstin: "36AAFCV1180M1ZK", email: "store@vedicorganics.example", phone: "+91 98480 61100",
    contacts: [{ name: "Lakshmi Reddy", role: "Store manager", phone: "+91 98480 61100", email: "store@vedicorganics.example" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Net 15", source: { type: "manual", label: "Karan", date: "2024-11-18" }, snippet: "" },
      { category: "Other", key: "Reason for stopping", value: "Moved to a local supplier with lower rates", source: { type: "manual", label: "Karan", date: "2026-06-20" }, snippet: "" },
    ],
    notes: [{ text: "Last order in May. Lakshmi said the price gap on makhana was too big; offered a trial price, no reply yet.", author: "Karan", date: "2026-06-20" }],
    documents: [],
  },
  {
    id: "orbit-cafeteria", code: "SN-0447", name: "Orbit Foods Cafeteria", segment: "Corporate cafeteria", city: "Gurugram", owner: "Meera", since: "2026-04-08",
    status: "Active", seed: 61, pattern: [0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2], lastDay: 15, mix: [0, 2, 4], qty: 48, channel: "Email", csvFrom: 5,
    gstin: "06AABCO5512D1Z9", email: "procurement@orbitfoods.example", phone: "+91 124 400 8821",
    contacts: [{ name: "Vikram Anand", role: "Procurement", phone: "+91 124 400 8821", email: "procurement@orbitfoods.example" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Net 60, PO required", source: { type: "document", label: "Vendor onboarding form.pdf", date: "2026-04-08" }, snippet: "Payment terms: Net 60. A purchase order is mandatory for each delivery." },
      { category: "Delivery", key: "Delivery day", value: "Mondays and Thursdays", source: { type: "document", label: "Vendor onboarding form.pdf", date: "2026-04-08" }, snippet: "Deliveries accepted Mondays and Thursdays, 9 am to 12 pm." },
      { category: "Identity", key: "Vendor code", value: "V-20418", source: { type: "manual", label: "Meera", date: "2026-04-10" }, snippet: "" },
    ],
    notes: [{ text: "Trial went well; they asked for single-serve packs under ₹15.", author: "Meera", date: "2026-07-02" }],
    documents: [{ title: "Vendor onboarding form.pdf", date: "2026-04-08", chars: 2310 }],
  },
  {
    id: "nilgiri-super", code: "SN-0420", name: "Nilgiri Superstore", segment: "Modern trade", city: "Chennai", owner: "Aditi", since: "2025-06-30",
    status: "Active", seed: 71, pattern: [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0], lastDay: 5, mix: [0, 1, 3], qty: 60, channel: "Direct",
    gstin: "33AAGCN3302J1ZB", email: "buying@nilgiri.example", phone: "+91 98400 71811",
    contacts: [{ name: "Anitha Raman", role: "Buyer", phone: "+91 98400 71811", email: "buying@nilgiri.example" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Net 30", source: { type: "manual", label: "Aditi", date: "2025-06-30" }, snippet: "" },
      { category: "Delivery", key: "Delivery day", value: "Saturdays", source: { type: "manual", label: "Aditi", date: "2025-06-30" }, snippet: "" },
    ],
    notes: [{ text: "Orders every other month. Anitha is on leave until the first week of November.", author: "Aditi", date: "2026-09-25" }],
    documents: [],
  },
  {
    id: "kapoor-sweets", code: "SN-0395", name: "Kapoor Sweets & Snacks", segment: "Sweet shop", city: "Jaipur", owner: "Karan", since: "2025-01-22",
    status: "Active", seed: 81, pattern: [3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1], lastDay: 7, mix: [4, 3, 2], qty: 30, channel: "Phone",
    gstin: "08AACFK6613L1Z4", email: "", phone: "+91 94140 92110",
    contacts: [{ name: "Ashok Kapoor", role: "Owner", phone: "+91 94140 92110", email: "" }],
    facts: [
      { category: "Commercial", key: "Payment terms", value: "Weekly settlement", source: { type: "manual", label: "Karan", date: "2025-01-22" }, snippet: "" },
      { category: "Product interest", key: "Festival boxes", value: "Wants gift-box packs for Diwali", source: { type: "manual", label: "Karan", date: "2026-09-12" }, snippet: "" },
    ],
    notes: [],
    documents: [],
  },
  {
    id: "anand-bazaar", code: "SN-0410", name: "Anand Bazaar", segment: "Kirana", city: "Kolkata", owner: "Meera", since: "2025-05-12",
    status: "Active", seed: 91, pattern: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], lastDay: 5, mix: [0, 1], qty: 36, channel: "Phone",
    gstin: "19AAHFA2204B1ZM", email: "", phone: "+91 98300 40012",
    contacts: [{ name: "Debashis Roy", role: "Owner", phone: "+91 98300 40012", email: "" }],
    facts: [{ category: "Delivery", key: "Delivery day", value: "Wednesday", source: { type: "manual", label: "Meera", date: "2025-05-12" }, snippet: "" }],
    notes: [],
    documents: [],
  },
  {
    id: "skyline-kiosks", code: "SN-0452", name: "Skyline Airport Kiosks", segment: "Retail kiosk", city: "Mumbai", owner: "Aditi", since: "2026-07-01",
    status: "Active", seed: 101, pattern: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], lastDay: 12, mix: [3, 1], qty: 72, channel: "Direct", csvFrom: 8,
    gstin: "27AAJCS8841P1Z1", email: "ops@skylinekiosks.example", phone: "+91 98200 17760",
    contacts: [{ name: "Farhan Shaikh", role: "Operations", phone: "+91 98200 17760", email: "ops@skylinekiosks.example" }],
    facts: [{ category: "Commercial", key: "Payment terms", value: "Net 30", source: { type: "pattern", label: "Re: first order", date: "2026-07-03" }, snippet: "Please confirm Net 30 terms on the first invoice." }],
    notes: [{ text: "Airside deliveries need a gate pass raised two days ahead.", author: "Aditi", date: "2026-07-04" }],
    documents: [{ title: "Re: first order", date: "2026-07-03", chars: 560 }],
  },
];

// Purchase rows that matched no client: they wait for a person to link or create.
export const UNMATCHED = [
  { id: "u1", identity: { name: "Metro Fresh Food (Mumbai)", email: "", phone: "", code: "" }, file: "tally-oct-2026.csv", rows: [
    { date: "2026-10-12", ref: "TL-7741", product: "Peri Peri Ragi Chips 50g", qty: 240, amount: 5280 },
    { date: "2026-10-12", ref: "TL-7741", product: "Cream & Onion Jowar Puffs 35g", qty: 240, amount: 3840 },
  ], suggestion: "metro-fresh" },
  { id: "u2", identity: { name: "", email: "", phone: "9811000042", code: "" }, file: "tally-oct-2026.csv", rows: [
    { date: "2026-10-03", ref: "TL-7702", product: "Millet Mixture 150g", qty: 60, amount: 3240 },
  ], suggestion: null },
  { id: "u3", identity: { name: "Lotus Provision Store", email: "lotusprovision@example.com", phone: "", code: "" }, file: "tally-sep-2026.csv", rows: [
    { date: "2026-09-27", ref: "TL-7655", product: "Chatpata Millet Finger 40g", qty: 120, amount: 2160 },
    { date: "2026-09-27", ref: "TL-7655", product: "Roasted Makhana Pudina 30g", qty: 48, amount: 1824 },
    { date: "2026-09-14", ref: "TL-7610", product: "Chatpata Millet Finger 40g", qty: 120, amount: 2160 },
  ], suggestion: null },
];

export const IMPORTS = [
  { id: 14, file: "tally-oct-2026.csv", date: "2026-10-19", by: "Aditi", status: "Done", rows: 86, added: 71, duplicate: 9, unmatched: 6 },
  { id: 13, file: "tally-sep-2026.csv", date: "2026-09-30", by: "Aditi", status: "Done", rows: 92, added: 84, duplicate: 3, unmatched: 5 },
  { id: 12, file: "tally-aug-2026.csv", date: "2026-08-31", by: "Karan", status: "Done", rows: 78, added: 78, duplicate: 0, unmatched: 0 },
  { id: 11, file: "orders-test.csv", date: "2026-08-12", by: "Aditi", status: "Undone", rows: 14, added: 0, duplicate: 0, unmatched: 0 },
];

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function money(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
}

export function dateLabel(iso, withYear = true) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function agoLabel(days) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

function enrich(raw) {
  const purchases = buildPurchases(raw);
  const months = MONTHS.map((m) => {
    const inMonth = purchases.filter((p) => p.date.startsWith(m.key));
    const orders = new Set(inMonth.map((p) => p.ref)).size;
    return { ...m, orders, amount: inMonth.reduce((s, p) => s + p.amount, 0) };
  });
  const last = purchases[0]?.date ?? null;
  const daysSince = last ? daysBetween(new Date(`${last}T00:00:00`), TODAY) : null;
  const orderDates = [...new Set(purchases.map((p) => p.date))].sort();
  const gaps = orderDates.slice(1).map((d, i) => daysBetween(new Date(`${orderDates[i]}T00:00:00`), new Date(`${d}T00:00:00`)));
  const usualGap = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
  const standing = daysSince === null ? "New" : daysSince <= 45 ? "Active" : daysSince <= 75 ? "Watch" : "Lapsed";
  // trailing empty months mark where the account has gone quiet
  let quiet = 0;
  for (let i = 11; i >= 0 && months[i].orders === 0; i--) quiet++;
  return {
    ...raw,
    purchases,
    months,
    quietMonths: quiet,
    lastOrder: last,
    daysSince,
    usualGap,
    standing,
    revenue: purchases.reduce((s, p) => s + p.amount, 0),
    orderCount: new Set(purchases.map((p) => p.ref)).size,
  };
}

export const CLIENTS = RAW.map(enrich);

export function getClient(id) {
  return CLIENTS.find((c) => c.id === id) ?? null;
}

export function timelineFor(client) {
  const items = [];
  client.notes.forEach((n) => items.push({ kind: "note", date: n.date, title: n.author, body: n.text }));
  client.documents.forEach((d) => items.push({ kind: "document", date: d.date, title: d.title, body: `${d.chars.toLocaleString("en-IN")} characters of text kept` }));
  const byOrder = new Map();
  client.purchases.forEach((p) => {
    const k = `${p.date}|${p.ref}`;
    const o = byOrder.get(k) ?? { kind: "purchase", date: p.date, title: p.ref, amount: 0, lines: [] };
    o.amount += p.amount;
    o.lines.push(p);
    byOrder.set(k, o);
  });
  byOrder.forEach((o) => items.push({ ...o, body: o.lines.map((l) => `${l.qty} × ${l.product}`).join(", ") }));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function searchAll(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  CLIENTS.forEach((c) => {
    if ([c.name, c.code, c.city, c.segment, c.gstin, c.email, c.phone].some((v) => (v || "").toLowerCase().includes(needle))) {
      hits.push({ type: "Client", clientId: c.id, title: c.name, detail: `${c.code} · ${c.segment} · ${c.city}` });
    }
    c.contacts.forEach((p) => {
      if ([p.name, p.email, p.phone].some((v) => (v || "").toLowerCase().includes(needle))) {
        hits.push({ type: "Contact", clientId: c.id, title: p.name, detail: `${p.role} at ${c.name}` });
      }
    });
    c.facts.forEach((f) => {
      if ([f.key, f.value, f.snippet].some((v) => (v || "").toLowerCase().includes(needle))) {
        hits.push({ type: "Fact", clientId: c.id, title: `${f.key}: ${f.value}`, detail: `${c.name} · ${f.category}`, snippet: f.snippet });
      }
    });
    c.notes.forEach((n) => {
      if (n.text.toLowerCase().includes(needle)) hits.push({ type: "Note", clientId: c.id, title: n.text, detail: `${c.name} · ${n.author}, ${dateLabel(n.date)}` });
    });
  });
  return hits;
}
