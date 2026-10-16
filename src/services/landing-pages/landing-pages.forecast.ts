import type { SupportedLocale } from "@/lib/constants/locales";
import type { AdminLandingPage, PublishedLandingPage } from "./landing-pages.contracts";

/**
 * **What a publish would do now**, read from one admin read of the page: the
 * languages it would put live, the written ones it would leave out, the live
 * ones it would take down, and the live addresses it would change. The admin
 * status page shows it before Publish is confirmed, and the MCP tools hand it
 * to an AI app before it publishes.
 *
 * The database decides completeness by the same rule, so this is a forecast of
 * its answer and never a gate: a save landing between the read and the
 * publish changes what goes live.
 *
 * Pure: no React and no client, so the admin UI and the MCP tools read it alike.
 */
export interface LandingPublishForecast {
  /** At least one language is complete. With none, the database refuses the publish. */
  canPublish: boolean;
  /** The complete languages, in locale order: every one goes live. */
  wouldPutLive: SupportedLocale[];
  /** Every written language that is not complete, live now or not. */
  wouldLeaveOut: SupportedLocale[];
  /** The live languages that are no longer complete, or no longer written. */
  wouldTakeDown: SupportedLocale[];
  /**
   * Each language live now that stays live, whose saved slug differs from its
   * live one: the publish moves it from `from` to `to`, and nothing redirects
   * from the old address, so links to it shared outside the site stop working.
   * A language going live for the first time has no entry.
   */
  slugsChanging: {
    locale: SupportedLocale;
    from: string;
    to: string;
  }[];
}

export function landingPublishForecast(
  page: Pick<AdminLandingPage, "draft" | "publication">,
): LandingPublishForecast {
  const { draft, publication } = page;
  const complete = draft.versions.filter((v) => v.missing.length === 0);
  const completeLocales = complete.map((v) => v.locale);
  const live = publication?.versions.map((v) => v.locale) ?? [];
  return {
    canPublish: complete.length > 0,
    wouldPutLive: completeLocales,
    wouldLeaveOut: draft.versions.filter((v) => v.missing.length > 0).map((v) => v.locale),
    wouldTakeDown: live.filter((locale) => !completeLocales.includes(locale)),
    slugsChanging: complete.flatMap((v) => {
      // exact-locale: pairs each version with its own live slug
      const from = publication?.versions.find((l) => l.locale === v.locale)?.slug;
      return from !== undefined && from !== v.slug
        ? [{ locale: v.locale, from, to: v.slug }]
        : [];
    }),
  };
}

/**
 * **The published copy a publish now would leave**, from the same read: the
 * working structure and pictures with the complete versions alone, or null
 * when none is complete and the publish would be refused. It is what the
 * public page's own builders — its metadata above all — are run over to say
 * what the next publish would serve.
 *
 * The two dates are stand-ins, since no publish has happened: the page's
 * first publish where it has one, and the last save. Nothing that reads the
 * copy for what it would serve reads either.
 */
export function landingPublishedCopy(
  page: Pick<AdminLandingPage, "draft" | "publication">,
): PublishedLandingPage | null {
  const { draft, publication } = page;
  const versions = draft.versions
    .filter((v) => v.missing.length === 0)
    .map(({ locale, title, summary, slug, sectionTexts }) => ({
      locale,
      title,
      summary,
      slug,
      sectionTexts,
    }));
  if (versions.length === 0) return null;
  return {
    id: draft.id,
    firstPublishedAt: publication?.firstPublishedAt ?? draft.updatedAt,
    publishedAt: draft.updatedAt,
    sections: draft.sections,
    imagePaths: draft.imagePaths,
    versions,
  };
}
