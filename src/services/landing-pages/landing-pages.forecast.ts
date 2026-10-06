import type { SupportedLocale } from "@/lib/constants/locales";
import { defaultLandingSlug, type AdminLandingPage } from "./landing-pages.contracts";

/**
 * **What a publish would do now**, read from one admin read of the page: the
 * languages it would put live, the written ones it would leave out, the live
 * ones it would take down, and the slugs it would fix for good. The admin
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
   * Each language going live for the first time, with the slug that becomes
   * permanent, and whether that slug is the one derived from the title —
   * likely never chosen by anyone — rather than one written.
   */
  slugsBecomingPermanent: {
    locale: SupportedLocale;
    slug: string;
    derivedFromTitle: boolean;
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
    slugsBecomingPermanent: complete
      .filter((v) => !v.slugFixed)
      .map((v) => ({
        locale: v.locale,
        slug: v.slug,
        derivedFromTitle: v.slug === defaultLandingSlug(v.title),
      })),
  };
}
