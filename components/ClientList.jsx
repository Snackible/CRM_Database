"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { agoLabel, money } from "@/lib/format";
import { BerthStrip, StatusChip } from "@/components/Berth";

export default function ClientList({ rows, total, matched, page, pages, owners, filters }) {
  const router = useRouter();
  const [text, setText] = useState(filters.q);
  const first = useRef(true);

  const href = (patch) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "sort" && v === "revenue") && !(k === "page" && Number(v) === 1)) p.set(k, v);
    const s = p.toString();
    return s ? `/clients?${s}` : "/clients";
  };

  // Typing in the filter box searches a beat after the last key.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => router.replace(href({ q: text.trim(), page: 1 })), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const go = (patch) => router.replace(href({ ...patch, page: 1 }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>
            {total.toLocaleString("en-IN")} {total === 1 ? "account" : "accounts"}
            {matched !== total ? `, ${matched.toLocaleString("en-IN")} match` : ""}. Each strip shows the last twelve months, one cell per month.
          </p>
        </div>
        <Link href="/clients/new" className="btn primary"><Plus size={18} aria-hidden="true" /> New client</Link>
      </div>

      <section className="panel" aria-label="Client list">
        <div className="toolbar">
          <input className="input" type="search" placeholder="Filter by name, code or city" aria-label="Filter clients" value={text} onChange={(e) => setText(e.target.value)} />
          <select className="select" aria-label="Status" value={filters.standing} onChange={(e) => go({ standing: e.target.value })}>
            <option value="">Any status</option>
            <option>Active</option><option>Watch</option><option>Lapsed</option><option>Lead</option><option>New</option>
          </select>
          {owners.length > 0 && (
            <select className="select" aria-label="Owner" value={filters.owner} onChange={(e) => go({ owner: e.target.value })}>
              <option value="">Any owner</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <select className="select" aria-label="Sort" value={filters.sort} onChange={(e) => go({ sort: e.target.value })}>
            <option value="revenue">Biggest first</option>
            <option value="recent">Ordered most recently</option>
            <option value="quiet">Quiet longest</option>
            <option value="name">Name A to Z</option>
          </select>
        </div>

        {total === 0 ? (
          <div className="empty">
            <h3>No clients yet</h3>
            <Link href="/clients/new">Add the first one</Link>, or <Link href="/purchases/import">upload a purchase CSV or connect a sheet</Link>.
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

        {pages > 1 && (
          <div className="toolbar" style={{ borderTop: "2px solid var(--rule)", borderBottom: 0, justifyContent: "space-between" }}>
            <span className="muted">Page {page} of {pages.toLocaleString("en-IN")}</span>
            <span className="row">
              {page > 1 ? <Link className="btn sm" href={href({ page: page - 1 })}><ChevronLeft size={15} aria-hidden="true" /> Previous</Link> : null}
              {page < pages ? <Link className="btn sm" href={href({ page: page + 1 })}>Next <ChevronRight size={15} aria-hidden="true" /></Link> : null}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
