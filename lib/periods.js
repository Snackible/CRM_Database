// Plain-English date ranges ("last month", "in March", "last 90 days") as inclusive ISO date pairs.
import { isoDay } from "./metrics.js";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const day = (y, m, d) => isoDay(new Date(y, m, d));
const label = (from, to) => {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  const fmt = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(f)} to ${fmt(t)}`;
};

/** Returns { from, to, label } or null when the text names no period. */
export function parsePeriod(text, today = new Date()) {
  const s = String(text).toLowerCase();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const todayIso = isoDay(today);
  let r;
  if (/\btoday\b/.test(s)) return { from: todayIso, to: todayIso, label: "today" };
  if (/\byesterday\b/.test(s)) return { from: day(y, m, d - 1), to: day(y, m, d - 1), label: "yesterday" };
  if ((r = s.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/))) {
    const n = Number(r[1]);
    const from = r[2] === "day" ? day(y, m, d - n + 1) : r[2] === "week" ? day(y, m, d - n * 7 + 1) : day(y, m - n, d + 1);
    return { from, to: todayIso, label: `the last ${n} ${r[2]}${n === 1 ? "" : "s"}` };
  }
  if (/\bthis week\b/.test(s)) {
    const monday = d - ((today.getDay() + 6) % 7);
    return { from: day(y, m, monday), to: todayIso, label: "this week" };
  }
  if (/\blast week\b/.test(s)) {
    const monday = d - ((today.getDay() + 6) % 7);
    return { from: day(y, m, monday - 7), to: day(y, m, monday - 1), label: "last week" };
  }
  if (/\b(this month|month to date|mtd)\b/.test(s)) return { from: day(y, m, 1), to: todayIso, label: "this month" };
  if (/\blast month\b/.test(s)) return { from: day(y, m - 1, 1), to: day(y, m, 0), label: "last month" };
  if (/\b(this year|year to date|ytd)\b/.test(s)) return { from: day(y, 0, 1), to: todayIso, label: "this year" };
  if (/\blast year\b/.test(s)) return { from: day(y - 1, 0, 1), to: day(y - 1, 11, 31), label: "last year" };
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MONTHS[i].slice(0, 3)})\\b(?:\\s+(\\d{4}))?`);
    if ((r = s.match(re)) && !(MONTHS[i] === "may" && !/\b(in|for|during|of)\s+may\b|\bmay\s+\d{4}\b/.test(s))) {
      const year = r[2] ? Number(r[2]) : i > m ? y - 1 : y; // "in November" asked in October means last November
      const from = day(year, i, 1);
      const to = year === y && i === m ? todayIso : day(year, i + 1, 0);
      return { from, to, label: `${MONTHS[i][0].toUpperCase()}${MONTHS[i].slice(1)} ${year}` };
    }
  }
  return null;
}

export function periodOrDefault(text, fallback, today = new Date()) {
  return parsePeriod(text, today) ?? parsePeriod(fallback, today);
}

export { label as rangeLabel };
