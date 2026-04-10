import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("forgotPassword"), description: "Reset your Sogverse account password" };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
