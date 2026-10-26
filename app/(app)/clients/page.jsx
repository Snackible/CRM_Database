import ClientList from "@/components/ClientList";
import { ownerNames } from "@/lib/queries";
import { clientsPage } from "@/lib/stats";

export const metadata = { title: "Clients · Snackible CRM" };

const PAGE = 50;
const SORTS = ["revenue", "recent", "quiet", "name"];

// Filtering, sorting and paging happen in the database, so only one page of clients is ever read.
export default async function ClientsPage({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const standing = String(sp.standing ?? "");
  const owner = String(sp.owner ?? "");
  const sort = SORTS.includes(sp.sort) ? sp.sort : "revenue";
  const requested = Math.max(1, Number(sp.page) || 1);
  const [result, owners] = await Promise.all([clientsPage({ q, standing, owner, sort, page: requested, size: PAGE }), ownerNames()]);
  const pages = Math.max(1, Math.ceil(result.matched / PAGE));
  const rows = result.rows.map((c) => ({
    id: c.id, name: c.name, code: c.code, segment: c.segment, city: c.city, owner: c.owner, standing: c.standing,
    revenue: c.revenue, lastOrder: c.lastOrder, daysSince: c.daysSince, counts: c.counts, quietMonths: c.quietMonths,
  }));
  return <ClientList rows={rows} total={result.total} matched={result.matched} page={Math.min(requested, pages)} pages={pages} owners={owners} filters={{ q: sp.q ?? "", standing, owner, sort }} />;
}
