import { notFound } from "next/navigation";
import ClientView from "@/components/ClientView";
import { currentAccount } from "@/lib/http";
import { getClientDetail } from "@/lib/queries";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const d = await getClientDetail(Number(id));
  return { title: `${d ? d.client.name : "Client"} · Snackible CRM` };
}

export default async function ClientPage({ params }) {
  const { id } = await params;
  const [detail, account] = await Promise.all([getClientDetail(Number(id)), currentAccount()]);
  if (!detail) notFound();
  return <ClientView {...detail} isAdmin={account?.role === "admin"} />;
}
