// One cell per month. Filled = ordered (the number is how many orders), hollow = no order,
// struck = quiet since the last order on an account that has gone past 75 days.
export function BerthStrip({ client, mini = false, labels = false }) {
  const months = client.months;
  const struckFrom = client.daysSince > 75 ? 12 - client.quietMonths : 99;
  return (
    <div>
      <div className={`berth${mini ? " mini" : ""}`} role="img" aria-label={`Orders per month, ${months[0].label} to ${months[11].label}: ${months.map((m) => m.orders).join(", ")}`}>
        {months.map((m) => {
          const state = m.orders > 0 ? "on" : m.index >= struckFrom ? "struck" : "off";
          return (
            <span key={m.key} className={`cell ${state}`} title={`${m.label}: ${m.orders} ${m.orders === 1 ? "order" : "orders"}`}>
              {m.orders > 0 ? m.orders : ""}
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
