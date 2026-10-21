import UnmatchedList from "@/components/UnmatchedList";
import { unmatchedGroups } from "@/lib/queries";

export const metadata = { title: "Unmatched purchases · Snackible CRM" };

export default async function UnmatchedPage() {
  return <UnmatchedList groups={await unmatchedGroups()} />;
}
