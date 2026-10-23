import {
  publishLandingPage,
  unpublishLandingPage,
} from "@/lib/indexnow/landing-pages";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod-v4";
import {
  describeMarkdownSubset,
  markdownOutsideSubset,
} from "@/lib/authored-markdown-subset";
import {
  landingPageSeo,
  renderedLandingSeo,
  type RenderedLandingSeo,
} from "@/components/landing-pages/landing-page-metadata";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { siteDocumentTitle } from "@/lib/metadata/site-title";
import {
  resolveRequiredTranslation,
  resolveTranslation,
} from "@/lib/i18n/resolve-translation";
import {
  describeMissingWords,
  landingSectionName,
} from "@/lib/landing-pages/describe-missing";
import {
  describeLandingPictureShape,
  landingPictureShapeOf,
} from "@/lib/landing-pages/picture-shapes";
import {
  LANDING_TESTIMONIAL_SLOTS,
  landingMarkdownValues,
  landingSections,
  type LandingSection,
  type LandingSectionOf,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  COVER_THUMBNAIL,
  answerWithCovers,
} from "@/lib/mcp/cover-images";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import {
  NOT_FOUND,
  adminLink,
  asLandingAdmin,
  issueSentence,
  pageId,
  previewLink,
  publicLink,
  readableInput,
  savedPage,
  slugLink,
} from "@/lib/mcp/landing-pages-call";
import {
  MCP_LANDING_SECTIONS,
  SECTIONS_MANUAL,
  STICKY_MANUAL,
  mcpLandingStructure,
  mcpSectionTexts,
  withIds,
} from "@/lib/mcp/landing-pages-sections";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import {
  draftShareCard,
  landingShareCardInUse,
  type LandingShareCardInUse,
} from "@/components/landing-pages/landing-share-card";
import {
  landingPublishForecast,
  landingPublishedCopy,
} from "@/services/landing-pages/landing-pages.forecast";
import type { LandingLinkRewrite } from "@/services/landing-pages/landing-pages.links";
import {
  LANDING_SHARE_TITLE_MAX_LENGTH,
  LANDING_SLUG_MAX_LENGTH,
  LANDING_SUMMARY_MAX_LENGTH,
  LANDING_TITLE_MAX_LENGTH,
  landingSlug,
  type AdminLandingPage,
  type PublishedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
import type { LandingPickReason } from "@/services/landing-pages/landing-pages.product-picks";
import { landingTestimonialsSections } from "@/services/landing-pages/landing-pages.testimonials";

/*
 * The landing page tools: an admin authors, publishes and unpublishes the
 * marketing landing pages from an AI app, the only place they are written.
 * Every tool runs the landing page service on the admin's own token-bound
 * client, so the admin-guarded functions decide exactly as they do for the
 * admin in Sogverse, and a save is stamped with the admin and the app it came
 * through. Writes go through the two partial writers — the structure alone,
 * or one language's words alone — never the whole save
 * (`src/services/landing-pages/CLAUDE.md`).
 *
 * The picture tools are in `landing-pages-images.ts`; the sections as an AI
 * app writes them in `landing-pages-sections.ts`.
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

const LANGUAGES = SUPPORTED_LOCALES.map(
  (locale) => `${locale} (${LOCALE_CONFIG[locale].label})`,
).join(", ");

const MODEL =
  "A landing page is a marketing page on the public site — for a school, a city, a business, an event — written to be found by search engines and AI apps. Its structure (the ordered sections with their pictures, buttons, icons and items) is shared by every language; each language version holds the page's title, summary, slug and every section's words, keyed by section id.";

const DISTINCT =
  "Each page must carry genuinely distinct, substantive content for its own audience — what is true and specific about that school, place, organisation or event — and never be another page with the place or audience name swapped. Search engines treat many near-identical pages aimed at different places or audiences, all leading to the same destination, as doorway pages, which can hurt the whole site's ranking; if a new page would differ from an existing one only in its names, improve the existing page instead.";

const COMPLETE =
  "A language version is complete when its title, summary and slug are written and every section has every required word in that language.";

const PUBLISHING =
  "Publishing puts the structure and every complete version live at once, leaves an incomplete version out (taking that language down if it was live), and is refused when no version is complete. Saving never changes what readers see until the next publish; a section added to a live page makes every language incomplete until its words are written there.";

const SLUGS = `A version's slug is its address: lowercase a–z, digits and single hyphens, at most ${LANDING_SLUG_MAX_LENGTH} characters, never shaped like an id, unique per language across every page. Left out, a version keeps the slug it has, or one is derived from its title when it has none. A slug can be changed at any time, a live language's included: readers keep the old address until the next publish moves the language to the new one, and nothing redirects from the old. Before a publish that changes a live language's address, confirm the change with the admin, because links shared outside the site to the old address stop working.`;

const ADDRESSES =
  "A live language is read at its slug address, /<language>/discover/<slug> with the discover segment in that language; the id address /<language>/discover/<id> works in every language, showing a reader the version in their language, else English, else the first written.";

const STRUCTURE_WRITES =
  "Removing a section drops its words in every language, and so does sending it without its id, which makes it a new section; the same holds for items. Keep every id you want to keep.";

const LINKS =
  "Write a link to a page of this site (a markdown link, or a button's internal path) without a language, e.g. /shop/<product id>: it is shown in the language of the page it is read on, so on a Finnish page /shop/<product id> opens /fi/kauppa/<product id>. A link written with a language or with translated segments (/fi/kauppa/<id>, /sv/butik/<id>), or as a full address on this site, is accepted and stored without its language (/shop/<id>), its query and #fragment kept. A link to a page whose address is a slug — a Library article, a team profile, a landing page — is stored at that page's id address, which works in every language, and only a slug a live page has is accepted. A link to a path no page of the site is served from is refused, and nothing is saved. Another site's address is stored as written. The answer lists in linkRewrites each link stored at another address than the one written, from → to; that is the save working, not a problem — tell the admin what changed only when it matters to them.";

const MARKDOWN = `Markdown fields take only their own subset: a text section's body ${describeMarkdownSubset("landing")}; an FAQ answer ${describeMarkdownSubset("landing-faq")}, with no headings, since the question is the answer's heading. Anything else is refused with the construct named, and nothing is saved. Every other field is plain text. ${LINKS}`;

const SEO = `Each language version carries seo: what the page will serve to search engines and link previews once a publish now puts it live, computed by the same code the public page runs — title (the browser tab and search result title, with the site's suffix: "${siteDocumentTitle("<title>")}"; titleLength counts it, and a search result cuts a title much past 60 characters short), description (the meta description: the summary), canonical (the page's canonical address), hreflang (each live language's address and x-default, the address a reader in any other language is sent to), and shareCard (the title, description, image URL and alt text a chat or feed shows where the page is shared). Where the card's title and picture come from is the version's own shareCard, beside seo. Check these instead of fetching the page. seo is null for a version a publish would leave out. Where the language is live and readers are served something else now, seo.liveDiffers names each such field with the value live now.`;

const OFFER_PREVIEW =
  "After creating a page, or after a large change, offer the admin the preview link.";

const NO_DELETE =
  "There is no delete: unpublishing takes a page down and keeps it to work on.";

const SHARE_CARD = `A page's share card — the link preview shown wherever its address is shared, in a chat or a feed — is derived from the page, per language: that language's title and summary, and the hero's picture (the site-wide card when the hero has none). Each language may override part of its own card, written with that language's words: a share title (shareTitle, at most ${LANDING_SHARE_TITLE_MAX_LENGTH} characters), a share picture (shareImageId, the catalogue id of a wide 16:9 picture from list_landing_images — a share picture is wide only, like a hero's, because the link preview is drawn wide, so a square or portrait one is refused) and the share picture's alt text (shareImageAlt). The picture is per language because a share picture often carries words of its own, which must be in that language; give each language its own picture, or the same one where it has no words. The summary is always the card's description. An override does not follow later edits to the page: a share title stays as written when the page title changes, and a share picture stays when the hero's picture changes. So set one only when the shared line is meant to differ from the search title, or the shared picture from the hero's, and clear it when it no longer applies. A partner's logo (Roblox's, Lynx's) in a share picture is a new placement of their mark, which needs that partner's sign-off first, as in a hero. get_landing_page says which card each language uses (shareCard).`;

/** How a one-language write treats the share card, the one part it does not write whole. */
const SHARE_CARD_KEPT =
  "The share card fields are the exception to writing the language whole: each one is changed only when sent. Leave shareTitle, shareImageId or shareImageAlt out to keep what the language has; send shareImageId as null, or shareTitle or shareImageAlt as an empty string, to clear it back to the derived card.";

const CLONE_REWRITE =
  "A clone is a starting structure, not a page to publish: before it is published, every word of every language must be rewritten for the new page's own audience. Near-identical pages that only swap a city or an audience are what search engines penalise as doorway pages, and the penalty can reach the page the clone was made from. Rename each language's title, which carries a copy marker in that language, and give it a slug of its own; remove the languages the new page does not need with remove_landing_page_language. Each language's share card — its share title, share picture and alt text, when it has them — is copied unchanged too and shows only in link previews, never on the page, so remind the admin to review each language's share card (shareCard in the answer) before publishing.";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const locale = z
  .enum(SUPPORTED_LOCALES)
  .describe(`The language version, by site locale: ${LANGUAGES}.`);

const title = z
  .string()
  .trim()
  .min(1, "Every language version needs a title")
  .max(LANDING_TITLE_MAX_LENGTH, `A title is at most ${LANDING_TITLE_MAX_LENGTH} characters`)
  .describe(
    `The page's title in this language: its browser tab and search result title. At most ${LANDING_TITLE_MAX_LENGTH} characters.`,
  );

const summary = z
  .string()
  .trim()
  .max(
    LANDING_SUMMARY_MAX_LENGTH,
    `A summary is at most ${LANDING_SUMMARY_MAX_LENGTH} characters`,
  )
  .describe(
    `A sentence or two saying what the page offers, at most ${LANDING_SUMMARY_MAX_LENGTH} characters. It is how the page is found: the description under its search result, its line in the site's llms.txt for AI apps, and the text on its link card when shared. Write it as that snippet, for someone who has not seen the page: who it is for, what it offers and, where it matters, where — never a repeat of the title or a teaser.`,
  );

/** A slug, by the service's own rule. */
const slug = z
  .string()
  .trim()
  .superRefine((value, context) => {
    const checked = landingSlug.safeParse(value);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        context.addIssue({ code: "custom", message: issue.message });
      }
    }
  })
  .describe(`The version's address. ${SLUGS}`);

