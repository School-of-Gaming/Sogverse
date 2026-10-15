import "server-only";
import {
  landingPageLocales,
  landingPagePath,
  type AddressableLandingPage,
} from "@/components/landing-pages/landing-page-address";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
import type { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import { changeAndSubmit, changedUrls, type LiveAddress } from "./indexnow";

/**
 * A live page's addresses as a crawler should know them: its canonical in
 * each indexed language it is live in — the slug address there, exactly the
 * URLs the sitemap lists for it. None for a page that is not live.
 */
export function landingPageUrls(
  page: AddressableLandingPage | null,
  siteUrl: string,
): string[] {
  if (page === null) return [];
  return landingPageLocales(page).map(
    (locale) => `${siteUrl}${landingPagePath(page, locale)}`,
  );
}

/** The landing pages' index in every indexed locale. */
export function discoverIndexUrls(siteUrl: string): string[] {
  return INDEXED_LOCALES.map(
    (locale) => `${siteUrl}${getPathname({ href: ROUTES.discover, locale })}`,
  );
}

/**
 * What a change to one page's live copy tells IndexNow: every address it had
 * and has — a slug changed or a language taken down is an address that went
 * away, an unpublish is all of them — and the index that lists it. Slugs are
 * unique per locale, so no other page's address moves with it.
 */
export function landingPageChangeUrls(
  before: AddressableLandingPage | null,
  after: AddressableLandingPage | null,
  siteUrl: string,
): string[] {
  const owned = (page: AddressableLandingPage | null): LiveAddress[] =>
    landingPageUrls(page, siteUrl).map((url) => [url, page?.id ?? ""]);
  return changedUrls({
    beforeAll: owned(before),
    afterAll: owned(after),
    item: landingPageUrls(after, siteUrl),
    indexes: discoverIndexUrls(siteUrl),
  });
}

/**
 * **Publish a landing page, and tell search engines.** The one way a landing
 * page goes live, for the admin's route and the MCP tool alike: the service's
 * publish on the caller's own client, then the IndexNow submission, which
 * never fails the publish (`changeAndSubmit`).
 */
export function publishLandingPage(
  service: LandingPageService,
  id: string,
): Promise<void> {
  return changeLandingPage(service, id, "publish", () => service.publishPage(id));
}

/** **Unpublish a landing page, and tell search engines** — its addresses went away. */
export function unpublishLandingPage(
  service: LandingPageService,
  id: string,
): Promise<void> {
  return changeLandingPage(service, id, "unpublish", () => service.unpublishPage(id));
}

function changeLandingPage(
  service: LandingPageService,
  id: string,
  action: string,
  change: () => Promise<void>,
): Promise<void> {
  return changeAndSubmit({
    label: `landing page ${id} ${action}`,
    change,
    snapshot: () => service.getPublishedPage(id),
    urls: landingPageChangeUrls,
  });
}
