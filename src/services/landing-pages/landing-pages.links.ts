import { findArticleBySlug, type AddressableArticle } from "@/components/library/article-address";
import { findTeamMemberBySlug } from "@/components/team/team-address";
import { LOCALE_CONFIG, type SupportedLocale } from "@/lib/constants/locales";
import {
  LANDING_SECTIONS,
  type LandingSection,
  type LandingSectionText,
  type LandingSectionTexts,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  canonicalizeButtonTarget,
  type ButtonTarget,
  type ButtonTargetRefusal,
} from "@/lib/links/button-target";
import { canonicalizeMarkdownLinks } from "@/lib/links/markdown-links";
import type { SlugResolver } from "@/lib/links/own-site";
import type { PublicTeamProfile } from "@/services/team-profiles/team-profiles.types";
import type { ParsedLandingVersion } from "./landing-pages.contracts";

/**
 * What one landing page write carries that can hold a link: the structure
 * (button targets) when the write sets it, and the versions (the `landing`
 * markdown fields) it writes.
 */
export interface LandingWrite {
  sections: LandingSection[] | null;
  versions: ParsedLandingVersion[];
}

/**
 * Which text fields of each section type are authored markdown, and so can
 * hold links: a field of the section's words, or a field of each item's.
 * Exhaustive, so a type added to the registry fails type-check here until it
 * says; a unit test holds each entry equal to the fields the type's text
 * schema declares as markdown.
 */
export type LandingMarkdownField =
  | { readonly field: string }
  | { readonly items: string; readonly field: string };

export const LANDING_MARKDOWN_FIELDS = {
  hero: [],
  text: [{ field: "body" }],
  image: [],
  points: [],
  steps: [],
  faq: [{ items: "items", field: "answer" }],
  cta: [],
} as const satisfies Record<LandingSectionType, readonly LandingMarkdownField[]>;

/**
 * A write refused because of a link it carries. It is a `check_violation`
 * with an admin-facing sentence, the shape the database's own refusals take,
 * so `landingWriteFailure` quotes it to the editor and the MCP tools alike.
 */
export class LandingLinkRefusal extends Error {
  readonly code = "23514";

  constructor(message: string) {
    super(message);
    this.name = "LandingLinkRefusal";
  }
}

export interface LandingLinkOptions {
  /** Finds the page a per-language slug addresses (`siteSlugResolver`). */
  resolver: SlugResolver;
  /**
   * The structure the versions' words are keyed to: the write's own when it
   * sets one, else the page's current structure.
   */
  structure?: readonly LandingSection[];
  /** The site's own origin; without one only a relative address is own-site. */
  siteUrl?: string;
}

const BUTTON_REFUSAL: Record<ButtonTargetRefusal, string> = {
  dead: "which doesn't lead to a page on the site",
  "same-page": "which is a place on a page rather than a page, and a button needs a page's address",
  "not-web": "which is not a web address",
  unusable: "which is not an address a button can follow",
};

/**
 * Every landing page write passes through here, in the service, after its
 * input is parsed and before anything is sent to the database — so the editor
 * and the MCP tools are held to the same links.
 *
 * Every button target and every link in a `landing` markdown field is stored
 * canonical: an own-site address becomes its locale-less internal route path,
 * a page with per-language slugs is stored at its id address, and another
 * site's address is left as written. A button or a markdown link leading to
 * no page on the site refuses the whole write, with one sentence per link
 * naming where it is and what it says.
 */
export async function canonicaliseLandingLinks(
  write: LandingWrite,
  { resolver, structure = write.sections ?? [], siteUrl = process.env.NEXT_PUBLIC_SITE_URL }: LandingLinkOptions,
): Promise<LandingWrite> {
  const refusals: string[] = [];
  const position = new Map(structure.map((section, index) => [section.id, index]));
  const sectionName = (section: Pick<LandingSection, "id" | "type">, index?: number) =>
    `section ${(index ?? position.get(section.id) ?? 0) + 1} (${LANDING_SECTIONS[section.type].label})`;

  const sections =
    write.sections === null
      ? null
      : await Promise.all(
          write.sections.map(async (section, index) => {
            const button = buttonOf(section);
            if (button === undefined) return section;
            const result = await canonicalizeButtonTarget(button, resolver, siteUrl);
            if (!result.ok) {
              refusals.push(
                `The button in ${sectionName(section, index)} leads to ${hrefOf(button)}, ${BUTTON_REFUSAL[result.reason]}.`,
              );
              return section;
            }
            return withButton(section, result.target);
          }),
        );

  const versions = await Promise.all(
    write.versions.map(async (version) => {
      const sectionTexts: LandingSectionTexts = {};
      for (const section of structure) {
        const text: unknown = version.sectionTexts[section.id];
        if (text === undefined) continue;
        sectionTexts[section.id] = await canonicalText(section.type, text, async (markdown) => {
          const canonical = await canonicalizeMarkdownLinks(markdown, resolver, siteUrl);
          for (const dead of canonical.deadLinks) {
            refusals.push(
              `The link "${dead.text}" to ${dead.href}, in the ${languageName(version.locale)} words of ${sectionName(section)}, doesn't lead to a page on the site.`,
            );
          }
          return canonical.markdown;
        });
      }
      return { ...version, sectionTexts };
    }),
  );

  if (refusals.length > 0) throw new LandingLinkRefusal(refusals.join(" "));
  return { sections, versions };
}