const shareTitle = z
  .string()
  .trim()
  .max(
    LANDING_SHARE_TITLE_MAX_LENGTH,
    `A share title is at most ${LANDING_SHARE_TITLE_MAX_LENGTH} characters`,
  )
  .describe(
    `The share card's title in this language, in place of the page title, at most ${LANDING_SHARE_TITLE_MAX_LENGTH} characters. Optional; an empty string means none, and the card takes the page title. It does not follow later changes to the title.`,
  );

const shareImageAlt = z
  .string()
  .trim()
  .describe(
    "The share picture's alt text in this language. Optional; an empty string means none, and the card's title stands in for it. Only read while the language has a share picture.",
  );

/*
 * Ids are stored lowercase, and compared with `===`: an id an AI app sends in
 * capitals is lowercased first, as the registry's `landingId` does.
 */
const shareImageId = z
  .guid()
  .toLowerCase()
  .nullable()
  .describe(
    "The share picture in this language: the catalogue id of a wide 16:9 landing page picture from list_landing_images (a square or portrait one is refused), shown on this language's link preview in place of the hero's picture. Optional; null means none, and the preview takes the hero's picture. It does not follow later changes to the hero's picture.",
  );

/**
 * A language's words as the call is checked: any object keyed by section id.
 * The JSON Schema the AI app is shown is `mcpSectionTexts`; each section's
 * words are then checked by the tool against that section's own type
 * (`readWords`), which names a problem far better than a check against every
 * type at once could.
 */
