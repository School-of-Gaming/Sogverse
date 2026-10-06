import { z } from "zod";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  LANDING_ID_PATTERN,
  landingSections,
  landingSectionTextsSchema,
  type LandingSection,
  type LandingSectionTexts,
} from "@/lib/landing-pages/sections";
import { slugify } from "@/lib/slug";

/**
 * Contracts for landing pages.
 *
 * There is no API route here: the writes are admin-guarded RPCs the admin's
 * own session calls — in the browser, or through an AI app's token at the MCP
 * endpoint — and the reads are plain table reads under RLS. What this module
 * holds is the shapes the rest of the app agrees on and the small pure rules
 * around them; the sections themselves are the registry's
 * (`src/lib/landing-pages/sections/`).
 *
 * **A page's structure is shared; its words are per language.** The sections —
 * their order, pictures, buttons, icons and items — are the page's, once.
 * Each language version holds a title, a summary, a slug and the text of every
 * section, keyed by section id. Versions are listed in `SUPPORTED_LOCALES`
 * order everywhere, so "the first written" — the reader fallback's last step —
 * is the same answer on every surface.
 */

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** The longest slug the database stores. */
export const LANDING_SLUG_MAX_LENGTH = 80;

/**
 * A landing page slug: lowercase a–z, 0–9 and single hyphens, length-capped,
 * and never shaped like a uuid, so a slug address and an id address cannot be
 * mistaken for each other. The database's CHECK states the same format.
 */
export const landingSlug = z
  .string()
  .trim()
  .max(LANDING_SLUG_MAX_LENGTH, "An address is at most 80 characters")
  .refine(isSlugFormat, (slug) => ({
    message: `An address holds only lowercase letters a–z, digits and single hyphens between them${isSlugFormat(slug.toLowerCase()) ? ` — "${slug.toLowerCase()}" would do` : ""}`,
  }))
  .refine(
    (slug) => !LANDING_ID_PATTERN.test(slug),
    "An address may not look like a page id: those are kept for each page's id address",
  );

function isSlugFormat(slug: string): boolean {
  return (
    /^[a-z0-9-]+$/.test(slug) &&
    !slug.startsWith("-") &&
    !slug.endsWith("-") &&
    !slug.includes("--")
  );
}

/**
 * The address a version gets when none is given: its title's slug, cut at a
 * word boundary to the length cap, or nothing at all when the title has no
 * Latin letter or digit (or would derive something shaped like an id).
 */
export function defaultLandingSlug(title: string): string {
  let slug = slugify(title);
  if (slug.length > LANDING_SLUG_MAX_LENGTH) {
    const cut = slug.slice(0, LANDING_SLUG_MAX_LENGTH + 1);
    const boundary = cut.lastIndexOf("-");
    slug = (boundary > 0 ? cut.slice(0, boundary) : cut.slice(0, LANDING_SLUG_MAX_LENGTH)).replace(
      /-+$/,
      "",
    );
  }
  return landingSlug.safeParse(slug).success ? slug : "";
}

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

/** The longest title and summary the database stores. */
export const LANDING_TITLE_MAX_LENGTH = 120;
export const LANDING_SUMMARY_MAX_LENGTH = 160;

/**
 * One language version as an admin saves it.
 *
 * `slug` is optional: left out (or blank), the version keeps the address it
 * has, and a version that has none takes its title's (`defaultLandingSlug`). A
 * slug is fixed once its language has been published; the database refuses a
 * change after that. `sectionTexts` is the whole of this language's words,
 * keyed by section id, and is checked against the page's structure by the
 * writer that has it.
 */
export const landingVersionInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  title: z
    .string()
    .trim()
    .min(1, "Every language version needs a title")
    .max(LANDING_TITLE_MAX_LENGTH, "A title is at most 120 characters"),
  summary: z
    .string()
    .trim()
    .max(LANDING_SUMMARY_MAX_LENGTH, "A summary is at most 160 characters"),
  slug: z
    .union([z.literal(""), landingSlug])
    .optional()
    .transform((slug) => (slug === "" ? undefined : slug)),
  sectionTexts: z.record(z.string(), z.unknown()),
});

export type LandingVersionInput = z.input<typeof landingVersionInput>;

/** One version once its words have been checked against the structure. */
export type ParsedLandingVersion = Omit<
  z.output<typeof landingVersionInput>,
  "sectionTexts"
> & { sectionTexts: LandingSectionTexts };

/**
 * Check a version's words against the structure they belong to: every key a
 * section of it, every entry that section type's text fields.
 */
export function parseVersionTexts(
  sections: readonly LandingSection[],
  version: z.output<typeof landingVersionInput>,
  context: z.RefinementCtx,
  path: (string | number)[],
): ParsedLandingVersion | null {
  const texts = landingSectionTextsSchema(sections).safeParse(version.sectionTexts);
  if (!texts.success) {
    for (const issue of texts.error.issues) {
      context.addIssue({ ...issue, path: [...path, "sectionTexts", ...issue.path] });
    }
    return null;
  }
  return { ...version, sectionTexts: texts.data };
}

