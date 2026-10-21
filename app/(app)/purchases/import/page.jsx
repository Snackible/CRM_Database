import ImportFlow from "@/components/ImportFlow";
import { currentAccount } from "@/lib/http";
import { listSources } from "@/lib/sheetSync";
import { sheetsConfigured } from "@/lib/sheets";

export const metadata = { title: "Purchases from a file or sheet · Snackible CRM" };

export default async function ImportPage() {
  const isAdmin = (await currentAccount())?.role === "admin";
  return <ImportFlow isAdmin={isAdmin} sheetsConfigured={sheetsConfigured()} sources={isAdmin ? await listSources() : []} />;
}
