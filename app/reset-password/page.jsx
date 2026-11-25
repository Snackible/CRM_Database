import { redirect } from "next/navigation";
import ResetForm from "@/components/ResetForm";
import { accountsConfigured, resetEnabled } from "@/lib/accounts";

export const metadata = { title: "Reset a password · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!accountsConfigured()) redirect("/login");
  return <ResetForm enabled={await resetEnabled()} />;
}
