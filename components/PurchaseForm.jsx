"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { CHANNELS } from "@/lib/constants";
import { money } from "@/lib/format";
import { api } from "@/lib/client-api";
import ClientPicker from "@/components/ClientPicker";

const blank = (date, channel = "Direct") => ({ date, product: "", quantity: "", rate: "", ref: "", channel });

export default function PurchaseForm({ initialClient = null, products = [], today }) {
  const [client, setClient] = useState(initialClient);
  const [lines, setLines] = useState([blank(today)]);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const update = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = client && lines.every((l) => Number(l.quantity) > 0 && l.rate !== "" && l.date);

  function pickProduct(i, name) {
    const known = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    update(i, { product: name, ...(known && lines[i].rate === "" ? { rate: String(known.rate) } : {}) });
  }

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/purchases", { method: "POST", body: { clientId: client.id, lines } });
      setSaved(r);
    } catch (err) {
      setError(err.message);
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
            <b>{saved.added} {saved.added === 1 ? "line" : "lines"}, {money(saved.total)} saved for {client.name}.</b>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => { setSaved(null); setLines([blank(lines[0].date, lines[0].channel)]); }}>Add another order</button>
              <Link className="btn sm" href={`/clients/${client.id}`}>Open {client.name}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1>Add purchase</h1>
          <p>One order, entered by hand. For many orders at once, <Link href="/purchases/import">upload a CSV or connect a sheet</Link>.</p>
        </div>
      </div>
      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}

      <section className="panel">
        <div className="panel-body">
          <div style={{ maxWidth: 460 }}><ClientPicker value={client} onChange={setClient} /></div>
        </div>
      </section>

      <section className="panel" aria-labelledby="lines-h">
        <div className="panel-head"><h2 id="lines-h">Order lines</h2></div>
        <div className="panel-body table-wrap">
          <datalist id="products">{products.map((p) => <option key={p.name} value={p.name} />)}</datalist>
          <table className="lines">
            <thead>
              <tr><th>Date</th><th>Product</th><th>Quantity</th><th>Rate</th><th>Order no.</th><th>Channel</th><th><span className="sr-only">Remove</span></th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><input className="input" type="date" aria-label={`Date, line ${i + 1}`} value={l.date} onChange={(e) => update(i, { date: e.target.value })} /></td>
                  <td className="wide"><input className="input" list="products" aria-label={`Product, line ${i + 1}`} placeholder="Product" value={l.product} onChange={(e) => pickProduct(i, e.target.value)} /></td>
                  <td><input className="input" inputMode="numeric" aria-label={`Quantity, line ${i + 1}`} placeholder="120" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} /></td>
                  <td><input className="input" inputMode="decimal" aria-label={`Rate, line ${i + 1}`} placeholder="18" value={l.rate} onChange={(e) => update(i, { rate: e.target.value })} /></td>
                  <td><input className="input" aria-label={`Order number, line ${i + 1}`} placeholder="INV-2041" value={l.ref} onChange={(e) => update(i, { ref: e.target.value })} /></td>
                  <td>
                    <select className="select" aria-label={`Channel, line ${i + 1}`} value={l.channel} onChange={(e) => update(i, { channel: e.target.value })}>
                      {CHANNELS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><button type="button" className="icon-btn" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={18} aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" onClick={() => setLines([...lines, blank(lines[lines.length - 1].date, lines[lines.length - 1].channel)])}><Plus size={15} aria-hidden="true" /> Add another line</button>
            <span className="muted" style={{ marginLeft: 10 }}>Keeps the date of the line above.</span>
          </div>
        </div>
        <div className="total"><span>Total</span><b>{money(total)}</b></div>
      </section>

      <div className="sticky-actions">
        <Link className="btn quiet" href={client ? `/clients/${client.id}` : "/clients"}>Cancel</Link>
        <button className="btn primary" type="submit" disabled={!valid || busy}>{busy ? "Saving…" : "Save purchase"}</button>
      </div>
    </form>
  );
}
