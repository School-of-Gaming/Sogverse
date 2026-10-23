import type {
  LandingPageDraft,
  LandingPageDraftVersion,
  LandingPicture,
  LocalizedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingCopyPicture, landingLeadPicture } from "./landing-section-seo";

/** What a share card is read from: one version of a page, live or working. */
export type LandingShareCardSource = Pick<
  LocalizedLandingPage,
  | "title"
  | "sections"
  | "sectionTexts"
  | "pictures"
  | "shareImageId"
  | "shareTitle"
  | "shareImageAlt"
>;

/**
 * The picture a share card shows: the version's own share picture, the
 * hero's, or none, when the card is the site-wide one. A picture carries its stored
 * path and purpose — always the wide one, which the database keeps true for
 * both — and its alt text in the version's language.
 */
export type LandingSharePicture =
  | ({ source: "custom"; alt: string } & LandingPicture)
  | ({ source: "hero"; alt: string } & LandingPicture)
  | { source: "site" };

export interface LandingShareCard {
  /** The card's title: the version's share title, else its page title. */
  title: string;
  titleSource: "custom" | "page";
  picture: LandingSharePicture;
}

/**
 * A page's share card in one version — what its Open Graph and Twitter
 * metadata carry, and what the status page and the MCP read say is in use.
 *
 * Each half is an override or derived from the page. **The title** is the
 * version's share title, else its page title. **The picture** is the
 * version's share picture with its share alt text, else the hero's picture
 * (`landingLeadPicture`) with the hero's alt text, else none, and the card is
 * the site-wide one. A picture's alt text falls back to the card's title.
 *
 * The description is always the summary, so it is no part of this.
 */
export function landingShareCard(page: LandingShareCardSource): LandingShareCard {
  const custom = page.shareTitle !== "";
  const title = custom ? page.shareTitle : page.title;
  return { title, titleSource: custom ? "custom" : "page", picture: sharePicture(page, title) };
}

function sharePicture(page: LandingShareCardSource, title: string): LandingSharePicture {
  if (page.shareImageId !== null) {
    return {
      source: "custom",
      ...landingCopyPicture(page.pictures, page.shareImageId),
      alt: page.shareImageAlt === "" ? title : page.shareImageAlt,
    };
  }
  const hero = landingLeadPicture(page);
  if (hero === null) return { source: "site" };
  return { source: "hero", path: hero.path, purpose: hero.purpose, alt: hero.alt ?? title };
}

/**
 * Whether two cards look the same where the page is shared: the same title,
 * the same picture (or both the site-wide card) and the same alt text. Where
 * each half comes from is not compared, so a share picture that is the hero's
 * own picture shares as the hero's does.
 */
export function sameSharedCard(a: LandingShareCard, b: LandingShareCard): boolean {
  if (a.title !== b.title) return false;
  if (a.picture.source === "site" || b.picture.source === "site") {
    return a.picture.source === b.picture.source;
  }
  return (
    a.picture.path === b.picture.path &&
    a.picture.purpose === b.picture.purpose &&
    a.picture.alt === b.picture.alt
  );
}

/** Which halves of a share card are the page's own overrides, as one name. */
export type LandingShareCardInUse =
  | "derived"
  | "customTitle"
  | "customPicture"
  | "customTitleAndPicture";

export function landingShareCardInUse({
  title,
  picture,
}: {
  /** Whether the title is a share title. */
  title: boolean;
  /** Whether the picture is a share picture. */
  picture: boolean;
}): LandingShareCardInUse {
  if (title && picture) return "customTitleAndPicture";
  if (title) return "customTitle";
  if (picture) return "customPicture";
  return "derived";
}

/**
 * The share card a working version would carry once published: the version's
 * words and share card read with the working copy's structure.
 */
export function draftShareCard(
  draft: Pick<LandingPageDraft, "sections" | "pictures">,
  version: Pick<
    LandingPageDraftVersion,
    "title" | "sectionTexts" | "shareTitle" | "shareImageId" | "shareImageAlt"
  >,
): LandingShareCard {
  return landingShareCard({
    title: version.title,
    sectionTexts: version.sectionTexts,
    shareTitle: version.shareTitle,
    shareImageId: version.shareImageId,
    shareImageAlt: version.shareImageAlt,
    sections: draft.sections,
    pictures: draft.pictures,
  });
}
