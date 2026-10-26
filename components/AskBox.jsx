"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Search, StickyNote } from "lucide-react";
import { api } from "@/lib/client-api";

const EXAMPLES = [
  "Top 10 clients this year",
  "Who has gone quiet?",
  "Revenue this month",
  "Revenue by month",
  "Revenue by channel last month",
  "New clients in September",
  "Leads",
  "Not ordered in 60 days",
];

export default function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);
  const [saved, setSaved] = useState("");

  async function ask(text) {
    const question = (text ?? q).trim();
    if (!question) return;
    setQ(question);
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const r = await api("/api/ask", { method: "POST", body: { q: question } });
      setRes(r);
      setPick(r.note?.candidates?.[0]?.id ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const client = res.note.candidates.find((c) => c.id === pick);
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/notes`, { method: "POST", body: { body: res.note.text } });
      setSaved(client.name);
      setRes(null);
      setQ("");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="ask-h">
      <div className="panel-head">
        <h2 id="ask-h">Ask</h2>
        <span className="sub">Questions about clients, orders and leads. To add a note, start with “note for”.</span>
      </div>
      <form className="panel-body stack" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. top clients last month, Greenleaf payment terms, note for Greenleaf: wants samples" aria-label="Ask a question" maxLength={300} />
          <button className="btn primary" type="submit" disabled={busy || !q.trim()}><Search size={17} aria-hidden="true" /> Ask</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="btn sm" onClick={() => ask(x)} disabled={busy}>{x}</button>
          ))}
        </div>
      </form>

      {error && <div className="panel-body"><div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div></div>}
      {saved && <div className="panel-body"><div className="notice good" role="status"><CheckCircle2 size={20} aria-hidden="true" /><div>Note saved to {saved}.</div></div></div>}

      {res && (
        <div aria-live="polite" style={{ borderTop: "2px solid var(--rule)" }}>
          <div className="panel-body">
            <h3 style={{ marginBottom: 4 }}>{res.href ? <Link href={res.href}>{res.title} <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /></Link> : res.title}</h3>
            {res.summary && <p>{res.summary}</p>}
          </div>

          {res.note && (
            <div className="panel-body stack" style={{ paddingTop: 0 }}>
              <div className="notice info">
                <StickyNote size={20} aria-hidden="true" />
                <div style={{ whiteSpace: "pre-wrap" }}>{res.note.text}</div>
              </div>
              {res.note.candidates.length > 1 && (
                <div className="field" style={{ maxWidth: 420 }}>
                  <label htmlFor="note-client">Client</label>
                  <select id="note-client" className="select" value={pick ?? ""} onChange={(e) => setPick(Number(e.target.value))}>
                    {res.note.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>)}
                  </select>
                </div>
              )}
              <div className="row">
                <button className="btn primary" onClick={saveNote} disabled={busy || !pick}>Save note</button>
                <button className="btn quiet" onClick={() => setRes(null)}>Cancel</button>
              </div>
            </div>
          )}

          {res.columns && res.rows?.length > 0 && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>{res.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((cell, j) => (
                        <td key={j}>{j === 0 && r.href ? <Link className="name" href={r.href}>{cell}</Link> : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
