import type { Metadata } from "next";
import { redirect as redirectExternal } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  OAuthConsent,
  OAuthConsentRefused,
  OAuthConsentUnavailable,
} from "@/components/oauth-consent/oauth-consent";
import { getPathname, redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { describeRedirectDestination, isNavigableRedirect } from "@/lib/oauth-consent";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("oauthConsent"),
    robots: { index: false, follow: false },
  };
}

/**
 * `/oauth/consent?authorization_id=…` — where Supabase Auth's OAuth server sends
 * an admin whose AI app is asking to connect to the MCP endpoint.
 *
 * The proxy lets every request through (it would drop the id on its login
 * bounce), so the page gates itself, in this order:
 *
 * 1. **Signed out** → login, carrying this page's full address back as the
 *    redirect, query included.
 * 2. **Not an admin** → refused, and **before** the authorization is read:
 *    reading it binds it to the reader and auto-approves a client the reader
 *    has approved before, so a non-admin must never get that far.
 * 3. **Read the authorization once.** A client this admin already approved comes
 *    back as a redirect and is followed at once; an authorization already
 *    answered or expired comes back as an error and gets the start-again card;
 *    anything else is the question.
 */
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
  const { authorization_id: raw } = await searchParams;
  // A repeated `?authorization_id=a&authorization_id=b` names no one request.
  const authorizationId = typeof raw === "string" && raw !== "" ? raw : null;
  const locale = await getLocale();

  const viewer = await getUserWithProfile();
  if (!viewer) {
    const here = getPathname({
      href: {
        pathname: ROUTES.oauthConsent,
        query: authorizationId ? { authorization_id: authorizationId } : {},
      },
      locale,
    });
    redirect({ href: { pathname: ROUTES.login, query: { redirect: here } }, locale });
    // The wrapped redirect throws like Next's own, but is not typed `never`.
    return null;
  }

  const { user, profile } = viewer;
  if (profile?.role !== "admin") {
    return <OAuthConsentRefused email={profile?.email ?? user.email ?? ""} />;
  }

  if (authorizationId === null) return <OAuthConsentUnavailable />;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) {
    if (!error.status || error.status >= 500) {
      console.error("[oauth/consent] reading the authorization failed:", error);
    }
    return <OAuthConsentUnavailable />;
  }

  // Already approved for this client: Supabase answers with the client's own
  // callback, code attached, and there is nothing left to ask.
  if (!("authorization_id" in data)) {
    if (!isNavigableRedirect(data.redirect_url)) return <OAuthConsentUnavailable />;
    redirectExternal(data.redirect_url);
  }

  return (
    <OAuthConsent
      authorizationId={data.authorization_id}
      clientName={data.client.name}
      destination={describeRedirectDestination(data.redirect_uri)}
      email={data.user.email}
    />
  );
}
