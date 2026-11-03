"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { dateLabel, money } from "@/lib/format";
import { api } from "@/lib/client-api";

export default function ImportsView({ imports, sample, hidden = [], isAdmin }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const undo = (i) => confirm(`Remove the ${i.added + i.unmatched} purchase rows that “${i.filename}” added?`) && act(() => api(`/api/imports/${i.id}`, { method: "DELETE" }));
  const removeSample = () => confirm(`Delete the ${sample} sample clients and everything attached to them?`) && act(() => api("/api/sample", { method: "DELETE" }));
  const unhide = (c) => act(() => api(`/api/clients/${c.id}`, { method: "PATCH", body: { hidden: false } }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Imports &amp; backup</h1>
          <p>Every CSV and sheet that has been loaded, with what it did. Undo removes the purchases it added.</p>
        </div>
      </div>
      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}

      <section className="panel" aria-labelledby="imp-h">
        <div className="panel-head"><h2 id="imp-h">Import history</h2></div>
        {imports.length === 0 ? (
          <div className="empty"><h3>Nothing imported yet</h3>Purchase files and sheet reads will be listed here.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Source</th><th>Loaded</th><th className="num">Rows</th><th className="num">Saved</th><th className="num col-hide">Duplicates</th><th className="num col-hide">Unmatched</th><th className="num col-hide">Skipped</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.filename}</b></td>
                    <td className="nowrap">{dateLabel(i.date, false)}{i.created_by ? ` · ${i.created_by}` : ""}</td>
                    <td className="num">{i.total_rows}</td>
                    <td className="num">{i.added}</td>
                    <td className="num col-hide">{i.duplicates}</td>
                    <td className="num col-hide">{i.unmatched}</td>
                    <td className="num col-hide">{i.skipped}</td>
                    <td><span className={`chip ${i.status === "done" ? "active" : "plain"}`}>{i.status === "done" ? "Done" : i.status === "undone" ? "Undone" : i.status === "failed" ? "Failed" : "Running"}</span></td>
                    <td className="num">{isAdmin && i.status === "done" && i.created_by !== "sample" ? <button className="btn sm danger" disabled={busy} onClick={() => undo(i)}>Undo</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && <section className="panel" aria-labelledby="bak-h">
        <div className="panel-head"><h2 id="bak-h">Backup</h2></div>
        <div className="panel-body stack">
          <p>Free database plans keep little or no backup history. Download everything now and then: clients, contacts, facts, notes, purchases and document text, as one JSON file.</p>
          <div className="row">
            <a className="btn primary" href="/api/export" download><Download size={17} aria-hidden="true" /> Download everything</a>
          </div>
        </div>
      </section>}

      {isAdmin && hidden.length > 0 && (
        <section className="panel" aria-labelledby="hid-h">
          <div className="panel-head"><h2 id="hid-h">Hidden clients</h2><span className="sub">Left out of the Overview, Clients, search and every total; order history untouched</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Client</th><th className="num">Orders</th><th className="num">Revenue</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {hidden.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num"><button className="btn sm" disabled={busy} onClick={() => unhide(c)}>Unhide</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAdmin && sample > 0 && (
        <section className="panel" aria-labelledby="smp-h">
          <div className="panel-head"><h2 id="smp-h">Sample data</h2></div>
          <div className="panel-body stack">
            <p>{sample} invented sample clients are loaded so you can try things out. Remove them before real use.</p>
            <div className="row"><button className="btn danger" disabled={busy} onClick={removeSample}>Remove sample data</button></div>
          </div>
        </section>
      )}
    </>
  );
}
