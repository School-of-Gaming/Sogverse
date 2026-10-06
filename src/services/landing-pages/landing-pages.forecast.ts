import type { SupportedLocale } from "@/lib/constants/locales";
import type { AdminLandingPage } from "./landing-pages.contracts";

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
      const from = publication?.versions.find((l) => l.locale === v.locale)?.slug;
      return from !== undefined && from !== v.slug
        ? [{ locale: v.locale, from, to: v.slug }]
        : [];
    }),
  };
}
