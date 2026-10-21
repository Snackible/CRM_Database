"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Download, FileSpreadsheet, RefreshCw, Sheet, Upload } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { MATCH_KEYS, TARGETS, guessMapping } from "@/lib/fields";
import { dateLabel } from "@/lib/format";
import { api } from "@/lib/client-api";

const SAMPLE = `Party Name,Party Code,Mobile,Invoice No,Invoice Date,Item,Qty,Net Amount
Greenleaf Mart,SN-0412,,INV-9001,12/10/2026,Chatpata Millet Finger 40g,240,"4,320.00"
Greenleaf Mart,SN-0412,,INV-9001,12/10/2026,Peri Peri Ragi Chips 50g,120,"2,640.00"
Sharma & Sons General Store,,9810022091,INV-9002,09/10/2026,Millet Mixture 150g,24,"1,296.00"
Metro Fresh Food (Mumbai),,,INV-9003,12/10/2026,Cream & Onion Jowar Puffs 35g,240,"3,840.00"
Orbit Foods Cafeteria,SN-0447,,INV-9004,15/10/2026,Roasted Makhana Pudina 30g,96,"3,648.00"
Lotus Provision Store,,,INV-9005,18/10/2026,Chatpata Millet Finger 40g,120,"2,160.00"
`;
const TEMPLATE = "Client code,Client name,Order number,Order date,Product,Quantity,Amount,Channel\n";
const BATCH_ROWS = 400;
const BATCH_BYTES = 900_000;

