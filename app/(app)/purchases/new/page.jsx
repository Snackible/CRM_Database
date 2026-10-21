import PurchaseForm from "@/components/PurchaseForm";
import { clientLookup, getClientDetail, productRates } from "@/lib/queries";
import { isoDay } from "@/lib/metrics";

export const metadata = { title: "Add purchase · Snackible CRM" };

export default async function NewPurchasePage({ searchParams }) {
  const { client } = await searchParams;
  const detail = client ? await getClientDetail(Number(client)) : null;
  const products = await productRates();
  return (
    <PurchaseForm
      initialClient={detail ? { id: detail.client.id, name: detail.client.name, code: detail.client.code, city: detail.client.city } : null}
      products={products}
      today={isoDay(new Date())}
    />
  );
}
