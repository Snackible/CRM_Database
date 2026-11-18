import { redirect } from "next/navigation";
import ResetForm from "@/components/ResetForm";
import { accountsConfigured, getResetRequests, registrationEnabled } from "@/lib/accounts";

export const metadata = { title: "Reset a password · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!accountsConfigured() || !(await registrationEnabled())) redirect("/login");
  const requests = await getResetRequests();
  if (!requests.length) redirect("/login");
  return <ResetForm requests={requests} />;
}
