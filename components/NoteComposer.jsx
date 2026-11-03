"use client";

import { useState } from "react";
import { suggestFacts } from "@/lib/patterns";
import { api } from "@/lib/client-api";

/**
 * Write a note; on save it is broken into suggested facts (terms, follow-ups, contacts, amounts...), which are
 * kept alongside it straight away, each sourced back to this note — no separate review step.
 */
export default function NoteComposer({ clientId, onSaved, onCancel, autoFocus = true, idPrefix = "n" }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    if (!clientId || !body.trim()) return;
    const facts = suggestFacts(body).filter((s) => s.key.trim() && s.value.trim());
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/clients/${clientId}/notes`, { method: "POST", body: { body, facts: facts.map(({ category, key, value, snippet }) => ({ category, key, value, snippet })) } });
      setBody("");
      onSaved?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
