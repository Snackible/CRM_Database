import { after } from "next/server";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { currentAccount } from "@/lib/http";
import { shellCounts } from "@/lib/queries";
import { syncIfDue } from "@/lib/sheetSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // five minutes, so the background sheet sync below can finish

export default async function AppLayout({ children }) {
  const [account, counts] = await Promise.all([currentAccount(), shellCounts()]);
  // The cookie only proves someone signed in once; the accounts sheet decides whether they still may be here.
  if (!account) redirect("/login");
  // With no scheduler, the Google Sheet feeds are read again whenever someone opens the CRM and the last read
  // was over an hour ago. It runs after the page is sent, so nobody waits for it.
  after(() => syncIfDue("Automatic sync").catch((e) => console.error("Automatic sheet sync failed:", e.message)));
  return (
    <Shell user={account?.name ?? ""} role={account?.role ?? "b2b"} unmatched={counts.unmatched} sample={counts.sample} extent={{ clients: counts.clients, leads: counts.leads, unmatched: counts.unmatched }}>
      {children}
    </Shell>
  );
}
