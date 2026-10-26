"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, ListPlus, Mail, Phone, Receipt, ReceiptText, StickyNote, Trash2 } from "lucide-react";
import { FACT_CATEGORIES } from "@/lib/constants";
import { agoLabel, dateLabel, money } from "@/lib/format";
import { api } from "@/lib/client-api";
import { BerthStrip, StatusChip } from "@/components/Berth";

const SRC = { manual: "Manual", document: "Doc", pattern: "Pattern", ai: "AI", csv: "CSV", sheet: "Sheet" };
const TL_ICON = { note: StickyNote, document: FileText, purchase: ReceiptText };

export default function ClientView({ client, contacts, facts, purchases, timeline }) {
  const router = useRouter();
  const [composer, setComposer] = useState(null); // "note" | "fact" | null
  const [noteText, setNoteText] = useState("");
  const [fact, setFact] = useState({ category: "Commercial", key: "", value: "" });
  const [showAll, setShowAll] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const groups = FACT_CATEGORIES.map((cat) => ({ cat, items: facts.filter((f) => f.category === cat) })).filter((g) => g.items.length);
  const shownPurchases = showAll ? purchases : purchases.slice(0, 10);
  const quiet = client.standing === "Lapsed" || client.standing === "Watch";
  const visibleEntries = showOlder ? timeline : timeline.slice(0, 8);

  async function run(fn) {
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

  const saveNote = (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    run(async () => {
      await api(`/api/clients/${client.id}/notes`, { method: "POST", body: { body: noteText } });
      setNoteText("");
      setComposer(null);
    });
  };
  const saveFact = (e) => {
    e.preventDefault();
    if (!fact.key.trim() || !fact.value.trim()) return;
    run(async () => {
      await api(`/api/clients/${client.id}/facts`, { method: "POST", body: fact });
      setFact({ category: fact.category, key: "", value: "" });
      setComposer(null);
    });
  };
  const removeFact = (f) => {
    if (confirm(`Delete “${f.key}: ${f.value}”?`)) run(() => api(`/api/facts/${f.id}`, { method: "DELETE" }));
  };
  const removeNote = (id) => {
    if (confirm("Delete this note?")) run(() => api(`/api/notes/${id}`, { method: "DELETE" }));
  };

  return (
    <>
      <div className="client-head">
        <div>
          <h1>{client.name}</h1>
          <div className="client-meta">
            {client.code && <span className="code">{client.code}</span>}
            <StatusChip standing={client.standing} />
            {(client.segment || client.city) && <span>{[client.segment, client.city].filter(Boolean).join(" · ")}</span>}
            {client.owner && <span>Owner {client.owner}</span>}
            {client.since && <span>Client since {dateLabel(client.since)}</span>}
          </div>
        </div>
        <div className="quick" role="group" aria-label="Add to this client">
          <button className="btn" aria-expanded={composer === "note"} onClick={() => setComposer(composer === "note" ? null : "note")}><StickyNote size={17} aria-hidden="true" /> Note</button>
          <button className="btn" aria-expanded={composer === "fact"} onClick={() => setComposer(composer === "fact" ? null : "fact")}><ListPlus size={17} aria-hidden="true" /> Fact</button>
          <Link className="btn" href={`/purchases/new?client=${client.id}`}><Receipt size={17} aria-hidden="true" /> Purchase</Link>
          <Link className="btn" href={`/documents/new?client=${client.id}`}><FileText size={17} aria-hidden="true" /> Document</Link>
        </div>
      </div>

      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="panel rhythm" aria-label="Ordering rhythm">
        <div className="panel-head">
          <h2>Ordering, last 12 months</h2>
          <span className="legend">
            <span><i className="f" />Ordered</span><span><i />Skipped</span><span><i className="x" />Lapsed</span>
          </span>
        </div>
        <BerthStrip client={client} labels />
        <div className="rhythm-line">
          <span><b>{money(client.revenue)}</b> in 12 months</span>
          <span><b>{client.orderCount}</b> {client.orderCount === 1 ? "order" : "orders"}</span>
          {client.lastOrder ? <span>Last order <b>{dateLabel(client.lastOrder)}</b>, {agoLabel(client.daysSince)}</span> : <span>No orders yet</span>}
          {client.usualGap ? <span>Usually every <b>{client.usualGap} days</b></span> : null}
          {quiet && client.usualGap ? <span className="late"><b>{Math.max(0, client.daysSince - client.usualGap)} days</b> overdue</span> : null}
        </div>
      </section>

      <div className="cp-grid">
        <div>
          <section className="panel" aria-labelledby="facts-h">
            <div className="panel-head">
              <h2 id="facts-h">Terms and facts</h2>
              <span className="sub">Open a row to see where it came from</span>
            </div>
            {composer === "fact" && (
              <form className="composer" onSubmit={saveFact}>
                <div className="grid-3">
                  <div className="field">
                    <label htmlFor="f-cat">Category</label>
                    <select id="f-cat" className="select" value={fact.category} onChange={(e) => setFact({ ...fact, category: e.target.value })}>
                      {FACT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="f-key">What</label>
                    <input id="f-key" className="input" placeholder="Payment terms" value={fact.key} onChange={(e) => setFact({ ...fact, key: e.target.value })} autoFocus />
                  </div>
                  <div className="field">
                    <label htmlFor="f-val">Value</label>
                    <input id="f-val" className="input" placeholder="Net 30" value={fact.value} onChange={(e) => setFact({ ...fact, value: e.target.value })} />
                  </div>
                </div>
                <div className="row">
                  <button className="btn primary sm" type="submit" disabled={busy}>Save fact</button>
                  <button className="btn quiet sm" type="button" onClick={() => setComposer(null)}>Cancel</button>
                </div>
              </form>
            )}
            {groups.length === 0 && (
              <div className="empty">
                <h3>Nothing recorded about this client yet</h3>
                Add a fact by hand, or <Link href={`/documents/new?client=${client.id}`}>add a document</Link> and approve what it finds.
              </div>
            )}
            {groups.map((g) => (
              <div className="fact-group" key={g.cat}>
                <h3>{g.cat}</h3>
                {g.items.map((f) => (
                  <details className="fact" key={f.id}>
                    <summary>
                      <span className="k">{f.key}</span>
                      <span className="v">{f.value}</span>
                      <span className="src"><span className={`t ${f.source.type}`}>{SRC[f.source.type] ?? f.source.type}</span>{[f.source.label, f.source.date && dateLabel(f.source.date, false)].filter(Boolean).join(", ")}</span>
                    </summary>
                    <div className="quote">
                      {f.snippet ? <>From the text: <q>{f.snippet}</q></> : <>Entered by {f.source.label || "someone"}{f.source.date ? ` on ${dateLabel(f.source.date)}` : ""}.</>}
                      {f.confirmedOn ? <> Last confirmed {dateLabel(f.confirmedOn)}.</> : null}
                      <div style={{ marginTop: 6 }}>
                        <button className="btn quiet sm danger" onClick={() => removeFact(f)} disabled={busy}><Trash2 size={14} aria-hidden="true" /> Delete fact</button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ))}
          </section>

          <section className="panel" aria-labelledby="people-h">
            <div className="panel-head"><h2 id="people-h">People</h2></div>
            {contacts.length === 0 ? (
              <div className="empty">No contacts recorded.</div>
            ) : (
              <ul className="people">
                {contacts.map((p) => (
                  <li key={p.id}>
                    <div><b>{p.name || "Unnamed"}</b><div className="role">{p.role}</div></div>
                    <div className="reach">
                      {p.phone && <div><a href={`tel:${p.phone.replace(/\s/g, "")}`}><Phone size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {p.phone}</a></div>}
                      {p.email && <div><a href={`mailto:${p.email}`}><Mail size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {p.email}</a></div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel" aria-labelledby="tl-h">
          <div className="panel-head"><h2 id="tl-h">Timeline</h2><span className="sub">Latest first · {timeline.length} entries</span></div>
          {composer === "note" && (
            <form className="composer" onSubmit={saveNote}>
              <div className="field">
                <label htmlFor="n-text">Note</label>
                <textarea id="n-text" className="textarea" placeholder="What was said or agreed?" value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
              </div>
              <div className="row">
                <button className="btn primary sm" type="submit" disabled={busy}>Save note</button>
                <button className="btn quiet sm" type="button" onClick={() => setComposer(null)}>Cancel</button>
              </div>
            </form>
          )}
          {timeline.length === 0 && <div className="empty">Notes, documents and orders will appear here.</div>}
          <ol className="timeline">
            {visibleEntries.map((t, i) => {
              const Icon = TL_ICON[t.kind];
              return (
                <li className="tl" key={`${t.kind}-${t.id ?? i}-${t.date}`}>
                  <span className={`mk ${t.kind}`}><Icon size={16} aria-hidden="true" /></span>
                  <div>
                    <div className="head">
                      <span>{t.kind === "note" ? `Note · ${t.title}` : t.kind === "purchase" ? `Order ${t.title} · ${money(t.amount)}` : t.title}</span>
                      <span className="when">{dateLabel(t.date, false)}</span>
                    </div>
                    <div className={`body ${t.kind}`}>{t.body}</div>
                    {t.kind === "note" && <button className="btn quiet sm danger" style={{ marginTop: 4, padding: 0, height: "auto" }} onClick={() => removeNote(t.id)} disabled={busy}>Delete note</button>}
                  </div>
                </li>
              );
            })}
          </ol>
          {timeline.length > 8 && (
            <div className="panel-body" style={{ borderTop: "2px solid var(--rule)" }}>
              <button className="btn sm" onClick={() => setShowOlder(!showOlder)}>{showOlder ? "Show latest 8" : `Show ${timeline.length - 8} older entries`}</button>
            </div>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="pur-h" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2 id="pur-h">Purchases</h2>
          <Link className="btn sm" href={`/purchases/new?client=${client.id}`}><Receipt size={15} aria-hidden="true" /> Add purchase</Link>
        </div>
        {purchases.length === 0 ? (
          <div className="empty"><h3>No purchases yet</h3>Add one by hand, or upload a sales CSV and this client will be matched by code, email or phone.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Date</th><th>Order</th><th>Product</th><th className="num">Qty</th><th className="num col-hide">Rate</th><th className="num">Amount</th><th className="col-hide">Source</th></tr>
                </thead>
                <tbody>
                  {shownPurchases.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{p.order_date ? dateLabel(p.order_date, false) : "—"}</td>
                      <td>{p.order_ref}</td>
                      <td>{p.product}</td>
                      <td className="num">{p.quantity}</td>
                      <td className="num col-hide">{p.rate !== null ? money(p.rate) : ""}</td>
                      <td className="num">{money(p.amount)}</td>
                      <td className="col-hide"><span className="chip plain">{p.source === "manual" ? "Manual" : p.source === "sheet" ? "Sheet" : "CSV"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {purchases.length > 10 && (
              <div className="panel-body" style={{ borderTop: "2px solid var(--rule)" }}>
                <button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show latest 10" : `Show all ${purchases.length} lines`}</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
