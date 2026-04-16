import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetupAccountForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("setupAccount"), description: "Set up your Sogverse game educator account" };
}

export default function SetupAccountPage() {
  return <SetupAccountForm />;
}
