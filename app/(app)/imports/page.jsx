import ImportsView from "@/components/ImportsView";
import { currentAccount } from "@/lib/http";
import { importsList, sampleCount } from "@/lib/queries";

export const metadata = { title: "Imports & backup · Snackible CRM" };

export default async function ImportsPage() {
  const [imports, sample, account] = await Promise.all([importsList(), sampleCount(), currentAccount()]);
  return <ImportsView imports={imports} sample={sample} isAdmin={account?.role === "admin"} />;
}
