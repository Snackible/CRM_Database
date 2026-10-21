import Link from "next/link";
import { searchAll } from "@/lib/queries";

export const metadata = { title: "Search · Snackible CRM" };

export default async function SearchPage({ searchParams }) {
  const { q = "" } = await searchParams;
  const hits = await searchAll(q);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Search</h1>
          <p>{q ? `${hits.length} ${hits.length === 1 ? "result" : "results"} for “${q}”` : "Type in the search box above to look through clients, people, facts, notes and document text."}</p>
        </div>
      </div>
      <section className="panel" aria-label="Results">
        {hits.length === 0 && q && <div className="empty"><h3>Nothing found</h3>Try a client code, a person, or a word from a note.</div>}
        {hits.length === 0 && !q && <div className="empty"><h3>Search everything at once</h3>Client names, GSTIN, phone numbers, agreed terms, and the text of notes and documents.</div>}
        <ul className="feed">
          {hits.map((h, i) => (
            <li key={i}>
              <Link href={`/clients/${h.clientId}`}><b>{h.title.length > 140 ? `${h.title.slice(0, 140)}…` : h.title}</b></Link>
              <div className="when">{h.type} · {h.detail}</div>
              {h.snippet ? <div className="muted">“{h.snippet}”</div> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