export default function ImportFlow({ isAdmin, sheetsConfigured, sources }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null); // { name, headers, rows, sheet? }
  const [mapping, setMapping] = useState({});
  const [dayFirst, setDayFirst] = useState("day");
  const [remember, setRemember] = useState(true);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [savedMapping, setSavedMapping] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [tab, setTab] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const signature = file ? file.headers.join("|") : "";

  async function load(name, headers, rows, sheet = null) {
    let m = guessMapping(headers);
    let reused = false;
    try {
      const { mapping: saved } = await api(`/api/mappings?signature=${encodeURIComponent(headers.join("|"))}`);
      if (saved) {
        m = Object.fromEntries(headers.map((h) => [h, saved[h] ?? m[h]]));
        reused = true;
      }
    } catch {}
    setSavedMapping(reused);
    setError("");
    setFile({ name, headers, rows, sheet });
    setMapping(m);
    setStep(2);
  }
  async function loadText(name, text) {
    const parsed = parseCsv(text);
    if (parsed.headers.length < 2 || parsed.rows.length === 0) {
      setError("That file has no rows to read. Check it is a CSV with a header line.");
      return;
    }
    await load(name, parsed.headers, parsed.rows);
  }
  async function onFile(f) {
    if (f) await loadText(f.name, await f.text());
  }
  async function readSheet() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/sheets", { method: "POST", body: { action: "preview", sheetUrl, tab } });
      if (!r.rows.length) throw new Error("That tab has a header row but no orders yet.");
      await load(`Google Sheet: ${tab}`, r.headers, r.rows, { sheetUrl, tab, total: r.total });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const mapped = Object.values(mapping);
  const hasKey = MATCH_KEYS.some((k) => mapped.includes(k));
  const hasSale = mapped.includes("sale.amount") || mapped.includes("sale.product") || mapped.includes("sale.quantity");
  const options = { dayFirst: dayFirst === "day" };

  async function runFileImport() {
    const { importId } = await api("/api/import", {
      method: "POST",
      body: { action: "start", filename: file.name, totalRows: file.rows.length, mapping, options, remember, signature },
    });
    const total = { rows: 0, added: 0, duplicates: 0, unmatched: 0, skipped: 0 };
    let i = 0;
    try {
      while (i < file.rows.length) {
        const batch = [];
        let bytes = 0;
        while (i + batch.length < file.rows.length && batch.length < BATCH_ROWS && bytes < BATCH_BYTES) {
          const row = file.rows[i + batch.length];
          bytes += JSON.stringify(row).length;
          batch.push(row);
        }
        const b = await api("/api/import", { method: "POST", body: { action: "batch", importId, offset: i, rows: batch } });
        for (const k of Object.keys(total)) total[k] += b[k];
        i += batch.length;
        setProgress({ done: i, total: file.rows.length });
      }
    } catch (e) {
      await api("/api/import", { method: "POST", body: { action: "finish", importId, status: "failed" } }).catch(() => {});
      throw new Error(`${e.message} ${i} of ${file.rows.length} rows were saved before it stopped; uploading the same file again adds only the rest.`);
    }
    const done = await api("/api/import", { method: "POST", body: { action: "finish", importId } });
    return { ...total, errors: done.errors };
  }

  async function runSheetImport() {
    const { id } = await api("/api/sheets", {
      method: "POST",
      body: { action: "create", name: file.sheet.tab, sheetUrl: file.sheet.sheetUrl, tab: file.sheet.tab, mapping, dayFirst: options.dayFirst },
    });
    if (remember) await api("/api/mappings", { method: "POST", body: { signature, mapping } }).catch(() => {});
    const r = await api(`/api/sheets/${id}`, { method: "POST" });
    return { ...r, errors: [] };
  }

  async function start() {
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: file.rows.length });
    setStep(3);
    try {
      setResult(file.sheet ? await runSheetImport() : await runFileImport());
      router.refresh();
    } catch (e) {
      setError(e.message);
      setStep(2);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function syncFeed(id) {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/sheets/${id}`, { method: "POST" });
      setResult({ ...r, errors: [] });
      setStep(3);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Choose source", "Match columns", "Result"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Purchases from a file or sheet</h1>
          <p>Upload a sales export or connect a Google Sheet of customer orders. Rows are matched to clients by code, email, phone or name, and loading the same rows again adds nothing twice.</p>
        </div>
      </div>

      <ol className="steps" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={step === i + 1 ? "cur" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}>
            <span className="n">{step > i + 1 ? <Check size={15} aria-hidden="true" /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}

      {step === 1 && (
        <>
          <section className="panel">
            <div className="panel-head"><h2>Upload a CSV</h2></div>
            <div className="panel-body stack">
              <label
                className={`drop${over ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}
              >
                <Upload size={28} aria-hidden="true" />
                <strong>Drop a CSV here, or choose one</strong>
                <span className="muted">Any columns. You decide in the next step what each one means.</span>
                <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => onFile(e.target.files[0])} />
                <span className="btn">Choose file</span>
              </label>
              <div className="row">
                <button className="btn" onClick={() => loadText("sample-tally-export.csv", SAMPLE)}><FileSpreadsheet size={17} aria-hidden="true" /> Try with a sample file</button>
                <a className="btn quiet" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="purchase-template.csv"><Download size={17} aria-hidden="true" /> Download template</a>
              </div>
            </div>
          </section>

          {isAdmin && <section className="panel" aria-labelledby="gs-h">
            <div className="panel-head"><h2 id="gs-h">Google Sheet of customer orders</h2><span className="sub">Read again whenever you like; new rows are added, old ones skipped</span></div>
            <div className="panel-body stack">
              {!sheetsConfigured && (
                <div className="notice info">
                  <Sheet size={20} aria-hidden="true" />
                  <div>Google Sheets is not connected on this server yet. Add <b>GOOGLE_SERVICE_ACCOUNT_EMAIL</b> and <b>GOOGLE_PRIVATE_KEY</b> to the settings, then share the sheet with that address. Everything below works once they are set.</div>
                </div>
              )}
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="gs-url">Sheet link</label>
                  <input id="gs-url" className="input" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" disabled={!sheetsConfigured} />
                </div>
                <div className="field">
                  <label htmlFor="gs-tab">Tab name</label>
                  <input id="gs-tab" className="input" value={tab} onChange={(e) => setTab(e.target.value)} placeholder="Orders" disabled={!sheetsConfigured} />
                </div>
              </div>
              <div className="row">
                <button className="btn" disabled={!sheetsConfigured || !sheetUrl.trim() || !tab.trim() || busy} onClick={readSheet}><Sheet size={17} aria-hidden="true" /> {busy ? "Reading…" : "Read the sheet"}</button>
              </div>
              {sources.length > 0 && (
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Connected sheets</div>
                  <ul className="feed" style={{ border: "2px solid var(--rule)" }}>
                    {sources.map((s) => (
                      <li key={s.id} className="row" style={{ justifyContent: "space-between" }}>
                        <span><b>{s.name}</b><span className="muted"> · last read {s.last_synced_at ? dateLabel(s.last_synced_at) : "never"}{s.last_result ? `, ${s.last_result.added} added` : ""}</span></span>
                        <button className="btn sm" disabled={!sheetsConfigured || busy} onClick={() => syncFeed(s.id)}><RefreshCw size={15} aria-hidden="true" /> Read again</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>}
        </>
      )}

      {step === 2 && file && (
        <>
          <section className="panel" aria-labelledby="map-h">
            <div className="panel-head">
              <div>
                <h2 id="map-h">{file.name}</h2>
                <span className="sub">{file.sheet ? file.sheet.total : file.rows.length} rows · {file.headers.length} columns. {savedMapping ? "Filled in from the mapping you saved for this layout." : "Guesses are filled in; change any that are wrong."}</span>
              </div>
              <button className="btn sm" onClick={() => setStep(1)}>Choose another source</button>
            </div>
            <div className="map-row head"><span>Column</span><span>First values</span><span>Becomes</span><span>Check</span></div>
            {file.headers.map((h) => {
              const t = mapping[h];
              return (
                <div className="map-row" key={h}>
                  <span className="col">{h}</span>
                  <span className="samples">{file.rows.slice(0, 3).map((r) => r[h]).filter(Boolean).join("  ·  ") || "empty"}</span>
                  <select className="select" aria-label={`What “${h}” becomes`} value={t} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                    {["Client", "Purchase", ""].map((g) => (
                      <optgroup key={g || "other"} label={g || "Other"}>
                        {TARGETS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <span>{t === "ignore" ? <span className="chip plain">Skipped</span> : <span className="chip active">Kept</span>}</span>
                </div>
              );
            })}
          </section>

          <section className="panel">
            <div className="panel-body stack">
              {mapped.includes("sale.date") && (
                <div className="field" style={{ maxWidth: 360 }}>
                  <label htmlFor="df">Dates like 04/05/2026 mean</label>
                  <select id="df" className="select" value={dayFirst} onChange={(e) => setDayFirst(e.target.value)}>
                    <option value="day">4 May 2026 (day first)</option>
                    <option value="month">5 April 2026 (month first)</option>
                  </select>
                </div>
              )}
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember this mapping for files with the same columns
              </label>
              {!hasKey && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>No column identifies the client. Map a client code, email, phone or name.</div></div>}
              {!hasSale && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>No column holds an amount, product or quantity, so these rows would not count as purchases.</div></div>}
            </div>
            <div className="sticky-actions">
              <button className="btn quiet" onClick={() => setStep(1)}>Back</button>
              <button className="btn primary" disabled={!hasKey || !hasSale || busy} onClick={start}>{file.sheet ? "Save sheet and load orders" : `Import ${file.rows.length} rows`}</button>
            </div>
          </section>
        </>
      )}

      {step === 3 && (
        <>
          {progress && !result && (
            <section className="panel">
              <div className="panel-body stack" role="status">
                <b>Importing {progress.done} of {progress.total} rows…</b>
                <progress value={progress.done} max={progress.total || 1} style={{ width: "100%", height: 18 }} />
              </div>
            </section>
          )}
          {result && (
            <>
              <div className="result-grid" role="status">
                <div><b>{result.rows}</b><span>rows read</span></div>
                <div><b>{result.added}</b><span>matched and saved</span></div>
                <div><b>{result.unmatched}</b><span>buyers not found</span></div>
                <div><b>{result.duplicates}</b><span>already in the record</span></div>
                <div><b>{result.skipped}</b><span>skipped</span></div>
              </div>
              {result.unmatched > 0 && (
                <div className="notice info" style={{ marginBottom: 16 }}>
                  <Check size={20} aria-hidden="true" />
                  <div>{result.unmatched} {result.unmatched === 1 ? "row has" : "rows have"} no client yet. <Link href="/unmatched">Review unmatched purchases</Link> to link them or create the clients.</div>
                </div>
              )}
              {result.errors?.length > 0 && (
                <section className="panel">
                  <div className="panel-head"><h2>Rows to fix</h2><span className="sub">Fix these in the file and upload it again; only the fixed rows are added.</span></div>
                  <ul className="feed">{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
                </section>
              )}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" onClick={() => { setFile(null); setResult(null); setStep(1); }}>Load another</button>
                <Link className="btn quiet" href="/imports">See import history</Link>
                <Link className="btn quiet" href="/clients">Back to clients</Link>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