const wordsByHand = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Checking an AI app's input against the page
// ---------------------------------------------------------------------------

/**
 * The structure an AI app sent, with new sections and items given ids and
 * checked by the registry's own schema — arrangement rule included — or the
 * refusal naming what is wrong.
 */
function readStructure(
  sections: readonly unknown[],
): { sections: LandingSection[] } | { refusal: CallToolResult } {
  const parsed = landingSections.safeParse(withIds(sections, () => crypto.randomUUID()));
  if (parsed.success) return { sections: parsed.data };
  const named = sections.map((section) =>
    typeof section === "object" && section !== null ? section : {},
  );
  const problems = parsed.error.issues.map((issue) =>
    issueSentence({ path: ["sections", ...issue.path], message: issue.message }, named),
  );
  return {
    refusal: refusal(
      `Nothing was saved: the structure is not one a page can have. ${problems.join(". ")}.`,
    ),
  };
}

/** The keys one section's words may hold items under, and the ids they may be. */
function itemIdsOf<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionOf<Type>,
) {
  return MCP_LANDING_SECTIONS[type].itemIds(section);
}

/**
 * One section's words checked by its type's schema — fields, item keys and
 * markdown — as the words to save, or the problems, each a sentence naming
 * the section as every answer does.
 */
function readSectionWords(
  sections: readonly LandingSection[],
  section: LandingSection,
  words: unknown,
): { words: unknown } | { problems: string[] } {
  const items = itemIdsOf(section.type, section);
  // An item named by its id is said by its number, as the structure counts it.
  const numbered = (path: readonly PropertyKey[]): PropertyKey[] => {
    const [key, id, ...rest] = path;
    const index = typeof id === "string" ? (items?.ids.indexOf(id) ?? -1) : -1;
    return key === items?.key && index !== -1 ? [key, index, ...rest] : [...path];
  };
  const at = (path: readonly PropertyKey[], message: string) =>
    issueSentence({ path: ["sectionTexts", section.id, ...numbered(path)], message }, sections);
  const parsed = MCP_LANDING_SECTIONS[section.type].text.safeParse(words);
  if (!parsed.success) {
    return { problems: parsed.error.issues.map((issue) => at(issue.path, issue.message)) };
  }
  const problems: string[] = [];
  if (items !== null) {
    const keyed: unknown = Object.getOwnPropertyDescriptor(parsed.data, items.key)?.value;
    for (const key of Object.keys(typeof keyed === "object" && keyed !== null ? keyed : {})) {
      if (!items.ids.includes(key)) {
        problems.push(
          at([items.key], `${key} is not the id of one of the section's ${items.key === "alts" ? "pictures" : "items"}`),
        );
      }
    }
  }
  for (const { path, value, useCase } of landingMarkdownValues(section.type, parsed.data)) {
    const outside = markdownOutsideSubset(value, useCase);
    if (outside.length === 0) continue;
    const named = outside
      .map(({ construct, lines }) =>
        lines.length === 0 ? construct : `${construct} on line ${lines.join(", ")}`,
      )
      .join("; ");
    problems.push(at(path.split("."), `uses markdown this field does not show — ${named}`));
  }
  return problems.length === 0 ? { words: parsed.data } : { problems };
}

/**
 * One language's words checked against the page's structure — every key a
 * section, every entry its type's fields, item keys its items, markdown
 * inside the subset — as the words to save, or the refusal naming each
 * problem.
 */
function readWords(
  sections: readonly LandingSection[],
  texts: Record<string, unknown>,
): { texts: Record<string, unknown> } | { refusal: CallToolResult } {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const checked: Record<string, unknown> = {};
  const problems: string[] = [];
  let unknownSection = false;
  for (const [id, words] of Object.entries(texts)) {
    const section = byId.get(id.trim().toLowerCase());
    if (section === undefined) {
      unknownSection = true;
      problems.push(
        `Words were sent for a section this page's structure does not have (id ${id})`,
      );
      continue;
    }
    const read = readSectionWords(sections, section, words);
    if ("problems" in read) problems.push(...read.problems);
    else checked[section.id] = read.words;
  }
  if (problems.length === 0) return { texts: checked };
  const advice = unknownSection
    ? "Read get_landing_page for the page's current section ids, and key the words by them."
    : "get_landing_page lists the page's section and item ids.";
  return {
    refusal: refusal(`Nothing was saved. ${problems.join(". ")}. ${advice}`),
  };
}

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

