import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import {
  SlackLinkConfirm,
  SlackLinkDead,
  SlackLinkRefused,
} from "@/components/slack-link/slack-link";
import { getPathname, redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { readSlackLinkToken } from "@/lib/slack-link-token.server";
import { getUserWithProfile } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("linkSlack"),
    robots: { index: false, follow: false },
  };
}

/**
 * `/link-slack?token=…` — where the Slack app's link command sends an admin to
 * link the Slack account that ran it, so its Accept buttons act as them.
 *
 * The proxy lets every request through (its login bounce would drop the
 * token), so the page gates itself, exactly as `/link-discord` does:
 *
 * 1. **Signed out** → login, carrying this page's full address back as the
 *    redirect, token included.
 * 2. **Not an admin** → refused, with no button.
 * 3. **No single token** → the dead-link card, sending them back to Slack.
 * 4. **An unknown, used or expired token** → its dead-link card, no button.
 * 5. Otherwise the question, naming the Slack account the token would link.
 *    **Rendering spends nothing**: only the button's POST does.
 */
export default async function LinkSlackPage({
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
      href: { pathname: ROUTES.linkSlack, query: token ? { token } : {} },
      locale,
    });
    redirect({ href: { pathname: ROUTES.login, query: { redirect: here } }, locale });
    // The wrapped redirect throws like Next's own, but is not typed `never`.
    return null;
  }

  if (viewer.profile?.role !== "admin") return <SlackLinkRefused />;

  if (!token) return <SlackLinkDead reason="missingToken" />;

  // A service-role read, because only the service role is granted the token
  // table; it never deletes or spends the token. Reached only past the admin
  // gate above, so nobody else learns whose a token is.
  const state = await readSlackLinkToken(token);
  if (state.kind !== "live") return <SlackLinkDead reason={state.kind} />;

  return <SlackLinkConfirm token={token} slackUsername={state.slackUsername} />;
}
