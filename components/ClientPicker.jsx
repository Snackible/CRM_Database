"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/client-api";

// Type to find a client; pick one. Always offers to create a new client instead.
// `value` is the chosen client object ({ id, name, code, city }) or null.
export default function ClientPicker({ id = "client", value, onChange, label = "Client" }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const { clients } = await api(`/api/clients?lookup=${encodeURIComponent(text.trim())}`);
        if (live) setMatches(clients);
      } catch {
        if (live) setMatches([]);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, open]);

  if (value) {
    return (
      <div className="field">
        <span className="label">{label}</span>
        <div className="row" style={{ minHeight: 40 }}>
          <b>{value.name}</b>
          <span className="muted">{[value.code, value.city].filter(Boolean).join(" · ")}</span>
          <button type="button" className="btn quiet sm" onClick={() => { onChange(null); setText(""); }}><X size={15} aria-hidden="true" /> Change</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field combo">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        placeholder="Type a name, code or city"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
      />
      {open && (
        <div className="results" id={`${id}-list`} role="listbox">
          {matches.map((c) => (
            <a key={c.id} href="#" role="option" onClick={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}>
              <div className="t">{c.name}</div>
              <div className="d">{[c.code, c.segment, c.city].filter(Boolean).join(" · ")}</div>
            </a>
          ))}
          {matches.length === 0 && text.trim() && <div className="none">No client called “{text}”.</div>}
          <Link href={`/clients/new${text.trim() ? `?name=${encodeURIComponent(text.trim())}` : ""}`}>
            <div className="t"><Plus size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Create a new client{text.trim() ? ` “${text.trim()}”` : ""}</div>
          </Link>
        </div>
      )}
    </div>
  );
}
