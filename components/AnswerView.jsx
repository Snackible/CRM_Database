"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, StickyNote } from "lucide-react";

function Table({ columns, rows }) {
  if (!columns || !rows?.length) return null;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.cells.map((cell, j) => (
                <td key={j}>{j === 0 && r.href ? <Link className="name" href={r.href}>{cell}</Link> : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One answer from /api/ask: title, summary, tables, and a note draft that needs the person's Save. */
export default function AnswerView({ res, onSaveNote, onCancelNote, busy = false, compact = false }) {
  const [pick, setPick] = useState(res.note?.candidates?.[0]?.id ?? null);
  return (
    <div className={compact ? "answer compact" : "answer"}>
      <div className="answer-head">
        <h3>{res.href ? <Link href={res.href}>{res.title} <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /></Link> : res.title}</h3>
        {res.summary && <p>{res.summary}</p>}
        {res.via === "ai" && <p className="answer-via">Understood with the AI helper. The figures come straight from your data.</p>}
      </div>

      {res.note && (
        <div className="stack answer-note">
          <div className="notice info">
            <StickyNote size={20} aria-hidden="true" />
            <div style={{ whiteSpace: "pre-wrap" }}>{res.note.text}</div>
          </div>
          {res.note.candidates.length > 1 && (
            <div className="field">
              <label htmlFor="note-client">Client</label>
              <select id="note-client" className="select" value={pick ?? ""} onChange={(e) => setPick(Number(e.target.value))}>
                {res.note.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>)}
              </select>
            </div>
          )}
          <div className="row">
            <button className="btn primary sm" onClick={() => onSaveNote(res.note.candidates.find((c) => c.id === pick), res.note.text)} disabled={busy || !pick}>Save note</button>
            <button className="btn quiet sm" onClick={onCancelNote}>Cancel</button>
          </div>
        </div>
      )}

      <Table columns={res.columns} rows={res.rows} />
      {res.blocks?.map((b, i) => (
        <div className="answer-block" key={i}>
          <div className="answer-block-title">{b.title}</div>
          <Table columns={b.columns} rows={b.rows} />
        </div>
      ))}
    </div>
  );
}
