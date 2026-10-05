import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import {
  DiscordLinkConfirm,
  DiscordLinkDead,
  DiscordLinkRefused,
} from "@/components/discord-link/discord-link";
import { getPathname, redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { getUserWithProfile } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("linkDiscord"),
    robots: { index: false, follow: false },
  };
}

/**
 * `/link-discord?token=…` — where the Discord bot's `/link` reply sends a Gedu
 * or an admin to link the Discord account that ran it.
 *
 * The proxy lets every request through (its login bounce would drop the
 * token), so the page gates itself:
 *
 * 1. **Signed out** → login, carrying this page's full address back as the
 *    redirect, token included.
 * 2. **Not a Gedu or an admin** → refused, with no button.
 * 3. **No single token** → the dead-link card, sending them back to Discord.
 * 4. Otherwise the question. **Rendering spends nothing**: the token is only
 *    spent by the button's POST, so a link opened by a preview bot or a
 *    scanner is still good when its owner presses it.
 */
export default async function LinkDiscordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: raw } = await searchParams;
  // A repeated `?token=a&token=b` names no one token.
  const token = typeof raw === "string" && raw !== "" ? raw : null;
  const locale = await getLocale();

  const viewer = await getUserWithProfile();
  if (!viewer) {
    const here = getPathname({
      href: { pathname: ROUTES.linkDiscord, query: token ? { token } : {} },
      locale,
    });
    redirect({ href: { pathname: ROUTES.login, query: { redirect: here } }, locale });
    // The wrapped redirect throws like Next's own, but is not typed `never`.
    return null;
  }

  const role = viewer.profile?.role;
  if (role !== "admin" && role !== "gedu") return <DiscordLinkRefused />;

  return token ? (
    <DiscordLinkConfirm token={token} role={role} />
  ) : (
    <DiscordLinkDead reason="missingToken" />
  );
}
