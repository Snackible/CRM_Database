"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { agoLabel, money } from "@/lib/format";
import { BerthStrip, StatusChip } from "@/components/Berth";

const SORTS = {
  revenue: (a, b) => b.revenue - a.revenue,
  recent: (a, b) => (a.daysSince ?? 9999) - (b.daysSince ?? 9999),
  quiet: (a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0),
  name: (a, b) => a.name.localeCompare(b.name),
};

export default function ClientList({ clients, owners }) {
  const [text, setText] = useState("");
  const [standing, setStanding] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState("revenue");

  const rows = useMemo(() => {
    const n = text.trim().toLowerCase();
    return clients
      .filter((c) => (!standing || c.standing === standing) && (!owner || c.owner === owner))
      .filter((c) => !n || [c.name, c.code, c.city, c.segment].some((v) => (v || "").toLowerCase().includes(n)))
      .sort(SORTS[sort]);
  }, [clients, text, standing, owner, sort]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>{clients.length} {clients.length === 1 ? "account" : "accounts"}. Each strip shows the last twelve months, one cell per month.</p>
        </div>
        <Link href="/clients/new" className="btn primary"><Plus size={18} aria-hidden="true" /> New client</Link>
      </div>

      <section className="panel" aria-label="Client list">
        <div className="toolbar">
          <input className="input" type="search" placeholder="Filter by name, code or city" aria-label="Filter clients" value={text} onChange={(e) => setText(e.target.value)} />
          <select className="select" aria-label="Status" value={standing} onChange={(e) => setStanding(e.target.value)}>
            <option value="">Any status</option>
            <option>Active</option><option>Watch</option><option>Lapsed</option><option>Lead</option><option>New</option>
          </select>
          {owners.length > 0 && (
            <select className="select" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Any owner</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="revenue">Biggest first</option>
            <option value="recent">Ordered most recently</option>
            <option value="quiet">Quiet longest</option>
            <option value="name">Name A to Z</option>
          </select>
        </div>

        {clients.length === 0 ? (
          <div className="empty">
            <h3>No clients yet</h3>
            <Link href="/clients/new">Add the first one</Link>, or <Link href="/purchases/import">upload a purchase CSV</Link>.
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <h3>No client matches</h3>
            Clear a filter, or <Link href="/clients/new">add this client</Link>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Last 12 months</th>
                  <th className="col-hide">Last order</th>
                  <th className="num col-hide">Revenue</th>
                  <th className="col-hide">Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="name" href={`/clients/${c.id}`}>{c.name}</Link>
                      <span className="sub">{[c.code, c.segment, c.city].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td><BerthStrip client={c} mini /></td>
                    <td className="col-hide nowrap">{c.lastOrder ? agoLabel(c.daysSince) : "No orders"}</td>
                    <td className="num col-hide">{money(c.revenue)}</td>
                    <td className="col-hide">{c.owner}</td>
                    <td><StatusChip standing={c.standing} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
