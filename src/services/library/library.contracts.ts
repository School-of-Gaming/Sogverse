import { z } from "zod";
import { Constants, type LibraryCategory } from "@/types";

/**
 * Contracts for the Library's articles.
 *
 * There is no API route here: the four writes are admin-guarded RPCs the
 * admin's own session calls, and the reads are plain table reads under RLS. A
 * cover is an entry of the shared image catalogue (`src/services/catalogue-images/`)
 * of purpose `library_cover`: an article saves the entry's id, and the database derives the
 * served path. What this module holds is the shapes the rest of the app agrees
 * on and the small pure rules around them.
 */

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

/**
 * An article's working copy as an admin saves it — the same five fields on a
 * create and on every save.
 *
 * Only the title is required: a working copy may be saved incomplete, and
 * publishing is what demands the rest (the database refuses an incomplete
 * publish and names what is missing; a cover is never required). `category`
 * and `coverImageId` are required-**nullable** rather than optional, because the save RPC assigns
 * every column on every call and an omitted field is how one is cleared —
 * demanding the field keeps a clearing deliberate.
 */
export const libraryArticleInput = z.object({
  title: z.string().trim().min(1, "An article needs a title"),
  summary: z.string().trim(),
  /** Authored markdown. */
  body: z.string().trim(),
  category: z.enum(Constants.public.Enums.library_article_category).nullable(),
  /**
   * A Library cover entry's id, or null for none. The database refuses an
   * entry of another purpose, or one that has been removed.
   */
  coverImageId: z.string().uuid("Not a catalogue picture").nullable(),
});

export type LibraryArticleInput = z.input<typeof libraryArticleInput>;

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** An article's working copy, as the admin edit page reads it. */
export interface LibraryArticleDraft {
  id: string;
  title: string;
  summary: string;
  /** Authored markdown; the empty string while there is none. */
  body: string;
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
}

/**
 * A published article as a list reads it — everything but the body, which is
 * what a card draws. Every field is set but the cover, which an article may go
 * live without.
 */
export interface PublishedLibraryArticleSummary {
  /** The article's id — what its URL carries. */
  id: string;
  title: string;
  summary: string;
  category: LibraryCategory;
  /**
   * The live cover's path in the `library-covers` bucket — resolve it with
   * `catalogueImageSrc` as a `library_cover`, which answers null for none and the page paints the
   * NO IMAGE placeholder.
   */
  coverPath: string | null;
  /** When the article first went live — the date its page shows. */
  firstPublishedAt: string;
  /** When the version now live was published. */
  publishedAt: string;
}

/** A published article whole — what its own page renders. */
export interface PublishedLibraryArticle extends PublishedLibraryArticleSummary {
  /** Authored markdown. The article page counts its reading time from it. */
  body: string;
}

/** One article on the admin list. */
export interface AdminLibraryArticleListItem {
  id: string;
  /** The working copy's title. */
  title: string;
  /** The working copy's summary; the empty string while it has none. */
  summary: string;
  category: LibraryCategory | null;
  /**
   * The working copy's cover path — resolve it with `catalogueImageSrc`. Null
   * for no cover, which the list paints as the NO IMAGE placeholder.
   */
  coverPath: string | null;
  /** When the working copy was last saved. */
  updatedAt: string;
  isPublished: boolean;
  /** True when a published article's working copy differs from what is live. */
  hasUnpublishedChanges: boolean;
}

/** One article on the admin edit page: its working copy and what is live. */
export interface AdminLibraryArticle {
  draft: LibraryArticleDraft;
  /** Null while the article is not live. */
  publication: PublishedLibraryArticle | null;
  hasUnpublishedChanges: boolean;
}

/** The fields a working copy and its published copy are compared on. */
export interface ComparableArticleCopy {
  title: string;
  summary: string;
  category: LibraryCategory | null;
  cover_image_id: string | null;
  /** md5 of the body, generated by the database on both tables. */
  body_md5: string | null;
}

/**
 * Whether a working copy differs from its published copy — false when there
 * is no published copy, because an article that is not live has nothing for
 * its edits to be "unpublished" against.
 *
 * Compared on the four short fields and the body's digest rather than the
 * body itself, so the admin list never has to read a body. A digest the
 * database failed to produce counts as a difference: saying "unpublished
 * changes" when there are none costs a republish, and the opposite hides an
 * edit from the admin who made it.
 */
export function hasUnpublishedChanges(
  draft: ComparableArticleCopy,
  publication: ComparableArticleCopy | null,
): boolean {
  if (publication === null) return false;
  if (draft.body_md5 === null || publication.body_md5 === null) return true;
  return (
    draft.title !== publication.title ||
    draft.summary !== publication.summary ||
    draft.category !== publication.category ||
    draft.cover_image_id !== publication.cover_image_id ||
    draft.body_md5 !== publication.body_md5
  );
}
