"use client";

import { useRouter } from "next/navigation";

/** A <select> of months; each option already carries the full href to navigate to (built server-side). */
export default function MonthPicker({ value, options }) {
  const router = useRouter();
  return (
    <select
      className="select"
      aria-label="Month"
      value={value}
      style={{ width: "auto", minHeight: 32, padding: "0 8px", fontSize: 13 }}
      onChange={(e) => {
        const opt = options.find((o) => o.key === e.target.value);
        if (opt) router.push(opt.href, { scroll: false });
      }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}
