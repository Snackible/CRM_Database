import { notFound } from "next/navigation";
import ClientView from "@/components/ClientView";
import { getClientDetail } from "@/lib/queries";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const d = await getClientDetail(Number(id));
  return { title: `${d ? d.client.name : "Client"} · Snackible CRM` };
}

export default async function ClientPage({ params }) {
  const { id } = await params;
  const detail = await getClientDetail(Number(id));
  if (!detail) notFound();
  return <ClientView {...detail} />;
}
