import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { landingPlacedGuideIds } from "@/lib/landing-pages/sections";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { GuidesService } from "@/services/guides/guides.service";
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
 * being worked on. Its testimonials are the working copy's, with their
 * current words from the store, which the admin read carries. Its guides are
 * the working copy's too, and an admin may download any guide, so the
 * preview's download works as the live page's will.
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
  const supabase = await createClient();
  const page = await new LandingPageService(supabase).getAdminPage(id);
  if (page === null) notFound();

  const locale = resolveLocale(await getLocale());
  const { draft } = page;
  const version = resolveTranslation(draft.versions, locale);
  if (version === null) notFound();

  // The working copy's guides, through the admin read the public one would
  // not answer for a guide placed only here.
  const placedGuideIds = landingPlacedGuideIds(draft.sections);
  const guideIds =
    placedGuideIds.length === 0
      ? []
      : await new GuidesService(supabase).listExistingGuideIds(placedGuideIds);

  return (
    <LandingPageBody
      sections={draft.sections}
      imagePaths={draft.imagePaths}
      testimonials={page.testimonials}
      guideIds={guideIds}
      sectionTexts={version.sectionTexts}
      textLocale={version.locale}
      locale={locale}
    />
  );
}
