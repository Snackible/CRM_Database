import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { overview } from "@/lib/queries";
import { agoLabel, dateLabel, money, notePreview } from "@/lib/format";
import { BerthStrip, StatusChip } from "@/components/Berth";
import { Bar, Card } from "@/components/Cards";
import MonthPicker from "@/components/MonthPicker";
import StageControl from "@/components/StageControl";
import { byMonth, leadsSummary, newClients, standingCounts, topClients, totals } from "@/lib/insights";
import { parsePeriod } from "@/lib/periods";
import { isoDay } from "@/lib/metrics";

export const metadata = { title: "Overview · Snackible CRM" };

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const lastDayOf = (y, m) => isoDay(new Date(y, m + 1, 0)); // m is 0-based

/** The period for "This month" (or a chosen past month) and the matching stretch of the month before it. */
function monthPeriods(viewDate, today) {
  const isCurrent = monthKeyOf(viewDate) === monthKeyOf(today);
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const from = isoDay(new Date(y, m, 1));
  const to = isCurrent ? isoDay(today) : lastDayOf(y, m);
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  const prevFrom = isoDay(new Date(py, pm, 1));
  const prevTo = isCurrent ? isoDay(new Date(py, pm, Math.min(today.getDate(), new Date(py, pm + 1, 0).getDate()))) : lastDayOf(py, pm);
  return { from, to, prevFrom, prevTo, isCurrent };
}

// The summaries above the Gone quiet list: the chosen month against the matching stretch of the month before,
// standing counts, revenue by month, the biggest clients, first orders and leads waiting. B2B channel only.
async function summaries(viewDate, today, channel) {
  const period = monthPeriods(viewDate, today);
  const year = parsePeriod("this year", today);
  const [mtd, lastMtd, standing, months, top, yearTotal, fresh, leads] = await Promise.all([
    totals(period.from, period.to, channel),
    totals(period.prevFrom, period.prevTo, channel),
    standingCounts(today, channel),
    byMonth(12, today, channel),
    topClients(year.from, year.to, 8, channel),
    totals(year.from, year.to, channel),
    newClients(period.from, period.to, 5, channel),
    leadsSummary("", 5),
  ]);
  return { mtd, lastMtd, standing, months, top, yearTotal: yearTotal.revenue, fresh, leads, period };
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
  const currentMonth = monthKeyOf(today);
  const requestedMonth = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : currentMonth;
  const month = requestedMonth > currentMonth ? currentMonth : requestedMonth; // no peeking at the future
  const [my, mm] = month.split("-").map(Number);
  const viewDate = new Date(my, mm - 1, 1);
  const channel = "b2b";
  const [o, s] = await Promise.all([overview(today, { sort, limit, days, channel }), summaries(viewDate, today, channel)]);
  const maxMonth = Math.max(0, ...s.months.map((m) => m.revenue));
  const topShare = s.yearTotal > 0 ? Math.round((s.top.reduce((sum, c) => sum + c.revenue, 0) / s.yearTotal) * 100) : 0;
  const avg = (t) => (t.orders ? t.revenue / t.orders : 0);
  const standingTotal = s.standing.reduce((sum, c) => sum + c.n, 0);
  const href = (over) => {
    const next = { sort, n: limit, days, month, ...over };
    const qs = new URLSearchParams({
      ...(next.sort !== "recent" ? { sort: next.sort } : {}),
      ...(next.n !== 12 ? { n: String(next.n) } : {}),
      ...(next.days !== 45 ? { days: String(next.days) } : {}),
      ...(next.month !== currentMonth ? { month: next.month } : {}),
    }).toString();
    return qs ? `/?${qs}` : "/";
  };
  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = monthKeyOf(d);
    return { key, label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), href: href({ month: key }) };
  });
  const monthLabel = viewDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

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
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            <b>{o.total.toLocaleString("en-IN")} clients</b> ordered <b>{money(o.revenue)}</b> in the last twelve months, B2B only.{" "}
            <b>{o.attentionCount.toLocaleString("en-IN")}</b> gone quiet{o.unmatched.rows > 0 ? <>, <Link href="/unmatched"><b>{o.unmatched.rows}</b> rows unmatched</Link></> : null}.
          </p>
        </div>
      </div>

      <div className="ov-grid">
        <div>
          <Card
            title={s.period.isCurrent ? "This month so far" : monthLabel}
            sub={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {s.period.isCurrent ? `1–${today.getDate()} ${today.toLocaleDateString("en-IN", { month: "short" })}, vs. same days last month` : "Vs. the month before, in full"}
                <MonthPicker value={month} options={monthOptions} />
              </span>
            }
          >
            <dl className="fig-list">
              <div className="lead"><dt>Revenue</dt><dd>{money(s.mtd.revenue)}<Change now={s.mtd.revenue} before={s.lastMtd.revenue} /></dd></div>
              <div><dt>Orders</dt><dd>{s.mtd.orders.toLocaleString("en-IN")}<Change now={s.mtd.orders} before={s.lastMtd.orders} /></dd></div>
              <div><dt>Clients ordering</dt><dd>{s.mtd.clients.toLocaleString("en-IN")}<Change now={s.mtd.clients} before={s.lastMtd.clients} /></dd></div>
              <div><dt>Average order</dt><dd>{money(avg(s.mtd))}<Change now={avg(s.mtd)} before={avg(s.lastMtd)} /></dd></div>
              <div><dt>{s.period.isCurrent ? "Same days last month" : "Month before"}</dt><dd className="muted">{money(s.lastMtd.revenue)}</dd></div>
            </dl>
          </Card>

          <Card title="Clients by standing" sub={`${standingTotal.toLocaleString("en-IN")} in all`}>
            <table className="tbl tbl-link">
              <tbody>
                {s.standing.map((c) => (
                  <tr key={c.standing}>
                    <td><Link href={`/clients?standing=${encodeURIComponent(c.standing)}`}><StatusChip standing={c.standing} /></Link></td>
                    <td className="num"><Link href={`/clients?standing=${encodeURIComponent(c.standing)}`}>{c.n.toLocaleString("en-IN")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        </div>

        <div>
          <Card title="Biggest this year" sub={`These ${s.top.length} are ${topShare}% of this year's revenue`} more={<Link href="/clients">All clients</Link>}>
            <table className="tbl">
              <tbody>
                {s.top.map((c) => (
                  <tr key={c.id}><td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td><td className="num nowrap">{money(c.revenue)}</td><td className="num col-hide">{c.orders.toLocaleString("en-IN")} orders</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={s.period.isCurrent ? "New clients this month" : `New clients, ${monthLabel}`} sub={`${s.fresh.total.toLocaleString("en-IN")} placed their first order`}>
            {s.fresh.rows.length === 0 ? <div className="empty">{s.period.isCurrent ? "No first orders yet this month." : `No first orders in ${monthLabel}.`}</div> : (
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
                    <tr key={l.id}>
                      <td><Link className="name" href={`/clients/${l.id}`}>{l.name}</Link><span className="sub">{l.owner}</span></td>
                      <td><StageControl stage={l.lead_stage} size="sm" /></td>
                      <td className="nowrap">{l.last_touch ? dateLabel(l.last_touch, false) : "never"}</td>
                    </tr>
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
                    <div>{t.kind === "note" ? notePreview(t.body, 140) : t.title}</div>
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
