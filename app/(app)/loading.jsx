// Shown the instant a link is clicked, while the next page's data is fetched: the page head and two empty panes,
// so the screen answers the click straight away instead of freezing on the old page.
export default function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <div className="plate"><div className="skel skel-title" /><div className="skel skel-line" /></div>
      <div className="panel"><div className="panel-head"><div className="skel skel-line" style={{ width: 160 }} /></div>
        <div className="panel-body stack">
          <div className="skel skel-row" /><div className="skel skel-row" /><div className="skel skel-row" /><div className="skel skel-row" />
        </div>
      </div>
    </div>
  );
}
