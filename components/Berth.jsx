import { monthWindow } from "@/lib/metrics";

let META; // month labels, built once per page load, never per client
const meta = () => (META ??= monthWindow(new Date()).months);

// How busy a month was, as a hatch density from 1 (thin) to 4 (solid), against the account's own busiest month
// (at least 4 orders, so a client with a few orders a month still reads as light).
const load = (n, busiest) => Math.min(4, Math.ceil((4 * n) / Math.max(4, busiest)));

// One cell per month. Hatched = ordered (denser means more orders, the number says how many), hollow = no order,
// red cross-hatch = quiet since the last order on an account that has gone past 75 days.
export function BerthStrip({ client, mini = false, labels = false }) {
  const months = client.months ?? meta().map((m, i) => ({ ...m, orders: client.counts[i] }));
  const busiest = Math.max(0, ...months.map((m) => m.orders));
  const struckFrom = client.daysSince > 75 ? 12 - client.quietMonths : 99;
  return (
    <div>
      <div className={`berth${mini ? " mini" : ""}`} role="img" aria-label={`Orders per month, ${months[0].label} to ${months[11].label}: ${months.map((m) => m.orders).join(", ")}`}>
        {months.map((m) => {
          const before = client.since && m.key < client.since.slice(0, 7); // the client did not exist yet
          const state = m.orders > 0 ? "on" : before ? "pre" : m.index >= struckFrom ? "struck" : "off";
          return (
            <span key={m.key} className={`cell ${state}`} data-load={m.orders > 0 ? load(m.orders, busiest) : undefined} title={state === "pre" ? `${m.label}: before this client` : `${m.label}: ${m.orders} ${m.orders === 1 ? "order" : "orders"}`}>
              {m.orders > 0 ? <b>{m.orders}</b> : ""}
            </span>
          );
        })}
      </div>
      {labels && (
        <div className="berth-months" aria-hidden="true">
          {months.map((m) => (
            <span key={m.key} className={m.index === 11 ? "now" : ""}>{m.short}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusChip({ standing }) {
  const cls = standing === "Active" ? "active" : standing === "Watch" ? "watch" : standing === "Lapsed" ? "lapsed" : "new";
  return <span className={`chip ${cls}`}>{standing}</span>;
}