type DraftVersion = AdminLandingPage["draft"]["versions"][number];

/**
 * What a version still needs, each path with its description in an admin's
 * terms (section and item numbers from one, the section's type by name).
 */
function missingWords(page: AdminLandingPage, version: DraftVersion) {
  return version.missing.map((path) => describeMissingWords(path, page.draft.sections));
}

/**
 * What a publish would do now (`landingPublishForecast`), with each language
 * it would leave out carrying what it still needs, and each live address it
 * would change carrying both links, the one that stops working and its
 * replacement.
 */
function publishForecast(page: AdminLandingPage, origin: string) {
  const forecast = landingPublishForecast(page);
  return {
    ...forecast,
    wouldLeaveOut: page.draft.versions
      .filter((v) => forecast.wouldLeaveOut.includes(v.locale))
      .map((v) => ({ locale: v.locale, missing: missingWords(page, v) })),
    slugsChanging: forecast.slugsChanging.map((change) => ({
      ...change,
      fromAddress: slugLink(origin, change.from, change.locale),
      toAddress: slugLink(origin, change.to, change.locale),
    })),
  };
}

/**
 * What one version would serve once a publish now puts it live, and where it
 * is live and served otherwise now, each field that differs with its live
 * value. Both sides are the public page's own metadata (`landingPageSeo`),
 * run over the copy a publish would leave and over the live one.
 */
type VersionSeo = RenderedLandingSeo & { liveDiffers?: Record<string, unknown> };

/** The fields a reader of the served page meets, flattened one level: `shareCard.title`. */
function seoFields(seo: RenderedLandingSeo): Record<string, unknown> {
  const { title, description, canonical, hreflang, shareCard } = seo;
  return {
    title,
    description,
    canonical,
    hreflang,
    ...Object.fromEntries(
      Object.entries(shareCard).map(([field, value]) => [`shareCard.${field}`, value]),
    ),
  };
}

async function servedAt(
  copy: PublishedLandingPage | null,
  locale: SupportedLocale,
  siteUrl: string,
): Promise<RenderedLandingSeo | null> {
  if (copy === null) return null;
  const seo = await landingPageSeo(copy, locale);
  return seo === null ? null : renderedLandingSeo(seo, siteUrl);
}

/** Each written version's `seo`, by locale: null for one a publish would leave out. */
async function versionsSeo(
  page: AdminLandingPage,
  siteUrl: string,
): Promise<Map<SupportedLocale, VersionSeo | null>> {
  const next = landingPublishedCopy(page);
  const entries = await Promise.all(
    page.draft.versions.map(async (version): Promise<[SupportedLocale, VersionSeo | null]> => {
      if (version.missing.length > 0) return [version.locale, null];
      const served = await servedAt(next, version.locale, siteUrl);
      if (served === null) return [version.locale, null];
      // exact-locale: what this language's own live version serves
      const isLive = page.publication?.versions.some((v) => v.locale === version.locale) ?? false;
      const live = isLive ? await servedAt(page.publication, version.locale, siteUrl) : null;
      if (live === null) return [version.locale, served];
      const liveFields = seoFields(live);
      const differs = Object.entries(seoFields(served)).filter(
        ([field, value]) => JSON.stringify(value) !== JSON.stringify(liveFields[field]),
      );
      return [
        version.locale,
        differs.length === 0
          ? served
          : {
              ...served,
              liveDiffers: Object.fromEntries(
                differs.map(([field]) => [field, liveFields[field]]),
              ),
            },
      ];
    }),
  );
  return new Map(entries);
}

/** A write's link rewrites, as its answer carries them: only when there are some. */
function rewritten(linkRewrites: readonly LandingLinkRewrite[]) {
  return linkRewrites.length === 0 ? {} : { linkRewrites };
}

/**
 * The share card a version uses (`landingShareCard`): which halves are the
 * language's own overrides, the card's title, and its picture with where it
 * comes from — so an AI app can see an override the page has since moved
 * away from.
 */
const SHARE_CARD_IN_USE: Readonly<Record<LandingShareCardInUse, string>> = {
  derived: "derived from the page",
  customTitle: "custom title",
  customPicture: "custom picture",
  customTitleAndPicture: "custom title and picture",
};

function shareCardView(page: AdminLandingPage, version: DraftVersion) {
  const card = draftShareCard(page.draft, version);
  return {
    inUse:
      SHARE_CARD_IN_USE[
        landingShareCardInUse({
          title: card.titleSource === "custom",
          picture: card.picture.source === "custom",
        })
      ],
    title: card.title,
    titleFrom: card.titleSource === "custom" ? "shareTitle" : "the page title",
    picture:
      card.picture.source === "site"
        ? { from: "the site-wide card, because the hero has no picture" }
        : {
            from: card.picture.source === "custom" ? "shareImageId" : "the hero's picture",
            publicUrl: catalogueImageUrl(card.picture.purpose, card.picture.path),
            alt: card.picture.alt,
          },
    description: "the summary",
  };
}

