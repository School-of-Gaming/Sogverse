import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserWithProfile } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/constants/roles";
import { SelectProfileView } from "@/components/select-profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selectProfile");
  return { title: t("title") };
}

/**
 * Post-sign-in interstitial for parents — "Who is entering Sogverse?"
 *
 * Lives at the top of the app tree (not inside any (group)) so it inherits
 * the chrome-free root layout — no header, no footer, no dashboard sidebar.
 *
 * Routing: the proxy already bounces unauthenticated visitors to /login. Here
 * we additionally short-circuit any non-customer role to their own dashboard,
 * since the family selector is parent-only in v1.
 */
export default async function SelectProfilePage() {
  const userWithProfile = await getUserWithProfile();

  if (!userWithProfile?.user) {
    redirect(`${ROUTES.login}?redirect=${encodeURIComponent(ROUTES.selectProfile)}`);
  }

  const role = userWithProfile.profile?.role as UserRole | undefined;
  if (role !== "customer") {
    redirect(role ? ROLE_DASHBOARD_PATHS[role] : ROUTES.customer.dashboard);
  }

  return <SelectProfileView />;
}
