"use client";

import { LEAD_STAGES } from "@/lib/constants";

/**
 * A lead's stage, drawn the same way the standing chip is: an 18px hatched mark, not a tinted badge. Progress
 * reads as hatch density, exactly like a Berth cell's load (New hollow, up through three densities, Won solid).
 * No stage set yet is a dotted, muted mark; Lost breaks the climb and takes the lapsed mark, red cross-hatch.
 * Editable (a real <select>, for keyboard and screen readers) when onChange is given; a plain badge otherwise.
 */
export default function StageControl({ stage, onChange, disabled, size = "md" }) {
  const sz = size === "sm" ? " sm" : "";
  const label = stage || "No stage";

  if (!onChange) {
    return (
      <span className={`stage-chip${sz}`} data-stage={stage ?? ""}>
        <i className="mk" aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <span className={`stage-chip stage-field${sz}${disabled ? " busy" : ""}`} data-stage={stage ?? ""}>
      <i className="mk" aria-hidden="true" />
      <select
        className="stage-select"
        aria-label="Lead stage"
        value={stage ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">No stage</option>
        {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </span>
  );
}