/** The longest excerpt of a quote an answer carries, in characters. */
const EXCERPT_LENGTH = 80;

function excerpt(quote: string): string {
  return quote.length <= EXCERPT_LENGTH ? quote : `${quote.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

/**
 * Each testimonials section of the working copy — which the next publish
 * puts live — with its arrangement and each testimonial it places in reading
 * order: its id, and whom it is from and the start of its quote in English,
 * else the first language written, so the AI app can tell them apart.
 * get_testimonial reads one whole.
 */
function placedTestimonials(page: AdminLandingPage) {
  return landingTestimonialsSections(page.draft.sections, page.testimonials).map((section) => ({
    section: landingSectionName(section.sectionNumber, "testimonials"),
    sectionId: section.sectionId,
    arrangement: section.arrangement,
    slots: LANDING_TESTIMONIAL_SLOTS[section.arrangement],
    testimonials: section.testimonials.map(({ testimonialId, versions }) => {
      const version = resolveTranslation(versions, "en");
      return {
        testimonialId,
        from: version?.from ?? null,
        excerpt: version === null ? null : excerpt(version.quote),
        languages: versions.map((v) => v.locale),
      };
    }),
  }));
}

/** Why a picked product is not shown, as the AI app reads it. */
const PICK_REASON_WORDS: { readonly [Reason in LandingPickReason]: string } = {
  gone: "no product has this id any more",
  notListed: "it is unlisted",
  ended: "its term has ended",
};

/**
 * Each products section's picks: shown now or not, and every reason a hidden
 * one is not — read from the working copy, which the next publish puts live.
 */
function productPicks(page: AdminLandingPage) {
  return page.productPicks.map((section) => ({
    section: landingSectionName(section.sectionNumber, "products"),
    sectionId: section.sectionId,
    shown: section.shownCount,
    picked: section.picks.length,
    drawn: section.shownCount > 0,
    picks: section.picks.map((pick) => ({
      productId: pick.productId,
      names: pick.names,
      shown: pick.shown,
      notShownBecause: pick.reasons.map((reason) => PICK_REASON_WORDS[reason]),
    })),
  }));
}

function lastSaved(draft: AdminLandingPage["draft"]) {
  return { at: draft.updatedAt, by: draft.lastSavedBy, via: draft.lastSavedVia };
}

async function pageView(page: AdminLandingPage, origin: string) {
  const { draft, publication } = page;
  const liveLocales = new Set(publication?.versions.map((v) => v.locale) ?? []);
  // The served page's addresses are on its `metadataBase`, the site's own origin.
  const seo = await versionsSeo(page, process.env.NEXT_PUBLIC_SITE_URL ?? origin);
  return {
    pageId: draft.id,
    sections: draft.sections,
    pictures: Object.entries(draft.pictures).map(([catalogueId, { path, purpose }]) => ({
      catalogueId,
      shape: describeLandingPictureShape(landingPictureShapeOf(purpose)),
      publicUrl: catalogueImageUrl(purpose, path),
    })),
    createdAt: draft.createdAt,
    lastSaved: lastSaved(draft),
    versions: draft.versions.map((version) => ({
      locale: version.locale,
      language: LOCALE_CONFIG[version.locale].label,
      title: version.title,
      summary: version.summary,
      slug: version.slug,
      address: slugLink(origin, version.slug, version.locale),
      sectionTexts: version.sectionTexts,
      shareTitle: version.shareTitle,
      shareImageId: version.shareImageId,
      shareImageAlt: version.shareImageAlt,
      shareCard: shareCardView(page, version),
      complete: version.missing.length === 0,
      missing: missingWords(page, version),
      live: liveLocales.has(version.locale),
      previewLink: previewLink(origin, draft.id, version.locale),
      // exact-locale: each version carries what its own language would serve
      seo: seo.get(version.locale) ?? null,
    })),
    hasUnpublishedChanges: page.hasUnpublishedChanges,
    testimonials: placedTestimonials(page),
    productPicks: productPicks(page),
    publish: publishForecast(page, origin),
    live:
      publication === null
        ? null
        : {
            firstPublishedAt: publication.firstPublishedAt,
            publishedAt: publication.publishedAt,
            versions: publication.versions.map((version) => ({
              locale: version.locale,
              title: version.title,
              summary: version.summary,
              publicLink: publicLink(origin, publication, version.locale),
            })),
          },
    adminLink: adminLink(origin, draft.id),
  };
}

/**
 * Each locale's own word for a copy, from its message file: a clone's title
 * is marked in the language it is written in, since each title derives that
 * language's slug.
 */
async function copyMarker(locale: SupportedLocale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "admin.landingPages" });
  return t("copyMarker");
}

/** Each language's completeness, after a write. */
function languages(page: AdminLandingPage) {
  return page.draft.versions.map((version) => ({
    locale: version.locale,
    complete: version.missing.length === 0,
    missing: missingWords(page, version),
  }));
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function registerLandingPageTools(server: McpServer): void {
  server.registerTool(
    "list_landing_pages",
    {
      title: "List landing pages",
      description: `Every School of Gaming landing page, most recently saved first: its id, each language's title, slug and whether it is complete, whether it is live, whether it has saved changes readers do not see yet, and when, by whom and through which AI app it was last saved. get_landing_page reads one whole. ${MODEL}`,
      annotations: READ_ONLY,
    },
    (ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const pages = await service.listAdminPages();
        return answer({
          pages: pages.map((page) => ({
            pageId: page.id,
            versions: page.versions.map((version) => ({
              locale: version.locale,
              title: version.title,
              slug: version.slug,
              complete: version.isComplete,
            })),
            live: page.isPublished,
            hasUnpublishedChanges: page.hasUnpublishedChanges,
            lastSaved: {
              at: page.updatedAt,
              by: page.lastSavedBy,
              via: page.lastSavedVia,
            },
          })),
        });
      }),
  );

  server.registerTool(
    "get_landing_page",
    {
      title: "Read a landing page",
      description: `One landing page whole: its structure (every section with its id, type and shared fields, each sticky section with its side in sticky), its pictures with their shapes, shown small, and every language version — title, summary, slug, its address, every section's words, whether it is complete and what it still needs (each as a path, sections.<section id>.<field>, and as a sentence numbering sections and items from one), and the share card it uses (shareCard: derived from the page, or a custom title and/or picture, with the title and picture in use) — with what a publish now would put live, leave out and take down, and the live addresses it would change (publish.slugsChanging: each language live now whose saved slug differs from its live one, with the old slug and address, which stop working at the publish, and the new); each testimonials section's arrangement and the testimonials it places, with each one's id, whom it is from and an excerpt (testimonials); for each products section, its picked products under productPicks — whether readers are shown each one now, and why not (its term ended, it is unlisted) — with drawn false when none is shown, in which case readers see no trace of the section; what readers see now, with each live language's public link; a preview link per language; and adminLink, the page's status page in Sogverse admin, where the admin sees each language's state, opens its preview and live links, and publishes or unpublishes. Landing pages are written only through these tools. ${SEO} ${COMPLETE} ${PUBLISHING} ${SHARE_CARD} ${STICKY_MANUAL}`,
      inputSchema: readableInput(z.object({ pageId }), z.object({ pageId })),
      annotations: READ_ONLY,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const page = await service.getAdminPage(id);
        if (page === null) return refusal(NOT_FOUND);
        const view = await pageView(page, origin);
        return answerWithCovers(
          view,
          Object.entries(page.draft.pictures).map(([catalogueId, { path, purpose }]) => ({
            path,
            purpose,
            caption: `Picture ${catalogueId} (${describeLandingPictureShape(landingPictureShapeOf(purpose))}): ${catalogueImageUrl(purpose, path)}`,
          })),
          COVER_THUMBNAIL,
        );
      }),
  );

  server.registerTool(
    "get_landing_page_preview_link",
    {
      title: "Preview a landing page",
      description:
        `A link the admin opens in their browser, signed in to Sogverse as an admin, to see the page's saved working copy as a reader would meet it if it were published now, in one language. Use it when the admin wants to see the page — after a round of edits, or before publishing — and offer it when seeing the page would help them judge it; there is no need to hand one over after every save. ${OFFER_PREVIEW} Without a version in that language the preview shows the one a reader there would get: theirs, else English, else the first written. Only admins can open it.`,
      inputSchema: readableInput(z.object({ pageId, locale }), z.object({ pageId, locale })),
      annotations: READ_ONLY,
    },
    ({ pageId: id, locale: at }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const page = await service.getAdminPage(id);
        if (page === null) return refusal(NOT_FOUND);
        const shown = resolveRequiredTranslation(page.draft.versions, at);
        return answer({
          pageId: id,
          locale: at,
          shows: shown.locale,
          previewLink: previewLink(origin, id, at),
        });
      }),
  );

  server.registerTool(
    "create_landing_page",
    {
      title: "Create a landing page",
      description: `Start a new landing page with its structure and one language version; add the other languages one at a time with save_landing_page_text. It is created unpublished. Sections and items sent without ids are given them, and the answer lists the structure with every id. To write the sections' words in this same call, give the sections and items ids of your own (any lowercase uuid) and key sectionTexts by them; otherwise write the words afterwards with save_landing_page_text. The answer says the address the page will have once published, what the language still needs, a preview link in that language (previewLink), and the page's status page in Sogverse admin (adminLink). ${OFFER_PREVIEW} ${MODEL} ${DISTINCT} ${COMPLETE} ${SLUGS} ${MARKDOWN} ${SHARE_CARD}

${SECTIONS_MANUAL}`,
      inputSchema: readableInput(
        z.object({
          locale,
          title,
          summary: summary.optional(),
          slug: slug.optional(),
          sections: mcpLandingStructure,
          sectionTexts: mcpSectionTexts.optional(),
          shareTitle: shareTitle.optional(),
          shareImageId: shareImageId.optional(),
          shareImageAlt: shareImageAlt.optional(),
        }),
        z.object({
          locale,
          title,
          summary: summary.optional(),
          slug: slug.optional(),
          sections: mcpLandingStructure,
          sectionTexts: wordsByHand.optional(),
          shareTitle: shareTitle.optional(),
          shareImageId: shareImageId.optional(),
          shareImageAlt: shareImageAlt.optional(),
        }),
      ),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const structure = readStructure(input.sections);
        if ("refusal" in structure) return structure.refusal;
        const words = readWords(structure.sections, input.sectionTexts ?? {});
        if ("refusal" in words) return words.refusal;
        const { id, linkRewrites } = await service.createPage({
          sections: structure.sections,
          versions: [
            {
              locale: input.locale,
              title: input.title,
              summary: input.summary ?? "",
              slug: input.slug,
              sectionTexts: words.texts,
              shareTitle: input.shareTitle ?? "",
              shareImageId: input.shareImageId ?? null,
              shareImageAlt: input.shareImageAlt ?? "",
            },
          ],
        });
        const page = await savedPage(service, id);
        // exact-locale: the tool reads the version it was asked for
        const version = page.draft.versions.find((v) => v.locale === input.locale);
        return answer({
          pageId: id,
          sections: page.draft.sections,
          locale: input.locale,
          slug: version?.slug ?? "",
          address: slugLink(origin, version?.slug ?? "", input.locale),
          complete: version !== undefined && version.missing.length === 0,
          missing: version === undefined ? [] : missingWords(page, version),
          shareCard: version === undefined ? null : shareCardView(page, version),
          productPicks: productPicks(page),
          previewLink: previewLink(origin, id, input.locale),
          adminLink: adminLink(origin, id),
          ...rewritten(linkRewrites),
        });
      }),
  );

  server.registerTool(
    "clone_landing_page",
    {
      title: "Clone a landing page",
      description: `Start a new landing page as a copy of an existing one's saved working copy, made in one step on the server: its structure with every picture, and every language version's summary, words and share card (share title, share picture and alt text), are copied as they are, while every section and item gets a new id (the words stay with their sections and items). Each language's title is the source's followed by a copy marker in that language, and its slug is derived from that new title, numbered (-2, -3, …) when another page already has it in that language. The clone is created unpublished, and the source is not changed. The answer gives the new page's id, each language's title, slug, address once published, completeness, share card (shareCard) and preview link (previewLink), and the new page's status page in Sogverse admin (adminLink). ${CLONE_REWRITE} ${SLUGS}`,
      inputSchema: readableInput(z.object({ pageId }), z.object({ pageId })),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const source = await service.getAdminPage(id);
        if (source === null) return refusal(NOT_FOUND);
        const cloneId = await service.clonePage(source.draft, copyMarker);
        const page = await savedPage(service, cloneId);
        return answer({
          pageId: cloneId,
          clonedFrom: id,
          live: false,
          versions: page.draft.versions.map((version) => ({
            locale: version.locale,
            title: version.title,
            slug: version.slug,
            address: slugLink(origin, version.slug, version.locale),
            complete: version.missing.length === 0,
            missing: missingWords(page, version),
            shareCard: shareCardView(page, version),
            previewLink: previewLink(origin, cloneId, version.locale),
          })),
          adminLink: adminLink(origin, cloneId),
        });
      }),
  );

  server.registerTool(
    "save_landing_page_structure",
    {
      title: "Save a landing page's structure",
      description: `Replace the page's structure — its ordered sections and their shared fields — for every language at once. No language's words are written, except that ${STRUCTURE_WRITES.charAt(0).toLowerCase()}${STRUCTURE_WRITES.slice(1)} Send the whole structure, read from get_landing_page: what is left out is removed. The answer lists the saved structure with every id, the sections removed, each language's completeness under the new structure, and each testimonials section's testimonials (testimonials), and each products section's picks, shown or not and why (productPicks). Readers see nothing until the next publish. ${PUBLISHING} ${LINKS}\n\n${SECTIONS_MANUAL}`,
      inputSchema: readableInput(
        z.object({ pageId, sections: mcpLandingStructure }),
        z.object({ pageId, sections: mcpLandingStructure }),
      ),
      annotations: OVERWRITES,
    },
    ({ pageId: id, sections }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        const structure = readStructure(sections);
        if ("refusal" in structure) return structure.refusal;
        const { linkRewrites } = await service.saveStructure(id, structure.sections);
        const after = await savedPage(service, id);
        const kept = new Set(after.draft.sections.map((section) => section.id));
        return answer({
          pageId: id,
          sections: after.draft.sections,
          removedSections: before.draft.sections
            .filter((section) => !kept.has(section.id))
            .map((section) => ({ id: section.id, type: section.type })),
          languages: languages(after),
          testimonials: placedTestimonials(after),
          productPicks: productPicks(after),
          hasUnpublishedChanges: after.hasUnpublishedChanges,
          publish: publishForecast(after, origin),
          ...rewritten(linkRewrites),
        });
      }),
  );

  server.registerTool(
    "save_landing_page_text",
    {
      title: "Save a landing page's language version",
      description: `Write one language version of the page — its title, summary, optional slug and every section's words — replacing what that language held, or add a language it does not have yet. No other language, nor the structure, is touched. sectionTexts is the whole of this language's words: a section left out is saved with no words in this language. The words are checked against the page's structure as it is now. Readers see nothing until the next publish; leaving a live language incomplete means the next publish takes it down. ${SHARE_CARD_KEPT} ${DISTINCT} ${SLUGS} ${MARKDOWN} ${SHARE_CARD}`,
      inputSchema: readableInput(
        z.object({
          pageId,
          locale,
          title,
          summary,
          slug: slug.optional(),
          sectionTexts: mcpSectionTexts,
          shareTitle: shareTitle.optional(),
          shareImageId: shareImageId.optional(),
          shareImageAlt: shareImageAlt.optional(),
        }),
        z.object({
          pageId,
          locale,
          title,
          summary,
          slug: slug.optional(),
          sectionTexts: wordsByHand,
          shareTitle: shareTitle.optional(),
          shareImageId: shareImageId.optional(),
          shareImageAlt: shareImageAlt.optional(),
        }),
      ),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(input.pageId);
        if (before === null) return refusal(NOT_FOUND);
        const words = readWords(before.draft.sections, input.sectionTexts);
        if ("refusal" in words) return words.refusal;
        // The share card is kept where the call leaves it out, read from the
        // working copy just read; a new language has none to keep.
        // exact-locale: the tool writes the version it was asked for
        const current = before.draft.versions.find((v) => v.locale === input.locale);
        const { linkRewrites } = await service.saveVersion(input.pageId, {
          locale: input.locale,
          title: input.title,
          summary: input.summary,
          slug: input.slug,
          sectionTexts: words.texts,
          shareTitle: input.shareTitle ?? current?.shareTitle ?? "",
          shareImageId:
            input.shareImageId === undefined
              ? (current?.shareImageId ?? null)
              : input.shareImageId,
          shareImageAlt: input.shareImageAlt ?? current?.shareImageAlt ?? "",
        });
        const page = await savedPage(service, input.pageId);
        // exact-locale: the tool writes the version it was asked for
        const saved = page.draft.versions.find((v) => v.locale === input.locale);
        return answer({
          pageId: input.pageId,
          locale: input.locale,
          slug: saved?.slug ?? "",
          address: slugLink(origin, saved?.slug ?? "", input.locale),
          complete: saved !== undefined && saved.missing.length === 0,
          missing: saved === undefined ? [] : missingWords(page, saved),
          shareCard: saved === undefined ? null : shareCardView(page, saved),
          languageIsLive:
            // exact-locale: whether the named version is live
            page.publication?.versions.some((v) => v.locale === input.locale) ?? false,
          hasUnpublishedChanges: page.hasUnpublishedChanges,
          publish: publishForecast(page, origin),
          ...rewritten(linkRewrites),
        });
      }),
  );

  server.registerTool(
    "remove_landing_page_language",
    {
      title: "Remove a language from a landing page",
      description: `Remove one language version from the page's working copy: its title, summary, slug and every section's words in that language. No other language, nor the structure, is touched. If the language is live, readers keep seeing it until the next publish, which takes it down. It cannot be undone except by writing the language again with save_landing_page_text. A page keeps at least one language, so removing its last one is refused. Confirm with the admin before removing a language. The answer lists the languages left with their completeness, and what a publish now would do. ${PUBLISHING}`,
      inputSchema: readableInput(z.object({ pageId, locale }), z.object({ pageId, locale })),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ pageId: id, locale: removed }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        await service.removeVersion(id, removed);
        const page = await savedPage(service, id);
        return answer({
          pageId: id,
          removed,
          // exact-locale: whether the removed version is live
          languageIsLive: page.publication?.versions.some((v) => v.locale === removed) ?? false,
          languages: languages(page),
          hasUnpublishedChanges: page.hasUnpublishedChanges,
          publish: publishForecast(page, origin),
        });
      }),
  );

  server.registerTool(
    "publish_landing_page",
    {
      title: "Publish a landing page",
      description: `Make the page's saved working copy what readers see, replacing what was live. ${PUBLISHING} A publish moves a live language whose saved slug differs from its live one to the new address, and nothing redirects from the old, so links to it shared outside the site stop working. So read get_landing_page first: its publish.slugsChanging lists each live language whose address this publish would change, with the old address and the new. Before a publish that changes a live language's address, confirm it with the admin, because links shared outside the site to the old address stop working. Answers which languages went live, which were left out or taken down, the live addresses this publish changed, and each live language's public link. ${ADDRESSES}`,
      inputSchema: readableInput(z.object({ pageId }), z.object({ pageId })),
      annotations: OVERWRITES,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        const wasLive = before.publication?.versions.map((v) => v.locale) ?? [];
        await publishLandingPage(service, id);
        // Read back from what the publish did, never forecast from the read
        // before it: a save landing in between changes what goes live.
        const after = await savedPage(service, id);
        const { publication } = after;
        const liveLocales = publication?.versions.map((v) => v.locale) ?? [];
        return answer({
          pageId: id,
          live: liveLocales,
          leftOut: after.draft.versions
            .filter((v) => !liveLocales.includes(v.locale))
            .map((v) => ({ locale: v.locale, missing: missingWords(after, v) })),
          takenDown: wasLive.filter((l) => !liveLocales.includes(l)),
          slugsChanged: (publication?.versions ?? []).flatMap((v) => {
            // exact-locale: pairs each version with its own live slug
            const from = before.publication?.versions.find((b) => b.locale === v.locale)?.slug;
            return from !== undefined && from !== v.slug
              ? [{ locale: v.locale, from, to: v.slug }]
              : [];
          }),
          publicLinks: liveLocales.map((l) => ({
            locale: l,
            publicLink: publication === null ? null : publicLink(origin, publication, l),
          })),
        });
      }),
  );

  server.registerTool(
    "unpublish_landing_page",
    {
      title: "Unpublish a landing page",
      description: `Take the page off the site, every language at once. Its working copy is kept exactly as it was, slugs included, to edit and publish again. ${NO_DELETE} Unpublishing a page that is not live changes nothing.`,
      inputSchema: readableInput(z.object({ pageId }), z.object({ pageId })),
      annotations: OVERWRITES,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        await unpublishLandingPage(service, id);
        return answer({ pageId: id, wasLive: before.publication !== null, live: false });
      }),
  );
}

