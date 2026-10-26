import Link from "next/link";
import AskBox from "@/components/AskBox";
import { byChannel, byMonth, leadsSummary, newClients, quietRegulars, topClients, totals } from "@/lib/insights";
import { parsePeriod } from "@/lib/periods";
import { isoDay } from "@/lib/metrics";
import { agoLabel, dateLabel, money } from "@/lib/format";

export const metadata = { title: "Insights · Snackible CRM" };

function Bar({ value, max }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return <span aria-hidden="true" style={{ display: "block", height: 12, width: `${pct}%`, background: "var(--ok)", minWidth: value > 0 ? 3 : 0 }} />;
}

function Card({ title, sub, children, more }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head"><h2>{title}</h2>{sub ? <span className="sub">{sub}</span> : null}</div>
      {children}
      {more ? <div className="panel-body" style={{ borderTop: "1px dotted var(--rule)" }}>{more}</div> : null}
    </section>
  );
}

export default async function InsightsPage() {
  const today = new Date();
  const month = parsePeriod("this month", today);
  const year = parsePeriod("this year", today);
  // Same stretch of last month (1st to today's date) so a half-finished month is compared fairly.
  const lastFrom = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const lastTo = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate())));

  const [mtd, lastMtd, months, top, quiet, fresh, channels, leads] = await Promise.all([
    totals(month.from, month.to),
    totals(lastFrom, lastTo),
    byMonth(12, today),
    topClients(year.from, year.to, 8),
    quietRegulars(8),
    newClients(month.from, month.to, 5),
    byChannel(year.from, year.to),
    leadsSummary("", 5),
  ]);
  const change = lastMtd.revenue > 0 ? Math.round(((mtd.revenue - lastMtd.revenue) / lastMtd.revenue) * 100) : null;
  const maxMonth = Math.max(0, ...months.map((m) => m.revenue));
  const yearTotal = channels.reduce((s, c) => s + c.revenue, 0);
  const topShare = yearTotal > 0 ? Math.round((top.reduce((s, c) => s + c.revenue, 0) / yearTotal) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>Worked out from the orders and leads in the CRM each time you open this page. Ask a question below, or read the cards.</p>
        </div>
      </div>

      <AskBox />

      <div className="cp-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))" }}>
        <div>
          <Card title="This month so far" sub={`1 to ${today.getDate()} ${today.toLocaleDateString("en-IN", { month: "short" })}, against the same days last month`}>
            <div className="rhythm-line" style={{ borderTop: 0 }}>
              <span><b>{money(mtd.revenue)}</b> revenue</span>
              <span><b>{mtd.orders.toLocaleString("en-IN")}</b> orders</span>
              <span><b>{mtd.clients.toLocaleString("en-IN")}</b> clients</span>
              {change !== null ? <span className={change < 0 ? "late" : ""}><b>{change > 0 ? "+" : ""}{change}%</b> vs {money(lastMtd.revenue)}</span> : null}
            </div>
          </Card>

          <Card title="Revenue by month" sub="Last twelve months">
            {months.length === 0 ? <div className="empty">No orders yet.</div> : (
              <table className="tbl">
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="nowrap" style={{ width: 110 }}>{new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                      <td style={{ width: "50%" }}><Bar value={m.revenue} max={maxMonth} /></td>
                      <td className="num nowrap">{money(m.revenue)}</td>
                      <td className="num col-hide">{m.orders.toLocaleString("en-IN")} orders</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Top clients this year" sub={`These 8 are ${topShare}% of this year's revenue`}>
            <table className="tbl">
              <tbody>
                {top.map((c) => (
                  <tr key={c.id}><td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td><td className="num">{money(c.revenue)}</td><td className="num col-hide">{c.orders} orders</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Revenue by channel" sub="This year">
            <table className="tbl">
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel}>
                    <td style={{ width: 120 }}>{c.channel}</td>
                    <td style={{ width: "45%" }}><Bar value={c.revenue} max={channels[0]?.revenue ?? 0} /></td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num col-hide">{yearTotal ? Math.round((c.revenue / yearTotal) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <Card title="Regulars gone quiet" sub={`${quiet.total.toLocaleString("en-IN")} clients with 3+ orders are past twice their usual gap`}>
            {quiet.rows.length === 0 ? <div className="empty">No regular client is overdue.</div> : (
              <table className="tbl">
                <tbody>
                  {quiet.rows.map((c) => (
                    <tr key={c.id}>
                      <td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link><span className="sub">Usually every {c.usualGap} days{c.owner ? ` · ${c.owner}` : ""}</span></td>
                      <td className="nowrap late">{agoLabel(c.daysSince)}</td>
                      <td className="num col-hide">{money(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="New clients this month" sub={`${fresh.total.toLocaleString("en-IN")} placed their first order`}>
            {fresh.rows.length === 0 ? <div className="empty">No first orders yet this month.</div> : (
              <table className="tbl">
                <tbody>
                  {fresh.rows.map((c) => (
                    <tr key={c.id}><td><Link className="name" href={`/clients/${c.id}`}>{c.name}</Link></td><td className="nowrap">{dateLabel(c.first, false)}</td><td className="num">{money(c.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Leads waiting" sub={`${leads.total.toLocaleString("en-IN")} with no order yet, longest untouched first`} more={<Link href="/leads">All leads</Link>}>
            {leads.rows.length === 0 ? <div className="empty">No open leads.</div> : (
              <table className="tbl">
                <tbody>
                  {leads.rows.map((l) => (
                    <tr key={l.id}><td><Link className="name" href={`/clients/${l.id}`}>{l.name}</Link><span className="sub">{l.owner}</span></td><td className="nowrap">{l.last_touch ? dateLabel(l.last_touch, false) : "never"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
