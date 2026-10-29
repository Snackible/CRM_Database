// Small pieces shared by the Overview and Insights pages (server components, no state).
export function Bar({ value, max }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return <span aria-hidden="true" style={{ display: "block", height: 12, width: `${pct}%`, background: "var(--ok)", minWidth: value > 0 ? 3 : 0 }} />;
}

export function Card({ title, sub, children, more }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head"><h2>{title}</h2>{sub ? <span className="sub">{sub}</span> : null}</div>
      {children}
      {more ? <div className="panel-body" style={{ borderTop: "1px dotted var(--rule)" }}>{more}</div> : null}
    </section>
  );
}
