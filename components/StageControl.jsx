"use client";

import { LEAD_STAGES } from "@/lib/constants";

// How far along the stage is, left (just arrived) to right (closed). Lost sits off that line entirely, in the
// app's one accent colour — the same red used for "Lapsed" and other things that need attention.
const TONE = { New: 0, Contacted: 1, Qualified: 2, Negotiating: 3, Won: 4 };

function styleFor(stage) {
  if (stage === "Lost") return { background: "var(--bad)", borderColor: "var(--bad)", color: "var(--bad-on)" };
  if (!stage) return { background: "var(--pane)", borderColor: "var(--rule)", color: "var(--muted)" };
  const tone = TONE[stage] ?? 0;
  const dark = tone === 4; // Won: solid fill, light text
  return {
    background: `color-mix(in srgb, var(--ink) ${tone * 20}%, var(--pane))`,
    borderColor: "var(--ink)",
    color: dark ? "var(--pane)" : "var(--ink)",
  };
}

/** A stage shown with how far along it is, strongly distinct from the New/Watch/Lapsed standing chip.
 *  Editable (a <select>) when onChange is given; a plain read-only badge otherwise. */
export default function StageControl({ stage, onChange, disabled, size = "md" }) {
  const style = styleFor(stage);
  if (!onChange) {
    return <span className={`stage-pill${size === "sm" ? " sm" : ""}`} style={style}>{stage || "No stage"}</span>;
  }
  return (
    <select
      className={`stage-pill stage-select${size === "sm" ? " sm" : ""}`}
      aria-label="Lead stage"
      value={stage ?? ""}
      disabled={disabled}
      style={style}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No stage</option>
      {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
