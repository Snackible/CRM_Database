"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Phone, Upload } from "lucide-react";
import { LEAD_STAGES } from "@/lib/constants";
import { dateLabel } from "@/lib/format";
import { api } from "@/lib/client-api";
import StageControl from "@/components/StageControl";

// "(none)" is a real filter value (leads with no stage set yet), distinct from "" (any stage).
const STAGE_FILTERS = [["", "Any stage"], ...LEAD_STAGES.map((s) => [s, s]), ["(none)", "No stage set"]];

export default function LeadsList({ rows, total, pages, page, owners, filters }) {
  const router = useRouter();
  const [saving, setSaving] = useState(null); // the lead id currently being saved, or null
  const [error, setError] = useState("");

  const link = (patch) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && Number(v) === 1)) p.set(k, v);
    const s = p.toString();
    return s ? `/leads?${s}` : "/leads";
  };
  const go = (patch) => router.replace(link({ ...patch, page: 1 }));

  async function setStage(lead, stage) {
    setSaving(lead.id);
    setError("");
    try {
      await api(`/api/clients/${lead.id}`, { method: "PATCH", body: { leadStage: stage || null } });
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <p>{total.toLocaleString("en-IN")} prospects with no order yet, latest touched first. A lead becomes a client the moment an order is matched to it.</p>
        </div>
        <Link href="/purchases/import" className="btn"><Upload size={17} aria-hidden="true" /> Connect a leads sheet</Link>
      </div>

      <section className="panel" aria-label="Leads">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); go({ q: new FormData(e.currentTarget).get("q")?.toString().trim() ?? "" }); }}>
          <input className="input" type="search" name="q" defaultValue={filters.q} placeholder="Company, person, phone or owner" aria-label="Search leads" />
          {owners.length > 0 && (
            <select className="select" aria-label="Owner" value={filters.owner} onChange={(e) => go({ owner: e.target.value })}>
              <option value="">Any owner</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <select className="select" aria-label="Stage" value={filters.stage} onChange={(e) => go({ stage: e.target.value })}>
            {STAGE_FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <button className="btn sm" type="submit">Filter</button>
          {(filters.q || filters.owner || filters.stage) && <Link className="btn quiet sm" href="/leads">Clear</Link>}
        </form>

        {error && <div className="notice" role="alert" style={{ margin: "0 12px 12px" }}>{error}</div>}

        {rows.length === 0 ? (
          <div className="empty">
            <h3>{total === 0 && !filters.q && !filters.owner && !filters.stage ? "No leads yet" : "No lead matches"}</h3>
            {total === 0 && !filters.q && !filters.owner && !filters.stage ? <>Connect a leads sheet such as the CCBD Tracker under <Link href="/purchases/import">Add, Purchase CSV or sheet</Link>.</> : "Clear the filter to see all leads."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Lead</th><th>Contact</th><th className="col-hide">Owner</th><th>Stage</th><th className="col-hide">Latest note</th><th>Last touched</th></tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link className="name" href={`/clients/${l.id}`}>{l.name}</Link>
                      <span className="sub">{[l.source?.replace(/^Sheet: /, ""), l.city].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td>
                      {l.contact?.name || "—"}
                      {l.people > 1 ? <span className="muted"> +{l.people - 1}</span> : null}
                      {l.contact?.phone ? <span className="sub"><a href={`tel:${l.contact.phone.replace(/\s/g, "")}`}><Phone size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {l.contact.phone}</a></span> : null}
                    </td>
                    <td className="col-hide">{l.owner}</td>
                    <td>
                      <StageControl stage={l.lead_stage} onChange={(s) => setStage(l, s)} disabled={saving === l.id} size="sm" />
                    </td>
                    <td className="col-hide" style={{ maxWidth: 420 }}>{l.last_note ? (l.last_note.length > 140 ? `${l.last_note.slice(0, 140)}…` : l.last_note) : <span className="muted">No notes</span>}</td>
                    <td className="nowrap">{l.last_touch ? dateLabel(l.last_touch, false) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="toolbar" style={{ borderTop: "2px solid var(--rule)", borderBottom: 0, justifyContent: "space-between" }}>
            <span className="muted">Page {page} of {pages}</span>
            <span className="row">
              {page > 1 ? <Link className="btn sm" href={link({ page: page - 1 })}><ChevronLeft size={15} aria-hidden="true" /> Previous</Link> : null}
              {page < pages ? <Link className="btn sm" href={link({ page: page + 1 })}>Next <ChevronRight size={15} aria-hidden="true" /></Link> : null}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
