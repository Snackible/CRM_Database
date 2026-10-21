// Small RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes, BOM, and comma / semicolon / tab / pipe delimiters.

function detectDelimiter(text) {
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(input) {
  const text = String(input).replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const table = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      table.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    table.push(row);
  }

  const lines = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (lines.length === 0) return { headers: [], rows: [], delimiter };

  const seen = new Map();
  const headers = lines[0].map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = lines.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
  return { headers, rows, delimiter };
}
