"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { FACT_CATEGORIES } from "@/lib/constants";
import { suggestFacts } from "@/lib/patterns";
import { api } from "@/lib/client-api";
import ClientPicker from "@/components/ClientPicker";

const SAMPLE = `Hi Aditi,

Thanks for the call. Confirming what we agreed for Skyline Airport Kiosks: payment terms Net 30 on every invoice, MOQ 72 packs per SKU, and please deliver every Tuesday before 10 am to the airside gate. Our GSTIN is 27AAJCS8841P1Z1. Accounts can be reached at accounts@skylinekiosks.example or 98200 17760.

We would like a 6% trade margin on the Roasted Makhana range, and we are keen on the No Palm Oil products.

Regards,
Farhan Shaikh`;

function Highlighted({ text, items }) {
  const spans = items.filter((s) => s.state !== "rejected").sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start < at) return;
    out.push(text.slice(at, s.start));
    out.push(<mark key={i} title={`${s.key}`}>{text.slice(s.start, s.end)}</mark>);
    at = s.end;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}

export default function InfoForm({ initialClient = null }) {
  const [client, setClient] = useState(initialClient);
  const [mode, setMode] = useState("document");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState(null);
  const [note, setNote] = useState("");
  const [fact, setFact] = useState({ category: "Commercial", key: "", value: "", confirmedOn: "" });
  const [saved, setSaved] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  async function onFile(f) {
    if (!f) return;
    if (/\.(pdf|docx?)$/i.test(f.name)) {
      setNotice(`${f.name}: reading PDF and Word files in the browser is not built yet. Paste the text for now.`);
      return;
    }
    setNotice("");
    setTitle(f.name);
    setText(await f.text());
  }
  const setItem = (i, patch) => setItems(items.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const approved = items ? items.filter((s) => s.state === "approved") : [];

  async function save(fn, message) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setSaved(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="form">
        <div className="notice good" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <b>{saved}</b> saved to {client?.name}.
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => { setSaved(""); setItems(null); setText(""); setNote(""); setTitle(""); setFact({ ...fact, key: "", value: "" }); }}>Add more</button>
              <Link className="btn sm" href={`/clients/${client.id}`}>Open {client?.name}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Add information</h1>
          <p>Anything you know about a client that does not belong in a purchase: a call note, one agreed term, or a whole document.</p>
        </div>
      </div>
      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}

      <section className="panel">
        <div className="panel-body stack">
          <div style={{ maxWidth: 460 }}><ClientPicker value={client} onChange={(c) => { setClient(c); setItems(null); }} /></div>
          <div className="seg" role="group" aria-label="Kind of information" style={{ alignSelf: "flex-start" }}>
            {[["document", "Document or pasted text"], ["note", "Note"], ["fact", "Fact"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      {mode === "note" && (
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); if (client && note.trim()) save(() => api(`/api/clients/${client.id}/notes`, { method: "POST", body: { body: note } }), "Note"); }}>
          <div className="panel-body">
            <div className="field"><label htmlFor="i-note">Note</label><textarea id="i-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was said or agreed?" /></div>
          </div>
          <div className="sticky-actions"><button className="btn primary" type="submit" disabled={!client || !note.trim() || busy}>Save note</button></div>
        </form>
      )}

      {mode === "fact" && (
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); if (client && fact.key && fact.value) save(() => api(`/api/clients/${client.id}/facts`, { method: "POST", body: fact }), `${fact.key}: ${fact.value}`); }}>
          <div className="panel-body">
            <div className="grid-3">
              <div className="field"><label htmlFor="i-cat">Category</label><select id="i-cat" className="select" value={fact.category} onChange={(e) => setFact({ ...fact, category: e.target.value })}>{FACT_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="field"><label htmlFor="i-key">What</label><input id="i-key" className="input" value={fact.key} onChange={(e) => setFact({ ...fact, key: e.target.value })} placeholder="Payment terms" /></div>
              <div className="field"><label htmlFor="i-val">Value</label><input id="i-val" className="input" value={fact.value} onChange={(e) => setFact({ ...fact, value: e.target.value })} placeholder="Net 30" /></div>
            </div>
            <div className="field" style={{ maxWidth: 260 }}><label htmlFor="i-conf">Last confirmed</label><input id="i-conf" className="input" type="date" value={fact.confirmedOn} onChange={(e) => setFact({ ...fact, confirmedOn: e.target.value })} /><span className="hint">Optional. Terms change; this shows how fresh the fact is.</span></div>
          </div>
          <div className="sticky-actions"><button className="btn primary" type="submit" disabled={!client || !fact.key || !fact.value || busy}>Save fact</button></div>
        </form>
      )}

      {mode === "document" && !items && (
        <section className="panel">
          <div className="panel-head"><h2>Text to read</h2><span className="sub">The file itself is never kept. Only the text and the facts you approve are.</span></div>
          <div className="panel-body stack">
            <div className="field"><label htmlFor="d-title">Title</label><input id="d-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Supply MoU, Re: Diwali stock, call on 12 Oct" /></div>
            <div className="field"><label htmlFor="d-text">Paste text</label><textarea id="d-text" className="textarea" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email, a WhatsApp chat export, or the text of a contract." /></div>
            <div className="row">
              <input ref={fileInput} type="file" hidden accept=".txt,.md,.eml,.pdf,.doc,.docx,text/plain" onChange={(e) => onFile(e.target.files[0])} />
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}><Upload size={17} aria-hidden="true" /> Upload a text file</button>
              <button type="button" className="btn quiet" onClick={() => { setText(SAMPLE); setTitle("Re: first order terms"); }}><FileText size={17} aria-hidden="true" /> Try a sample email</button>
            </div>
            {notice && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{notice}</div></div>}
          </div>
          <div className="sticky-actions"><button className="btn primary" disabled={!client || text.trim().length < 20} onClick={() => setItems(suggestFacts(text))}>Find facts</button></div>
        </section>
      )}

      {mode === "document" && items && (
        <>
          <div className="notice info" style={{ marginBottom: 16 }}>
            <FileText size={20} aria-hidden="true" />
            <div><b>{items.length} suggestions</b> found in “{title || "pasted text"}”. Nothing is saved until you approve it. Each one shows the sentence it came from.</div>
          </div>
          <div className="review">
            <section className="panel" aria-labelledby="txt-h">
              <div className="panel-head"><h2 id="txt-h">Text</h2><span className="sub">Highlights are the suggestions</span></div>
              <div className="doc-text"><Highlighted text={text} items={items} /></div>
            </section>
            <section className="panel" aria-labelledby="sug-h">
              <div className="panel-head"><h2 id="sug-h">Suggested facts</h2><span className="sub">{approved.length} approved</span></div>
              {items.length === 0 && <div className="empty"><h3>No patterns found</h3>Save the text anyway, or add a fact by hand.</div>}
              {items.map((s, i) => (
                <div className={`sugg${s.state === "rejected" ? " rejected" : ""}`} key={i}>
                  <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8 }}>
                    <select className="select" aria-label="Category" value={s.category} onChange={(e) => setItem(i, { category: e.target.value })}>{FACT_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
                    <input className="input" aria-label="What" value={s.key} onChange={(e) => setItem(i, { key: e.target.value })} />
                    <input className="input" aria-label="Value" value={s.value} onChange={(e) => setItem(i, { value: e.target.value })} />
                  </div>
                  <div className="quote">“{s.snippet}”</div>
                  <div className="btns">
                    <button className={`btn sm${s.state === "approved" ? " primary" : ""}`} aria-pressed={s.state === "approved"} onClick={() => setItem(i, { state: s.state === "approved" ? "pending" : "approved" })}><Check size={15} aria-hidden="true" /> {s.state === "approved" ? "Approved" : "Approve"}</button>
                    <button className="btn sm quiet danger" aria-pressed={s.state === "rejected"} onClick={() => setItem(i, { state: s.state === "rejected" ? "pending" : "rejected" })}><X size={15} aria-hidden="true" /> {s.state === "rejected" ? "Rejected" : "Reject"}</button>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <div className="sticky-actions" style={{ marginTop: 16 }}>
            <span className="muted" style={{ marginRight: "auto" }}>The text is kept so it can be searched. The original file is not.</span>
            <button className="btn quiet" onClick={() => setItems(null)}>Back</button>
            <button
              className="btn primary"
              disabled={!client || busy}
              onClick={() =>
                save(
                  () => api("/api/documents", { method: "POST", body: { clientId: client.id, title: title || "Pasted text", text, facts: approved.map(({ category, key, value, snippet }) => ({ category, key, value, snippet })) } }),
                  `${approved.length} ${approved.length === 1 ? "fact" : "facts"} and the text of “${title || "pasted text"}”`,
                )
              }
            >
              Save {approved.length} approved
            </button>
          </div>
        </>
      )}
    </>
  );
}
