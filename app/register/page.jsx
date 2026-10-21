import { redirect } from "next/navigation";
import RegisterForm from "@/components/RegisterForm";
import { accountsConfigured, registrationEnabled } from "@/lib/accounts";

export const metadata = { title: "Register · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!accountsConfigured() || !(await registrationEnabled())) redirect("/login");
  return <RegisterForm />;
}
