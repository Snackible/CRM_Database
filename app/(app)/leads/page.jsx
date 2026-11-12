import LeadsList from "@/components/LeadsList";
import { listLeads } from "@/lib/queries";

export const metadata = { title: "Leads · Snackible CRM" };

const SIZE = 50;

export default async function LeadsPage({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp.q ?? "");
  const owner = String(sp.owner ?? "");
  const stage = String(sp.stage ?? "");
  const urgent = sp.urgent === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, owners } = await listLeads({ q, owner, stage, urgent, page, size: SIZE });
  const pages = Math.max(1, Math.ceil(total / SIZE));
  return <LeadsList rows={rows} total={total} pages={pages} page={Math.min(page, pages)} owners={owners} filters={{ q, owner, stage, urgent: urgent ? "1" : "" }} />;
}
