// Pattern rules that turn pasted or extracted text into suggested facts. One entry per rule,
// in the style of the QC tool's rule tables. Suggestions are only ever proposals: a person approves each.

const DAY = "(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?s?";
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
// A date as people write it in notes: "5 Nov", "Nov 5th", "05/11", "Monday", "tomorrow", "next week".
const WHEN = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|(?:next\\s+)?${DAY}|tomorrow|next\\s+(?:week|month))`;

export const RULES = [
  { id: "gstin", category: "Identity", key: "GSTIN", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
  { id: "pan", category: "Identity", key: "PAN", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { id: "fssai", category: "Identity", key: "FSSAI licence", re: /(?:fssai|fss)[^\d]{0,25}(\d{14})\b/gi, group: 1 },
  { id: "email", category: "Contact", key: "Email", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { id: "phone", category: "Contact", key: "Phone", re: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g },
  { id: "terms", category: "Commercial", key: "Payment terms", re: /\bnet\s*\d{1,3}\b|\b\d{1,3}\s*days?\s*(?:credit|payment)\b|\bcash on delivery\b|\bCOD\b|\badvance payment\b/gi },
  { id: "moq", category: "Commercial", key: "Minimum order", re: /\b(?:MOQ|minimum order(?: quantity)?)\W{0,6}(?:of\s+)?\d[\d,]*(?:\s*packs?|\s*units?|\s*cases?)?/gi },
  { id: "discount", category: "Commercial", key: "Discount or margin", re: /\b\d{1,2}(?:\.\d+)?\s*%\s*(?:discount|off|margin|trade margin)\b/gi },
  { id: "gst", category: "Commercial", key: "GST rate", re: /\bGST\s*(?:@|of)?\s*\d{1,2}\s*%/gi },
  { id: "delivery", category: "Delivery", key: "Delivery day", re: new RegExp(`\\b(?:deliver(?:y|ed)?|drop|dispatch)[^.\\n]{0,40}?\\b(?:every|on)\\s+${DAY}[^.,\\n]{0,40}`, "gi") },
  { id: "lead", category: "Delivery", key: "Lead time", re: /\b(?:lead time|at least|within)\s+\w+\s+(?:working\s+)?days\b/gi },
  { id: "pincode", category: "Identity", key: "Pincode", re: /\b[1-9]\d{5}\b(?=\W|$)/g },
  // Mostly from call notes.
  { id: "followup", category: "Follow-up", key: "Next step", re: new RegExp(`\\b(?:follow[\\s-]?up|call\\s+(?:back|again)|call\\s+them|meet(?:ing)?|visit|revert|send\\s+(?:the\\s+)?(?:samples?|catalog(?:ue)?|quote|quotation|price\\s*list))\\b[^.\\n]{0,40}?\\b(?:on|by|before|after)?\\s*${WHEN}\\b`, "gi") },
  { id: "spoke", category: "Contact", key: "Spoke with", re: /\b(?:[Ss]poke|[Tt]alked|[Mm]et|[Cc]alled|[Cc]hatted)\s+(?:to|with)\s+((?:Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, group: 1 },
  { id: "amount", category: "Commercial", key: "Amount mentioned", re: /(?:₹|\bRs\.?|\bINR)\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr|k)\b)?|\b\d+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?)\b/gi },
  { id: "volume", category: "Commercial", key: "Volume", re: /\b\d[\d,]*\s*(?:packs?|units?|cases?|boxes|cartons?|kgs?|pieces|pcs)\s*(?:a|per|every|each)\s*(?:day|week|month|quarter)\b/gi },
];

const PRODUCT_INTEREST = [/no palm oil/i, /baked not fried/i, /gluten free/i, /vegan/i, /roasted makhana/i, /millet/i];

function sentenceAround(text, start, end) {
  const from = Math.max(text.lastIndexOf(". ", start), text.lastIndexOf("\n", start)) + 1;
  let to = text.slice(end).search(/[.\n]/);
  to = to === -1 ? text.length : end + to + 1;
  return text.slice(from, to).trim();
}

export function suggestFacts(text) {
  const out = [];
  const seen = new Set();
  const add = (rule, value, start, end) => {
    const id = `${rule.key}|${value.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ category: rule.category, key: rule.key, value: value.trim(), snippet: sentenceAround(text, start, end), start, end, state: "pending" });
  };
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const value = rule.group ? m[rule.group] : m[0];
      const start = m.index + (rule.group ? m[0].indexOf(value) : 0);
      add(rule, value, start, start + value.length);
    }
  }
  for (const re of PRODUCT_INTEREST) {
    const m = re.exec(text);
    if (m) add({ category: "Product interest", key: "Mentions" }, m[0], m.index, m.index + m[0].length);
  }
  return out.sort((a, b) => a.start - b.start);
}
