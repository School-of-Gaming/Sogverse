import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { ResetPasswordForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/reset-password", await getLocale())),
    title: t("pages.resetPassword"),
    description: t("descriptions.resetPassword"),
  };
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
