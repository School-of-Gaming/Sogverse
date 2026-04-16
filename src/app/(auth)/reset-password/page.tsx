import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("resetPassword"), description: "Set a new password for your Sogverse account" };
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
