import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { ForgotPasswordForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/forgot-password", await getLocale())),
    title: t("pages.forgotPassword"),
    description: t("descriptions.forgotPassword"),
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
