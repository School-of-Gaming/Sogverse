import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetupAccountForm } from "@/components/auth";
import { prefetchSpokenLanguages } from "@/services/users/users.prefetch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("setupAccount"), description: "Set up your Sogverse game educator account" };
}

export default async function SetupAccountPage() {
  const spokenLanguages = await prefetchSpokenLanguages();
  return <SetupAccountForm initialSpokenLanguages={spokenLanguages} />;
}
