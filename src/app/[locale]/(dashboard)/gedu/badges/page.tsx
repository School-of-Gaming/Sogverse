import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GeduBadgesPage } from "@/components/gedu/gedu-badges-page";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
// The service module rather than the package index, which re-exports
// `"use client"` query hooks a server component would pull in as client
// references.
import {
  GeduBadgesService,
  type HeldGeduBadge,
} from "@/services/gedu/gedu-badges.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduBadges") };
}

/**
 * `/gedu/badges` — the badges this gedu holds and the ones still to earn.
 *
 * A data shell: resolve the signed-in gedu, read their badges, hand them to
 * the client body. The proxy has already gated the `/gedu` prefix to the gedu
 * role. A failed read answers `null`, which the body treats as "ask again",
 * never as "holds nothing".
 */
export default async function GeduBadgesRoute() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect(ROUTES.login);

  const initialBadges: HeldGeduBadge[] | null = await new GeduBadgesService(
    supabase,
  )
    .getForGedu(userId)
    .catch(() => null);

  return <GeduBadgesPage geduId={userId} initialBadges={initialBadges} />;
}
