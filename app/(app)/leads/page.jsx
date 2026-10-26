import Link from "next/link";
import { ChevronLeft, ChevronRight, Phone, Upload } from "lucide-react";
import { listLeads } from "@/lib/queries";
import { dateLabel } from "@/lib/format";

export const metadata = { title: "Leads · Snackible CRM" };

const SIZE = 50;

export default async function LeadsPage({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp.q ?? "");
  const owner = String(sp.owner ?? "");
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, owners } = await listLeads({ q, owner, page, size: SIZE });
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const link = (p) => `/leads?${new URLSearchParams({ ...(q && { q }), ...(owner && { owner }), ...(p > 1 && { page: String(p) }) })}`;

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
        <form className="toolbar" method="get" action="/leads">
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Company, person, phone or owner" aria-label="Search leads" />
          {owners.length > 0 && (
            <select className="select" name="owner" defaultValue={owner} aria-label="Owner">
              <option value="">Any owner</option>
              {owners.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <button className="btn sm" type="submit">Filter</button>
          {(q || owner) && <Link className="btn quiet sm" href="/leads">Clear</Link>}
        </form>

        {rows.length === 0 ? (
          <div className="empty">
            <h3>{total === 0 && !q && !owner ? "No leads yet" : "No lead matches"}</h3>
            {total === 0 && !q && !owner ? <>Connect a leads sheet such as the CCBD Tracker under <Link href="/purchases/import">Add, Purchase CSV or sheet</Link>.</> : "Clear the filter to see all leads."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Lead</th><th>Contact</th><th className="col-hide">Owner</th><th className="col-hide">Latest note</th><th>Last touched</th></tr>
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
              {page > 1 ? <Link className="btn sm" href={link(page - 1)}><ChevronLeft size={15} aria-hidden="true" /> Previous</Link> : null}
              {page < pages ? <Link className="btn sm" href={link(page + 1)}>Next <ChevronRight size={15} aria-hidden="true" /></Link> : null}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
