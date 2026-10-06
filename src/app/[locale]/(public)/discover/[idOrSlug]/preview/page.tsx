import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * **A landing page's saved working copy, exactly as a reader would meet it if
 * it were published now** — what the admin status page's and the MCP tools'
 * preview links open, in the public site's own chrome, through the same body
 * the live page renders.
 *
 * Admin-only. The proxy gates the route on the admin role, and this page
 * answers not-found to anyone else as well, rather than rendering what an
 * admin-only read hands a non-admin: nothing. The read is the session's own —
 * the working copy's table admits admins alone — so there is no service role
 * here. What would be published is the saved copy, so that is what is shown.
 *
 * The version shown is the page locale's, which each preview link names for
 * its own language; without one, the same fallback a
 * reader gets (English, then the first written). A version still being written
 * is shown as it stands, its unwritten words left out, since it is the one
 * being worked on.
 */
export default async function LandingPagePreviewPage({
  params,
}: {
  params: Promise<{ idOrSlug: string }>;
}) {
  // Reached by the page's id alone: a working copy is previewed whole, and a
  // slug addresses only what is live.
  const { idOrSlug: id } = await params;

  const viewer = await getUserWithProfile();
  if (viewer?.profile?.role !== "admin") notFound();

  // An id that is not a UUID answers null without a query.
  const page = await new LandingPageService(await createClient()).getAdminPage(id);
  if (page === null) notFound();

  const locale = resolveLocale(await getLocale());
  const { draft } = page;
  const version = resolveTranslation(draft.versions, locale);
  if (version === null) notFound();

  return (
    <LandingPageBody
      sections={draft.sections}
      imagePaths={draft.imagePaths}
      sectionTexts={version.sectionTexts}
      textLocale={version.locale}
      locale={locale}
    />
  );
}
