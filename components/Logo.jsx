// The Snackible CRM mark: an S built from order-strip cells on a plate, the last cell in Snackible red.
// The plate and cells follow the theme; the red cell is fixed so the mark reads the same in every theme.
const CELLS = [
  [0, 0], [1, 0], [2, 0],
  [0, 1],
  [0, 2], [1, 2], [2, 2],
  [2, 3],
  [0, 4], [1, 4],
];

export default function Logo({ size = 36, className = "brand-mark" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill="var(--plate)" />
      {CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={9 + x * 5} y={4 + y * 5} width="4" height="4" fill="var(--plate-ink)" />
      ))}
      <rect x="19" y="24" width="4" height="4" fill="#e3121e" />
    </svg>
  );
}
