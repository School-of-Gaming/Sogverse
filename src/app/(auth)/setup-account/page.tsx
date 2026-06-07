import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetupAccountForm } from "@/components/auth";
import { createClient } from "@/lib/supabase/server";
import { UsersService } from "@/services/users";
import type { SpokenLanguage } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("setupAccount"), description: "Set up your Sogverse game educator account" };
}

/**
 * Server-prefetch the spoken-language reference set so the form's language
 * checkboxes paint complete on the first frame (CLAUDE.md layout-shift rule).
 * `spoken_languages` is anon-readable, so this works before the invite session
 * is established client-side. On failure the page still renders and the client
 * hook refetches on mount.
 */
async function getSpokenLanguages(): Promise<SpokenLanguage[]> {
  try {
    const supabase = await createClient();
    return await new UsersService(supabase).getSpokenLanguages();
  } catch {
    return [];
  }
}

export default async function SetupAccountPage() {
  const spokenLanguages = await getSpokenLanguages();
  return <SetupAccountForm initialSpokenLanguages={spokenLanguages} />;
}
