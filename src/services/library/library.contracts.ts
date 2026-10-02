import { z } from "zod";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { Constants, type LibraryCategory } from "@/types";

/**
 * Contracts for the Library's articles.
 *
 * There is no API route here: the writes are admin-guarded RPCs the admin's
 * own session calls — in the browser, or through an AI app's token at the MCP
 * endpoint — and the reads are plain table reads under RLS. A
 * cover is an entry of the shared image catalogue (`src/services/catalogue-images/`)
 * of purpose `library_cover`: an article saves the entry's id, and the database derives the
 * served path. What this module holds is the shapes the rest of the app agrees
 * on and the small pure rules around them.
 *
 * **An article's text is per language.** Each version is a title, a summary
 * and a body in one site locale; the category and the cover are the article's,
 * once. Versions are listed in `SUPPORTED_LOCALES` order everywhere, so "the
 * first written" — the reader fallback's last step — is the same answer on
 * every surface.
 */

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

/** One language version as an admin saves it. */
export const libraryArticleVersionInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().trim().min(1, "Every language version needs a title"),
  summary: z.string().trim(),
  /** Authored markdown. */
  body: z.string().trim(),
});

export type LibraryArticleVersionInput = z.input<
  typeof libraryArticleVersionInput
>;

/** An article's category as an admin sets it; null clears it. */
export const libraryArticleCategoryInput = z
  .enum(Constants.public.Enums.library_article_category)
  .nullable();

/**
 * A Library cover entry's id as an admin sets it, or null for none. The
 * database refuses an entry of another purpose, or one that has been removed.
 */
export const libraryArticleCoverInput = z
  .string()
  .uuid("Not a catalogue picture")
  .nullable();

/**
 * An article's working copy as an admin saves it — the same fields on a
 * create and on every save.
 *
 * `versions` is the whole set, replacing what is stored: a language left out is
 * removed. At least one, each with a title; the rest may wait, because
 * publishing is what demands them (the database copies only complete versions
 * and refuses an article with none; a cover is never required). `category`
 * and `coverImageId` are required-**nullable** rather than optional, because
 * the save RPC assigns every column on every call and an omitted field is how
 * one is cleared — demanding the field keeps a clearing deliberate.
 */
export const libraryArticleInput = z.object({
  versions: z
    .array(libraryArticleVersionInput)
    .min(1, "An article needs a title")
    .refine(
      (versions) =>
        new Set(versions.map((version) => version.locale)).size ===
        versions.length,
      "Each language may have one version",
    ),
  category: libraryArticleCategoryInput,
  coverImageId: libraryArticleCoverInput,
});

export type LibraryArticleInput = z.input<typeof libraryArticleInput>;

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** One language version of an article's working copy. */
export interface LibraryArticleDraftVersion {
  locale: SupportedLocale;
  title: string;
  /** The empty string while unwritten. */
  summary: string;
  /** Authored markdown; the empty string while unwritten. */
  body: string;
}

/** An article's working copy, as the admin edit page reads it. */
export interface LibraryArticleDraft {
  id: string;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: LibraryArticleDraftVersion[];
  category: LibraryCategory | null;
  /** The cover's catalogue entry, or null for none. */
  coverImageId: string | null;
  /**
   * The cover's path in the `library-covers` bucket, derived by the database
   * from `coverImageId` — resolve it with `catalogueImageSrc` as a
   * `library_cover`. Null exactly when
   * there is no cover.
   */
  coverPath: string | null;
  /**
   * The name the catalogue gives the cover's entry, which the editor shows
   * under the picture. Null exactly when there is no cover.
   */
  coverLabel: string | null;
  createdAt: string;
  /** When the working copy was last saved. Publishing does not move it. */
  updatedAt: string;
  /**
   * The name of the admin who last saved the working copy. Null when no saver
   * is recorded: a server-side write, an account since removed, or a save
   * from before saves were attributed.
   */
  lastSavedBy: string | null;
  /**
   * The AI app the last save came through, or null when it was made in
   * Sogverse itself. `name` is what the app registered itself as, and null
   * once it is no longer registered.
   */
  lastSavedVia: { clientId: string; name: string | null } | null;
}

/** One live language version as a list reads it: no body. */
export interface PublishedLibraryVersionSummary {
  locale: SupportedLocale;
  title: string;
  summary: string;
}

/** One live language version whole. */
export interface PublishedLibraryVersion extends PublishedLibraryVersionSummary {
  /** Authored markdown. The article page counts its reading time from it. */
  body: string;
}

/**
 * A published article as a list reads it — every live version without its
 * body, which is what a card draws. Every field is set but the cover, which an
 * article may go live without.
 */
export interface PublishedLibraryArticleSummary {
  /** The article's id — what its URL carries. */
  id: string;
  category: LibraryCategory;
  /**
   * The live cover's path in the `library-covers` bucket — resolve it with
   * `catalogueImageSrc` as a `library_cover`, which answers null for none and the page paints the
   * NO IMAGE placeholder.
   */
  coverPath: string | null;
  /** When the article first went live — the date its page shows. */
  firstPublishedAt: string;
  /** When the live versions were published. */
  publishedAt: string;
  /** Every live version, in `SUPPORTED_LOCALES` order; never empty. */
  versions: PublishedLibraryVersionSummary[];
}

