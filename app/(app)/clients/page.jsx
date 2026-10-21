import ClientList from "@/components/ClientList";
import { listClients, ownerNames } from "@/lib/queries";

export const metadata = { title: "Clients · Snackible CRM" };

export default async function ClientsPage() {
  const [clients, owners] = await Promise.all([listClients(), ownerNames()]);
  return <ClientList clients={clients} owners={owners} />;
}
