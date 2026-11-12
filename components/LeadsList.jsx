"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Phone, Upload } from "lucide-react";
import { LEAD_STAGES } from "@/lib/constants";
import { dateLabel, notePreview } from "@/lib/format";
import { api } from "@/lib/client-api";
import StageControl from "@/components/StageControl";

// "(none)" is a real filter value (leads with no stage set yet), distinct from "" (any stage).
const STAGE_FILTERS = [["", "Any stage"], ...LEAD_STAGES.map((s) => [s, s]), ["(none)", "No stage set"]];

export default function LeadsList({ rows, total, pages, page, owners, filters }) {
  const router = useRouter();
  const [saving, setSaving] = useState(null); // the lead id currently being saved, or null
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [editingContact, setEditingContact] = useState(null); // the lead id whose contact is being edited
  const [contactEdit, setContactEdit] = useState({ name: "", phone: "" });

  const link = (patch) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && Number(v) === 1)) p.set(k, v);
    const s = p.toString();
    return s ? `/leads?${s}` : "/leads";
  };
  const go = (patch) => router.replace(link({ ...patch, page: 1 }));

  async function save(id, fn) {
    setSaving(id);
    setError("");
    try {
      const r = await fn();
      setNote(r?.sheetSynced?.length ? "Also updated in the sheet it came from." : r?.sheetError ? `Saved here, but could not reach the sheet: ${r.sheetError}` : "");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const setStage = (lead, stage) => save(lead.id, () => api(`/api/clients/${lead.id}`, { method: "PATCH", body: { leadStage: stage || null } }));
  const setOwner = (lead, owner) => {
    if (owner === (lead.owner ?? "")) return;
    save(lead.id, () => api(`/api/clients/${lead.id}`, { method: "PATCH", body: { owner } }));
  };
  const startEditContact = (lead) => {
    setContactEdit({ name: lead.contact?.name ?? "", phone: lead.contact?.phone ?? "" });
    setEditingContact(lead.id);
  };
  const saveContact = (e, lead) => {
    e.preventDefault();
    const body = contactEdit;
    save(lead.id, async () => {
      const r = lead.contact?.id
        ? await api(`/api/contacts/${lead.contact.id}`, { method: "PATCH", body })
        : await api(`/api/clients/${lead.id}/contacts`, { method: "POST", body });
      setEditingContact(null);
      return r;
    });
  };

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
          <label className="row" style={{ gap: 6, fontWeight: 800 }}>
            <input type="checkbox" checked={filters.urgent === "1"} onChange={(e) => go({ urgent: e.target.checked ? "1" : "" })} />
            Urgent only
          </label>
          <button className="btn sm" type="submit">Filter</button>
          {(filters.q || filters.owner || filters.stage || filters.urgent) && <Link className="btn quiet sm" href="/leads">Clear</Link>}
        </form>

        {error && <div className="notice" role="alert" style={{ margin: "0 12px 12px" }}>{error}</div>}
        {!error && note && <div className="notice" role="status" style={{ margin: "0 12px 12px" }}>{note}</div>}

        {rows.length === 0 ? (
          <div className="empty">
            <h3>{total === 0 && !filters.q && !filters.owner && !filters.stage && !filters.urgent ? "No leads yet" : "No lead matches"}</h3>
            {total === 0 && !filters.q && !filters.owner && !filters.stage && !filters.urgent ? <>Connect a leads sheet such as the CCBD Tracker under <Link href="/purchases/import">Add, Purchase CSV or sheet</Link>.</> : "Clear the filter to see all leads."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Lead</th><th>Contact</th><th className="col-hide">Owner</th><th>Stage</th><th className="col-hide">Latest note</th><th>Last touched</th></tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className={l.urgent ? "urgent" : undefined}>
                    <td>
                      {l.urgent && <span className="urgent-mark">Urgent</span>}
                      <Link className="name" href={`/clients/${l.id}`}>{l.name}</Link>
                      <span className="sub">{[l.source?.replace(/^Sheet: /, ""), l.city].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td>
                      {editingContact === l.id ? (
                        <form className="row" style={{ gap: 4, flexWrap: "nowrap" }} onSubmit={(e) => saveContact(e, l)}>
                          <input className="input sm" style={{ width: 120 }} placeholder="Name" value={contactEdit.name} onChange={(e) => setContactEdit({ ...contactEdit, name: e.target.value })} autoFocus />
                          <input className="input sm" style={{ width: 110 }} placeholder="Phone" value={contactEdit.phone} onChange={(e) => setContactEdit({ ...contactEdit, phone: e.target.value })} />
                          <button className="btn primary sm" type="submit" disabled={saving === l.id}>Save</button>
                          <button className="btn quiet sm" type="button" onClick={() => setEditingContact(null)}>Cancel</button>
                        </form>
                      ) : (
                        <>
                          {l.contact?.name || "—"}
                          {l.people > 1 ? <span className="muted"> +{l.people - 1}</span> : null}
                          {l.contact?.phone ? <span className="sub"><a href={`tel:${l.contact.phone.replace(/\s/g, "")}`}><Phone size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {l.contact.phone}</a></span> : null}
                          <button className="btn quiet sm" aria-label={`Edit contact for ${l.name}`} style={{ marginLeft: 6, padding: 0, height: "auto" }} onClick={() => startEditContact(l)} disabled={saving === l.id}>
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </td>
                    <td className="col-hide">
                      <input
                        className="input sm"
                        style={{ width: "100%", minWidth: 100 }}
                        defaultValue={l.owner ?? ""}
                        aria-label={`Owner for ${l.name}`}
                        disabled={saving === l.id}
                        onBlur={(e) => setOwner(l, e.target.value.trim())}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    </td>
                    <td>
                      <StageControl stage={l.lead_stage} onChange={(s) => setStage(l, s)} disabled={saving === l.id} size="sm" />
                    </td>
                    <td className="col-hide" style={{ maxWidth: 420 }}>{l.last_note ? notePreview(l.last_note) : <span className="muted">No notes</span>}</td>
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
