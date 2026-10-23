import type {
  LandingPageDraft,
  LandingPageDraftVersion,
  LocalizedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingLeadPicture } from "./landing-section-seo";

/** What a share card is read from: one version of a page, live or working. */
export type LandingShareCardSource = Pick<
  LocalizedLandingPage,
  | "title"
  | "sections"
  | "sectionTexts"
  | "imagePaths"
  | "shareImageId"
  | "shareTitle"
  | "shareImageAlt"
>;

/**
 * The picture a share card shows: the version's own share picture, the
 * hero's, or none, when the card is the site-wide one. A picture carries its stored
 * path in the `landing-images` bucket and its alt text in the version's
 * language.
 */
export type LandingSharePicture =
  | { source: "custom"; path: string; alt: string }
  | { source: "hero"; path: string; alt: string }
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
 * the site-wide one. A picture's alt text falls back to the card's title. A
 * share picture whose path the copy does not carry is treated as none, as the
 * hero's is: the database derives the paths and unsets a removed picture, so
 * it should not arise, and the hero is the safe answer if it does.
 *
 * The description is always the summary, so it is no part of this.
 */
export function landingShareCard(page: LandingShareCardSource): LandingShareCard {
  const custom = page.shareTitle !== "";
  const title = custom ? page.shareTitle : page.title;
  return { title, titleSource: custom ? "custom" : "page", picture: sharePicture(page, title) };
}

function sharePicture(page: LandingShareCardSource, title: string): LandingSharePicture {
  if (page.shareImageId !== null && Object.hasOwn(page.imagePaths, page.shareImageId)) {
    return {
      source: "custom",
      path: page.imagePaths[page.shareImageId],
      alt: page.shareImageAlt === "" ? title : page.shareImageAlt,
    };
  }
  const hero = landingLeadPicture(page);
  if (hero === null) return { source: "site" };
  return { source: "hero", path: hero.path, alt: hero.alt ?? title };
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
  draft: Pick<LandingPageDraft, "sections" | "imagePaths">,
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
    imagePaths: draft.imagePaths,
  });
}
