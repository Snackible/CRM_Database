// The Snackible CRM mark: a client record card (index tab, name line, detail line, rail notch) with a red status mark.
// The plate and card follow the theme; the red mark is fixed so the logo reads the same in every theme.
export default function Logo({ size = 36, className = "brand-mark" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill="var(--plate)" />
      <path d="M5 11h22v15h-8.5v-3h-5v3H5z M7 7h9v4H7z" fill="var(--plate-ink)" />
      <rect x="8" y="14" width="11" height="2.5" fill="var(--plate)" />
      <rect x="8" y="19" width="7" height="1.5" fill="var(--plate)" />
      <rect x="21" y="13.5" width="3.5" height="3.5" fill="#e3121e" />
    </svg>
  );
}
