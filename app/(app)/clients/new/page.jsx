import { Suspense } from "react";
import NewClientForm from "@/components/NewClientForm";
import { currentUser } from "@/lib/http";
import { ownerNames } from "@/lib/queries";

export const metadata = { title: "New client · Snackible CRM" };

export default async function NewClientPage() {
  const [owners, me] = await Promise.all([ownerNames(), currentUser()]);
  return (
    <Suspense fallback={null}>
      <NewClientForm owners={owners} me={me ?? ""} />
    </Suspense>
  );
}