const distinctLocales = (versions: readonly { locale: string }[]) =>
  new Set(versions.map((version) => version.locale)).size === versions.length;

/**
 * A page's working copy as the editor saves it, whole: the structure and the
 * whole version set, replacing what is stored — a language left out is
 * removed. At least one version, each with a title; the rest may wait, because
 * publishing is what demands it.
 */
export const landingPageInput = z
  .object({
    sections: landingSections,
    versions: z
      .array(landingVersionInput)
      .min(1, "A landing page needs a title")
      .refine(distinctLocales, "Each language may have one version"),
  })
  .transform((input, context) => {
    const versions: ParsedLandingVersion[] = [];
    input.versions.forEach((version, index) => {
      const parsed = parseVersionTexts(input.sections, version, context, [
        "versions",
        index,
      ]);
      if (parsed !== null) versions.push(parsed);
    });
    return { sections: input.sections, versions };
  });

export type LandingPageInput = z.input<typeof landingPageInput>;
export type ParsedLandingPage = z.output<typeof landingPageInput>;

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** One language version of a page's working copy. */
export interface LandingPageDraftVersion {
  locale: SupportedLocale;
  title: string;
  /** The empty string while unwritten. */
  summary: string;
  /** The empty string while unwritten. */
  slug: string;
  sectionTexts: LandingSectionTexts;
  /**
   * What the version still needs before publishing takes it, as paths
   * (`missingInLandingVersion`); empty when complete.
   */
  missing: string[];
  /** True once this language has been published: its slug can no longer change. */
  slugFixed: boolean;
}

/** Who last saved a working copy, and through which AI app. */
export interface LandingPageSaver {
  /**
   * The name of the admin who last saved the working copy, or null when no
   * saver is recorded: a server-side write, or an account since removed.
   */
  lastSavedBy: string | null;
  /**
   * The AI app the last save came through, or null when it was made in
   * Sogverse itself. `name` is what the app registered itself as, and null
   * once it is no longer registered.
   */
  lastSavedVia: { clientId: string; name: string | null } | null;
}

/** A page's working copy, as the admin edit page reads it. */
export interface LandingPageDraft extends LandingPageSaver {
  id: string;
  sections: LandingSection[];
  /**
   * Each picture the sections show, by catalogue entry id, as its path in the
   * `landing-images` bucket — resolve it with `catalogueImageSrc` as a
   * `landing_image`. Derived by the database from the sections.
   */
  imagePaths: Record<string, string>;
  /**
   * The catalogue label of each picture in `imagePaths`, by the same id — what
   * the editor shows under the picture.
   */
  imageLabels: Record<string, string>;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: LandingPageDraftVersion[];
  createdAt: string;
  /** When the working copy was last saved. Publishing does not move it. */
  updatedAt: string;
}

/** One live language version as a list reads it: no section texts. */
export interface PublishedLandingVersionSummary {
  locale: SupportedLocale;
  title: string;
  summary: string;
  slug: string;
}

/** One live language version whole. */
export interface PublishedLandingVersion extends PublishedLandingVersionSummary {
  sectionTexts: LandingSectionTexts;
}

/** A published page as a list reads it — the sitemap, `llms.txt`. */
export interface PublishedLandingPageSummary {
  /** The page's id — its id address. */
  id: string;
  /** When the page first went live. */
  firstPublishedAt: string;
  /** When the live versions were published: the sitemap's `lastmod`. */
  publishedAt: string;
  /** Every live version, in `SUPPORTED_LOCALES` order; never empty. */
  versions: PublishedLandingVersionSummary[];
}

/** A published page whole: its live structure and every live version. */
export interface PublishedLandingPage
  extends Omit<PublishedLandingPageSummary, "versions"> {
  sections: LandingSection[];
  /** As on the working copy, for the live sections. */
  imagePaths: Record<string, string>;
  versions: PublishedLandingVersion[];
}

/**
 * A published page in the one version a reader of `locale` is shown.
 * `locale` is the version's own, which differs from the reader's when the
 * fallback answered.
 */
export type LocalizedLandingPageSummary = Omit<
  PublishedLandingPageSummary,
  "versions"
> &
  PublishedLandingVersionSummary;

export type LocalizedLandingPage = Omit<PublishedLandingPage, "versions"> &
  PublishedLandingVersion;

/** One page on the admin list. */
export interface AdminLandingPageListItem extends LandingPageSaver {
  id: string;
  /** The working copy's versions, without their words, in locale order; never empty. */
  versions: {
    locale: SupportedLocale;
    title: string;
    summary: string;
    slug: string;
    isComplete: boolean;
  }[];
  /** When the working copy was last saved. */
  updatedAt: string;
  isPublished: boolean;
  /** True when publishing now would change what is live. */
  hasUnpublishedChanges: boolean;
}

