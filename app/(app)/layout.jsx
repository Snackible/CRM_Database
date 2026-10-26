import { after } from "next/server";
import Shell from "@/components/Shell";
import { currentAccount } from "@/lib/http";
import { sampleCount, unmatchedCount } from "@/lib/queries";
import { syncIfDue } from "@/lib/sheetSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // leaves room for the background sheet sync below

export default async function AppLayout({ children }) {
  const [account, unmatched, sample] = await Promise.all([currentAccount(), unmatchedCount(), sampleCount()]);
  // With no scheduler, the Google Sheet feeds are read again whenever someone opens the CRM and the last read
  // was over an hour ago. It runs after the page is sent, so nobody waits for it.
  if (account) {
    after(() => syncIfDue("Automatic sync").catch((e) => console.error("Automatic sheet sync failed:", e.message)));
  }
  return (
    <Shell user={account?.name ?? ""} role={account?.role ?? "b2b"} unmatched={unmatched.groups} sample={sample}>
      {children}
    </Shell>
  );
}
