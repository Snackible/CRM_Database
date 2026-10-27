"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { api } from "@/lib/client-api";
import AnswerView from "@/components/AnswerView";

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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(client, body) {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/notes`, { method: "POST", body: { body } });
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
            <AnswerView res={res} busy={busy} onSaveNote={saveNote} onCancelNote={() => setRes(null)} />
          </div>
        </div>
      )}
    </section>
  );
}
