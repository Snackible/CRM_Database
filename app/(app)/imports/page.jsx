import ImportsView from "@/components/ImportsView";
import { currentAccount } from "@/lib/http";
import { hiddenClients, importsList, sampleCount } from "@/lib/queries";

export const metadata = { title: "Imports & backup · Snackible CRM" };

export default async function ImportsPage() {
  const account = await currentAccount();
  const isAdmin = account?.role === "admin";
  const [imports, sample, hidden] = await Promise.all([importsList(), sampleCount(), isAdmin ? hiddenClients() : []]);
  return <ImportsView imports={imports} sample={sample} hidden={hidden} isAdmin={isAdmin} />;
}
