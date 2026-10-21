import Shell from "@/components/Shell";
import { currentAccount } from "@/lib/http";
import { sampleCount, unmatchedCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const [account, unmatched, sample] = await Promise.all([currentAccount(), unmatchedCount(), sampleCount()]);
  return (
    <Shell user={account?.name ?? ""} role={account?.role ?? "b2b"} unmatched={unmatched.groups} sample={sample}>
      {children}
    </Shell>
  );
}
