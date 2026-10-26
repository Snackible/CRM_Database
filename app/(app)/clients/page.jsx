import ClientList from "@/components/ClientList";
import { listClients, ownerNames } from "@/lib/queries";

export const metadata = { title: "Clients · Snackible CRM" };

const PAGE = 50;
const SORTS = {
  revenue: (a, b) => b.revenue - a.revenue,
  recent: (a, b) => (a.daysSince ?? 99999) - (b.daysSince ?? 99999),
  quiet: (a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1),
  name: (a, b) => a.name.localeCompare(b.name),
};

// Filtering, sorting and paging happen here so the browser only ever receives one page of clients.
export default async function ClientsPage({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const standing = String(sp.standing ?? "");
  const owner = String(sp.owner ?? "");
  const sort = SORTS[sp.sort] ? sp.sort : "revenue";
  const [all, owners] = await Promise.all([listClients(), ownerNames()]);
  const matched = all
    .filter((c) => (!standing || c.standing === standing) && (!owner || c.owner === owner))
    .filter((c) => !q || [c.name, c.code, c.city, c.segment].some((v) => (v || "").toLowerCase().includes(q)))
    .sort(SORTS[sort]);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const rows = matched.slice((page - 1) * PAGE, page * PAGE).map((c) => ({
    id: c.id, name: c.name, code: c.code, segment: c.segment, city: c.city, owner: c.owner, standing: c.standing,
    revenue: c.revenue, lastOrder: c.lastOrder, daysSince: c.daysSince, counts: c.counts, quietMonths: c.quietMonths,
  }));
  return <ClientList rows={rows} total={all.length} matched={matched.length} page={page} pages={pages} owners={owners} filters={{ q: sp.q ?? "", standing, owner, sort }} />;
}
