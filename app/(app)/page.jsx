import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { overview } from "@/lib/queries";
import { agoLabel, dateLabel, money } from "@/lib/format";
import { BerthStrip, StatusChip } from "@/components/Berth";

export const metadata = { title: "Overview · Snackible CRM" };

const SORTS = [
  ["recent", "Most recent"],
  ["revenue", "Biggest"],
  ["quiet", "Longest quiet"],
  ["overdue", "Most overdue"],
  ["orders", "Most orders"],
  ["name", "Name"],
];
const SIZES = [12, 50, 200];
const DAYS = [30, 45, 75, 90, 180];

export default async function Overview({ searchParams }) {
  const sp = await searchParams;
  const sort = SORTS.some(([k]) => k === sp.sort) ? sp.sort : "recent";
  const limit = SIZES.includes(Number(sp.n)) ? Number(sp.n) : 12;
  const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 45;
  const o = await overview(new Date(), { sort, limit, days });
  const href = (over) => {
    const next = { sort, n: limit, days, ...over };
    const qs = new URLSearchParams({ ...(next.sort !== "recent" ? { sort: next.sort } : {}), ...(next.n !== 12 ? { n: String(next.n) } : {}), ...(next.days !== 45 ? { days: String(next.days) } : {}) }).toString();
    return qs ? `/?${qs}` : "/";
  };

  if (o.total === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Overview</h1></div></div>
        <section className="panel">
          <div className="empty">
            <h3>No clients yet</h3>
            Start with <Link href="/clients/new">a new client</Link>, or <Link href="/purchases/import">upload a purchase CSV</Link> and create clients from the buyers it finds.
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head"><div><h1>Overview</h1></div></div>

      <p className="lede">
        <b>{o.total.toLocaleString("en-IN")} {o.total === 1 ? "client has" : "clients have"}</b> ordered <b>{money(o.revenue)}</b> in the last twelve months.{" "}
        <b>{o.attentionCount.toLocaleString("en-IN")}</b> {o.attentionCount === 1 ? "has" : "have"} gone quiet
        {o.unmatched.rows > 0 ? <>, and <b>{o.unmatched.rows} purchase {o.unmatched.rows === 1 ? "row is" : "rows are"}</b> waiting to be matched to a client</> : null}.
      </p>

      <div className="two-col">
        <section className="panel" aria-labelledby="attn-h">
          <div className="panel-head">
            <h2 id="attn-h">Gone quiet</h2>
            <span className="sub">No order for more than {days} days. Showing {o.attention.length} of {o.attentionCount.toLocaleString("en-IN")}</span>
          </div>
          <div className="toolbar" role="group" aria-label="Sort gone quiet list">
            <span className="sub-lab">Sort</span>
            <span className="seg">
              {SORTS.map(([k, label]) => (
                <Link key={k} href={href({ sort: k })} aria-current={sort === k ? "true" : undefined} scroll={false}>{label}</Link>
              ))}
            </span>
            <span className="sub-lab">Quiet for over</span>
            <span className="seg">
              {DAYS.map((d) => (
                <Link key={d} href={href({ days: d })} aria-current={days === d ? "true" : undefined} scroll={false}>{d} days</Link>
              ))}
            </span>
          </div>
          {o.attention.map((c) => (
            <div className="attn" key={c.id}>
              <div>
                <Link href={`/clients/${c.id}`} className="name">{c.name}</Link>
                <div className="why">
                  Last ordered {agoLabel(c.daysSince)}
                  {c.usualGap ? `, usually every ${c.usualGap} days` : ""}{c.owner ? ` · ${c.owner}` : ""}
                </div>
              </div>
              <div className="berth-slot"><BerthStrip client={c} mini /></div>
              <div className="row">
                <StatusChip standing={c.standing} />
                <Link href={`/clients/${c.id}`} className="btn sm" aria-label={`Open ${c.name}`}>Open <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          ))}
          {o.attentionCount > o.attention.length && (
            <div className="panel-body row">
              {SIZES.filter((s) => s > o.attention.length && s !== limit).slice(0, 1).map((s) => (
                <Link key={s} className="btn sm" href={href({ n: s })} scroll={false}>Show {Math.min(s, o.attentionCount).toLocaleString("en-IN")}</Link>
              ))}
              {limit !== 12 && <Link className="btn quiet sm" href={href({ n: 12 })} scroll={false}>Show 12</Link>}
            </div>
          )}
          {o.attention.length === 0 && (
            <div className="empty"><h3>Everyone has ordered recently</h3>Clients with no order for {days} days will show here.</div>
          )}
        </section>

        <div>
          {o.unmatched.rows > 0 && (
            <section className="panel" aria-labelledby="wait-h">
              <div className="panel-head"><h2 id="wait-h">Waiting for you</h2></div>
              <ul className="feed">
                <li>
                  <Link href="/unmatched"><b>{o.unmatched.groups} {o.unmatched.groups === 1 ? "buyer" : "buyers"}</b></Link> in your imports matched no client ({o.unmatched.rows} rows, {money(o.unmatched.total)}).
                  <div className="when">Link them or create the clients.</div>
                </li>
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="act-h">
            <div className="panel-head"><h2 id="act-h">Recently added</h2></div>
            {o.recent.length === 0 ? (
              <div className="empty">Notes and documents you add will show here.</div>
            ) : (
              <ul className="feed">
                {o.recent.map((t, i) => (
                  <li key={i}>
                    <Link href={`/clients/${t.clientId}`}><b>{t.clientName}</b></Link>
                    <div>{t.kind === "note" ? t.body : t.title}</div>
                    <div className="when">{t.kind === "note" ? `Note by ${t.title}` : "Document"} · {dateLabel(t.date)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
