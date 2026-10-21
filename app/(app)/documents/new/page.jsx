import InfoForm from "@/components/InfoForm";
import { getClientDetail } from "@/lib/queries";

export const metadata = { title: "Add information · Snackible CRM" };

export default async function NewInfoPage({ searchParams }) {
  const { client } = await searchParams;
  const detail = client ? await getClientDetail(Number(client)) : null;
  return <InfoForm initialClient={detail ? { id: detail.client.id, name: detail.client.name, code: detail.client.code, city: detail.client.city } : null} />;
}