/** A published article whole, every live version with its body. */
export interface PublishedLibraryArticle
  extends Omit<PublishedLibraryArticleSummary, "versions"> {
  versions: PublishedLibraryVersion[];
}

/**
 * A published article in the one version a reader of `locale` is shown — what
 * a card or a page draws. `locale` is the version's own, which differs from the
 * reader's when the fallback answered.
 */
export type LocalizedLibraryArticleSummary = Omit<
  PublishedLibraryArticleSummary,
  "versions"
> &
  PublishedLibraryVersionSummary;

export type LocalizedLibraryArticle = Omit<PublishedLibraryArticle, "versions"> &
  PublishedLibraryVersion;

/** One article on the admin list. */
export interface AdminLibraryArticleListItem {
  id: string;
  /** The working copy's version titles and summaries, in locale order; never empty. */
  versions: { locale: SupportedLocale; title: string; summary: string }[];
  category: LibraryCategory | null;
  /**
   * The working copy's cover path — resolve it with `catalogueImageSrc`. Null
   * for no cover, which the list paints as the NO IMAGE placeholder.
   */
  coverPath: string | null;
  /** When the working copy was last saved. */
  updatedAt: string;
  isPublished: boolean;
  /** True when publishing now would change what is live. */
  hasUnpublishedChanges: boolean;
}

/** One article on the admin edit page: its working copy and what is live. */
export interface AdminLibraryArticle {
  draft: LibraryArticleDraft;
  /** Null while the article is not live. */
  publication: PublishedLibraryArticle | null;
  hasUnpublishedChanges: boolean;
}

/**
 * What `get_oauth_client` answers, narrowed to what naming an AI app needs.
 * The generator types every column non-null; the name is whatever the app
 * registered, and the registration lets it be absent. No row at all means the
 * app is no longer registered.
 */
export const oauthClientNameRows = z.array(
  z.object({ client_name: z.string().nullable() }),
);

// ---------------------------------------------------------------------------
// Reading in a language
// ---------------------------------------------------------------------------

/**
 * The version a reader of `locale` is shown: theirs, else English, else the
 * first written. Null only for an article with no version, which a published
 * one never is.
 */
export function localizeArticleSummary(
  article: PublishedLibraryArticleSummary,
  locale: SupportedLocale,
): LocalizedLibraryArticleSummary | null {
  const { versions, ...shared } = article;
  const version = resolveTranslation(versions, locale);
  return version === null ? null : { ...shared, ...version };
}

export function localizeArticle(
  article: PublishedLibraryArticle,
  locale: SupportedLocale,
): LocalizedLibraryArticle | null {
  const { versions, ...shared } = article;
  const version = resolveTranslation(versions, locale);
  return version === null ? null : { ...shared, ...version };
}

// ---------------------------------------------------------------------------
// Unpublished changes
// ---------------------------------------------------------------------------

/** One version as compared: its short fields and its body's digest. */
export interface ComparableVersion {
  locale: string;
  title: string;
  summary: string;
  /** md5 of the body, generated by the database on both tables. */
  body_md5: string | null;
}

/** The fields a working copy and its published copy are compared on. */
export interface ComparableArticleCopy {
  category: LibraryCategory | null;
  cover_image_id: string | null;
  /**
   * The versions publishing would copy — for the working copy, its complete
   * ones alone; for the published copy, all of them.
   */
  versions: readonly ComparableVersion[];
}

/**
 * Whether publishing now would change what is live — false when there is no
 * published copy, because an article that is not live has nothing for its
 * edits to be "unpublished" against.
 *
 * Compared on the shared fields and on each version's short fields and body
 * digest, never a body, so the admin list never has to read one. The working
 * side is the versions publishing would copy, so a half-written new language
 * is not a change readers would see, and a live language whose working copy
 * is no longer complete is one (publishing would take it down). A digest the
 * database failed to produce counts as a difference: saying "unpublished
 * changes" when there are none costs a republish, and the opposite hides an
 * edit from the admin who made it.
 */
export function hasUnpublishedChanges(
  draft: ComparableArticleCopy,
  publication: ComparableArticleCopy | null,
): boolean {
  if (publication === null) return false;
  if (
    draft.category !== publication.category ||
    draft.cover_image_id !== publication.cover_image_id ||
    draft.versions.length !== publication.versions.length
  ) {
    return true;
  }
  const live = new Map(publication.versions.map((v) => [v.locale, v]));
  return draft.versions.some((version) => {
    const published = live.get(version.locale);
    return (
      published === undefined ||
      version.body_md5 === null ||
      published.body_md5 === null ||
      version.title !== published.title ||
      version.summary !== published.summary ||
      version.body_md5 !== published.body_md5
    );
  });
}