/**
 * The section's button, if its type has one and it is set. Exhaustive, so a
 * type added to the registry fails type-check here until it says.
 */
function buttonOf(section: LandingSection): ButtonTarget | undefined {
  switch (section.type) {
    case "hero":
    case "cta":
      return section.button;
    case "text":
    case "image":
    case "points":
    case "steps":
    case "faq":
      return undefined;
  }
}

function withButton(section: LandingSection, button: ButtonTarget): LandingSection {
  switch (section.type) {
    case "hero":
    case "cta":
      return { ...section, button };
    case "text":
    case "image":
    case "points":
    case "steps":
    case "faq":
      return section;
  }
}

function hrefOf(target: ButtonTarget): string {
  return target.kind === "internal" ? target.path : target.url;
}

function languageName(locale: SupportedLocale): string {
  return LOCALE_CONFIG[locale].label;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One section's words with every markdown field passed through `rewrite`. */
async function canonicalText(
  type: LandingSectionType,
  text: unknown,
  rewrite: (markdown: string) => Promise<string>,
): Promise<LandingSectionText> {
  const value: Record<string, unknown> = isRecord(text) ? { ...text } : {};
  const fields: readonly LandingMarkdownField[] = LANDING_MARKDOWN_FIELDS[type];
  for (const spec of fields) {
    if ("items" in spec) {
      const items = value[spec.items];
      if (!isRecord(items)) continue;
      const rewritten: Record<string, unknown> = {};
      for (const [itemId, item] of Object.entries(items)) {
        const markdown = isRecord(item) ? item[spec.field] : undefined;
        rewritten[itemId] =
          isRecord(item) && typeof markdown === "string"
            ? { ...item, [spec.field]: await rewrite(markdown) }
            : item;
      }
      value[spec.items] = rewritten;
    } else {
      const markdown = value[spec.field];
      if (typeof markdown === "string") value[spec.field] = await rewrite(markdown);
    }
  }
  return LANDING_SECTIONS[type].text.parse(value);
}

/** The live pages a slug can address, read through each area's public reader. */
export interface SlugSources {
  /** Every published Library article (`LibraryService.listPublishedArticles`). */
  libraryArticles: () => Promise<readonly AddressableArticle[]>;
  /** Every public team profile (`TeamProfilesService.listPublicTeamProfiles`). */
  teamProfiles: () => Promise<readonly PublicTeamProfile[]>;
  /** The id of the live landing page whose `locale` version has this slug, or null. */
  landingPageId: (locale: SupportedLocale, slug: string) => Promise<string | null>;
}

/**
 * The `SlugResolver` a landing page write uses: a per-language slug resolved
 * among live pages only — the published Library articles by the Library's own
 * slug rule, the public team profiles by the Team's, the live landing pages by
 * their stored slugs — so a link stored at an id address is one a reader can
 * open. A preview route resolves like its page. The two list reads are made
 * at most once per resolver, however many links a write carries.
 *
 * A slugged route this does not know is a developer's omission, not the
 * admin's dead link, so it throws rather than refusing the write.
 */
export function siteSlugResolver(sources: SlugSources): SlugResolver {
  let articles: Promise<readonly AddressableArticle[]> | undefined;
  let team: Promise<readonly PublicTeamProfile[]> | undefined;

  return async (template, locale, slug) => {
    const area = template.split("/")[1];
    switch (area) {
      case "library":
        articles ??= sources.libraryArticles();
        return findArticleBySlug(await articles, locale, slug)?.id ?? null;
      case "team":
        team ??= sources.teamProfiles();
        return findTeamMemberBySlug(await team, slug)?.id ?? null;
      case "discover":
        return sources.landingPageId(locale, slug);
      default:
        throw new Error(`No slug resolver for the route ${template}`);
    }
  };
}
