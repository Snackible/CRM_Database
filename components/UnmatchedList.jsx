"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, UserPlus } from "lucide-react";
import { dateLabel, money } from "@/lib/format";
import { api } from "@/lib/client-api";
import ClientPicker from "@/components/ClientPicker";

export default function UnmatchedList({ groups }) {
  const router = useRouter();
  const [picked, setPicked] = useState({});
  const [done, setDone] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link(g, client) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/unmatched", { method: "POST", body: { key: g.key, clientId: client.id } });
      setDone([{ label: g.label, rows: r.linked, client }, ...done]);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Unmatched purchases</h1>
          <p>These rows came in from a CSV or sheet but no client has that code, email, phone or name. Linking one buyer links all its rows, and later files with the same buyer will match on their own.</p>
        </div>
      </div>

      {error && <div className="notice" role="alert" style={{ marginBottom: 12 }}><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}
      {done.map((d, i) => (
        <div className="notice good" role="status" key={i} style={{ marginBottom: 10 }}>
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>{d.rows} {d.rows === 1 ? "row" : "rows"} from <b>{d.label}</b> linked to <Link href={`/clients/${d.client.id}`}>{d.client.name}</Link>.</div>
        </div>
      ))}

      <section className="panel" aria-label="Unmatched buyers">
        {groups.length === 0 && (
          <div className="empty"><h3>Everything is matched</h3>New CSV or sheet rows that match no client will wait here.</div>
        )}
        {groups.map((g) => {
          const id = g.identity;
          const chosen = picked[g.key] ?? null;
          const qs = new URLSearchParams({ ...(id.name && { name: id.name }), ...(id.email && { email: id.email }), ...(id.phone && { phone: id.phone }), linkKey: g.key }).toString();
          return (
            <div className="unmatched-item" key={g.key}>
              <div>
                <h3>{g.label}</h3>
                <div className="muted">
                  {[id.phone, id.email].filter(Boolean).join(" · ")}{id.phone || id.email ? " · " : ""}{g.rowCount} {g.rowCount === 1 ? "row" : "rows"}, {money(g.total)} · from {g.file}
                </div>
                <div className="mini-rows">
                  {g.rows.map((r, i) => (
                    <div key={i}><span>{r.date ? dateLabel(r.date, false) : "no date"} · {r.product || "item"}{r.qty ? ` × ${r.qty}` : ""}</span><span>{money(r.amount)}</span></div>
                  ))}
                  {g.rowCount > g.rows.length && <div><span>and {g.rowCount - g.rows.length} more</span></div>}
                </div>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                {g.suggestion && !chosen && (
                  <div className="notice info">
                    <Link2 size={18} aria-hidden="true" />
                    <div>
                      Looks like <b>{g.suggestion.name}</b> (spelling differs).
                      <div style={{ marginTop: 8 }}><button className="btn sm primary" disabled={busy} onClick={() => link(g, g.suggestion)}>Link to {g.suggestion.name}</button></div>
                    </div>
                  </div>
                )}
                <ClientPicker id={`pick-${g.key}`} label="Link to a different client" value={chosen} onChange={(c) => setPicked({ ...picked, [g.key]: c })} />
                {chosen && <button className="btn primary sm" disabled={busy} onClick={() => link(g, chosen)}><Link2 size={15} aria-hidden="true" /> Link {g.rowCount} {g.rowCount === 1 ? "row" : "rows"}</button>}
                <Link className="btn sm" href={`/clients/new?${qs}`}><UserPlus size={15} aria-hidden="true" /> Create client from this buyer</Link>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
