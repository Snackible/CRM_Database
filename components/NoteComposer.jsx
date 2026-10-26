"use client";

import { useState } from "react";
import { FACT_CATEGORIES } from "@/lib/constants";
import { suggestFacts } from "@/lib/patterns";
import { api } from "@/lib/client-api";

/**
 * Write a note; on save it is broken into suggested facts (terms, follow-ups, contacts, amounts...).
 * The writer ticks which to keep and can edit them, then the note and the kept facts save together.
 * With nothing found, the note saves straight away.
 */
export default function NoteComposer({ clientId, onSaved, onCancel, autoFocus = true, idPrefix = "n" }) {
  const [body, setBody] = useState("");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setItem = (i, patch) => setItems(items.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const kept = items ? items.filter((s) => s.keep) : [];

  async function send(facts) {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/clients/${clientId}/notes`, { method: "POST", body: { body, facts: facts.map(({ category, key, value, snippet }) => ({ category, key, value, snippet })) } });
      setBody("");
      setItems(null);
      onSaved?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    if (!clientId || !body.trim()) return;
    const found = suggestFacts(body).map((s) => ({ ...s, keep: true }));
    if (!found.length) send([]);
    else setItems(found);
  }

  if (items) {
    return (
      <div className="composer">
        <p><b>This note mentions {items.length} {items.length === 1 ? "thing" : "things"} worth keeping as facts.</b> Untick any that are wrong, or fix the wording. The note is saved either way.</p>
        {items.map((s, i) => (
          <div className={`sugg${s.keep ? "" : " rejected"}`} key={i}>
            <div className="note-fact">
              <input type="checkbox" checked={s.keep} onChange={(e) => setItem(i, { keep: e.target.checked })} aria-label={`Keep ${s.key}: ${s.value}`} />
              <select className="select" aria-label="Category" value={s.category} onChange={(e) => setItem(i, { category: e.target.value })}>{FACT_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
              <input className="input" aria-label="What" value={s.key} onChange={(e) => setItem(i, { key: e.target.value })} />
              <input className="input" aria-label="Value" value={s.value} onChange={(e) => setItem(i, { value: e.target.value })} />
            </div>
            <div className="quote">“{s.snippet}”</div>
          </div>
        ))}
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="row">
          <button className="btn primary sm" type="button" disabled={busy} onClick={() => send(kept.filter((s) => s.key.trim() && s.value.trim()))}>
            Save note and {kept.length} {kept.length === 1 ? "fact" : "facts"}
          </button>
          <button className="btn sm" type="button" disabled={busy} onClick={() => send([])}>Save note only</button>
          <button className="btn quiet sm" type="button" disabled={busy} onClick={() => setItems(null)}>Back to the note</button>
        </div>
      </div>
    );
  }

  return (
    <form className="composer" onSubmit={save}>
      <div className="field">
        <label htmlFor={`${idPrefix}-text`}>Note</label>
        <textarea id={`${idPrefix}-text`} className="textarea" placeholder="What was said or agreed? Terms, quantities, who you spoke with and the next step are picked out as facts when you save." value={body} onChange={(e) => setBody(e.target.value)} autoFocus={autoFocus} />
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      <div className="row">
        <button className="btn primary sm" type="submit" disabled={busy || !clientId || !body.trim()}>Save note</button>
        {onCancel && <button className="btn quiet sm" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
