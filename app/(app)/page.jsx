import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { overview } from "@/lib/queries";
import { agoLabel, dateLabel, money } from "@/lib/format";
import { BerthStrip, StatusChip } from "@/components/Berth";
import { Bar, Card } from "@/components/Cards";
import { byChannel, byMonth, leadsSummary, newClients, standingCounts, topClients, totals } from "@/lib/insights";
import { parsePeriod } from "@/lib/periods";
import { isoDay } from "@/lib/metrics";

export const metadata = { title: "Overview · Snackible CRM" };

// The summaries above the Gone quiet list: this month against the same days last month, standing counts,
// revenue by month, the biggest clients, channels, first orders and leads waiting.
async function summaries(today) {
  const month = parsePeriod("this month", today);
  const year = parsePeriod("this year", today);
  const lastFrom = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const lastTo = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate())));
  const [mtd, lastMtd, standing, months, top, channels, fresh, leads] = await Promise.all([
    totals(month.from, month.to),
    totals(lastFrom, lastTo),
    standingCounts(today),
    byMonth(12, today),
    topClients(year.from, year.to, 8),
    byChannel(year.from, year.to),
    newClients(month.from, month.to, 5),
    leadsSummary("", 5),
  ]);
  return { mtd, lastMtd, standing, months, top, channels, fresh, leads };
}

const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
function Change({ now, before }) {
  const p = pct(now, before);
  return p === null ? null : <small className={`chg${p < 0 ? " down" : ""}`}>{p > 0 ? "+" : ""}{p}%</small>;
}

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
  const today = new Date();
  const [o, s] = await Promise.all([overview(today, { sort, limit, days }), summaries(today)]);
  const maxMonth = Math.max(0, ...s.months.map((m) => m.revenue));
  const yearTotal = s.channels.reduce((sum, c) => sum + c.revenue, 0);
  const topShare = yearTotal > 0 ? Math.round((s.top.reduce((sum, c) => sum + c.revenue, 0) / yearTotal) * 100) : 0;
  const avg = (t) => (t.orders ? t.revenue / t.orders : 0);
  const standingTotal = s.standing.reduce((sum, c) => sum + c.n, 0);
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

      <div className="ov-grid">
        <div>
          <Card title="This month so far" sub={`1 to ${today.getDate()} ${today.toLocaleDateString("en-IN", { month: "short" })}, against the same days last month`}>
            <dl className="fig-list">
              <div className="lead"><dt>Revenue</dt><dd>{money(s.mtd.revenue)}<Change now={s.mtd.revenue} before={s.lastMtd.revenue} /></dd></div>
              <div><dt>Orders</dt><dd>{s.mtd.orders.toLocaleString("en-IN")}<Change now={s.mtd.orders} before={s.lastMtd.orders} /></dd></div>
              <div><dt>Clients ordering</dt><dd>{s.mtd.clients.toLocaleString("en-IN")}<Change now={s.mtd.clients} before={s.lastMtd.clients} /></dd></div>
              <div><dt>Average order</dt><dd>{money(avg(s.mtd))}<Change now={avg(s.mtd)} before={avg(s.lastMtd)} /></dd></div>
              <div><dt>Same days last month</dt><dd className="muted">{money(s.lastMtd.revenue)}</dd></div>
            </dl>
          </Card>

          <Card title="Revenue by month" sub="Last twelve months">
            {s.months.length === 0 ? <div className="empty">No orders yet.</div> : (
              <table className="tbl">
                <tbody>
                  {s.months.map((m) => (
                    <tr key={m.month}>
                      <td className="nowrap" style={{ width: 110 }}>{new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                      <td style={{ width: "46%" }}><Bar value={m.revenue} max={maxMonth} /></td>
                      <td className="num nowrap">{money(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Revenue by channel" sub="This year">
            <table className="tbl">
              <tbody>
                {s.channels.map((c) => (
                  <tr key={c.channel}>
                    <td style={{ width: 110 }}>{c.channel}</td>
                    <td style={{ width: "40%" }}><Bar value={c.revenue} max={s.channels[0]?.revenue ?? 0} /></td>
                    <td className="num nowrap">{money(c.revenue)}</td>
                    <td className="num col-hide">{yearTotal ? Math.round((c.revenue / yearTotal) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <Card title="Clients by standing" sub={`${standingTotal.toLocaleString("en-IN")} in all`}>
            <table className="tbl">
              <tbody>
                {s.standing.map((c) => (
                  <tr key={c.standing}><td><StatusChip standing={c.standing} /></td><td className="num">{c.n.toLocaleString("en-IN")}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Biggest this year" sub={`These ${s.top.length} are ${topShare}% of this year's revenue`} more={<Link href="/clients">All clients</Link>}>
            <table className="tbl">
              <tbody>
                {s.top.map((c) => (
                  <tr key={c.id}><td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td><td className="num nowrap">{money(c.revenue)}</td><td className="num col-hide">{c.orders.toLocaleString("en-IN")} orders</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="New clients this month" sub={`${s.fresh.total.toLocaleString("en-IN")} placed their first order`}>
            {s.fresh.rows.length === 0 ? <div className="empty">No first orders yet this month.</div> : (
              <table className="tbl">
                <tbody>
                  {s.fresh.rows.map((c) => (
                    <tr key={c.id}><td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td><td className="nowrap">{dateLabel(c.first, false)}</td><td className="num nowrap">{money(c.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Leads waiting" sub={`${s.leads.total.toLocaleString("en-IN")} with no order yet, longest untouched first`} more={<Link href="/leads">All leads</Link>}>
            {s.leads.rows.length === 0 ? <div className="empty">No open leads.</div> : (
              <table className="tbl">
                <tbody>
                  {s.leads.rows.map((l) => (
                    <tr key={l.id}><td><Link className="name" href={`/clients/${l.id}`}>{l.name}</Link><span className="sub">{l.owner}</span></td><td className="nowrap">{l.last_touch ? dateLabel(l.last_touch, false) : "never"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

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