/** One page on the admin edit page: its working copy and what is live. */
export interface AdminLandingPage {
  draft: LandingPageDraft;
  /** Null while the page is not live. */
  publication: PublishedLandingPage | null;
  hasUnpublishedChanges: boolean;
}

/** A copy's `image_paths` column, as the database derives it. */
export const landingImagePaths = z.record(z.string(), z.string());

/**
 * What `get_oauth_client` answers, narrowed to what naming an AI app needs.
 * No row at all means the app is no longer registered.
 */
export const oauthClientNameRows = z.array(
  z.object({ client_name: z.string().nullable() }),
);

/** A stored structure, read back. */
export function readSections(value: unknown): LandingSection[] {
  return landingSections.parse(value);
}

/** A stored version's words, read back against its copy's structure. */
export function readSectionTexts(
  sections: readonly LandingSection[],
  value: unknown,
): LandingSectionTexts {
  return landingSectionTextsSchema(sections).parse(value);
}

// ---------------------------------------------------------------------------
// Reading in a language
// ---------------------------------------------------------------------------

/**
 * The version a reader of `locale` is shown: theirs, else English, else the
 * first written. Null only for a page with no version, which a published one
 * never is.
 */
export function localizeLandingPageSummary(
  page: PublishedLandingPageSummary,
  locale: SupportedLocale,
): LocalizedLandingPageSummary | null {
  const { versions, ...shared } = page;
  const version = resolveTranslation(versions, locale);
  return version === null ? null : { ...shared, ...version };
}

export function localizeLandingPage(
  page: PublishedLandingPage,
  locale: SupportedLocale,
): LocalizedLandingPage | null {
  const { versions, ...shared } = page;
  const version = resolveTranslation(versions, locale);
  return version === null ? null : { ...shared, ...version };
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Why a write was refused: the database's own sentence when it wrote one for
 * a reader, or nothing to quote. The landing page writers raise their
 * admin-facing sentences under four SQLSTATEs — `check_violation` (a missing
 * title, a malformed structure or address, a fixed address changed, nothing
 * complete to publish, a picture of another purpose), `no_data_found` (the
 * page is gone), `foreign_key_violation` (a picture left the catalogue) and
 * `unique_violation` (an address another page holds). Every other code carries
 * a message written for a developer, so it falls back to a generic line. The
 * editor and the MCP tools both read a refusal through this.
 */
export type LandingWriteFailure =
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

const QUOTED_SQLSTATES: ReadonlySet<string> = new Set([
  "23514", // check_violation
  "P0002", // no_data_found
  "23503", // foreign_key_violation
  "23505", // unique_violation
]);

export function landingWriteFailure(error: unknown): LandingWriteFailure {
  if (typeof error !== "object" || error === null) return { kind: "unknown" };
  if (!("code" in error) || !("message" in error)) return { kind: "unknown" };
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") {
    return { kind: "unknown" };
  }
  if (!QUOTED_SQLSTATES.has(code) || message.length === 0) {
    return { kind: "unknown" };
  }
  return { kind: "reason", reason: message };
}

// ---------------------------------------------------------------------------
// Unpublished changes
// ---------------------------------------------------------------------------

/** One version as compared: its short fields and its words' digest. */
export interface ComparableLandingVersion {
  locale: string;
  title: string;
  summary: string;
  slug: string;
  /** md5 of the section texts, generated by the database on both tables. */
  texts_md5: string | null;
}

/** What a working copy and its published copy are compared on. */
export interface ComparableLandingCopy {
  /** md5 of the structure, generated by the database on both tables. */
  sections_md5: string | null;
  /**
   * The versions publishing would copy — for the working copy, its complete
   * ones alone; for the published copy, all of them.
   */
  versions: readonly ComparableLandingVersion[];
}

/**
 * Whether publishing now would change what is live — false when there is no
 * published copy, because a page that is not live has nothing for its edits
 * to be "unpublished" against.
 *
 * Compared on the structure's digest and on each version's short fields and
 * words' digest, so the admin list never reads a page's words. The working
 * side is the versions publishing would copy, so a half-written new language
 * is not a change readers would see, and a live language whose working
 * version is no longer complete is one (publishing would take it down). A
 * digest the database failed to produce counts as a difference.
 */
export function hasUnpublishedChanges(
  draft: ComparableLandingCopy,
  publication: ComparableLandingCopy | null,
): boolean {
  if (publication === null) return false;
  if (
    draft.sections_md5 === null ||
    draft.sections_md5 !== publication.sections_md5 ||
    draft.versions.length !== publication.versions.length
  ) {
    return true;
  }
  const live = new Map(publication.versions.map((v) => [v.locale, v]));
  return draft.versions.some((version) => {
    const published = live.get(version.locale);
    return (
      published === undefined ||
      version.texts_md5 === null ||
      published.texts_md5 === null ||
      version.title !== published.title ||
      version.summary !== published.summary ||
      version.slug !== published.slug ||
      version.texts_md5 !== published.texts_md5
    );
  });
}
