import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { walkPages } from "@/lib/supabase/paging";
import type { AppSupabaseClient } from "@/types";
import type { LibraryCategory } from "@/types";
import {
  hasUnpublishedChanges,
  libraryArticleCategoryInput,
  libraryArticleCoverInput,
  libraryArticleInput,
  libraryArticleVersionInput,
  oauthClientNameRows,
  type AdminLibraryArticle,
  type AdminLibraryArticleListItem,
  type ComparableArticleCopy,
  type LibraryArticleDraft,
  type LibraryArticleInput,
  type LibraryArticleVersionInput,
  type PublishedLibraryArticle,
  type PublishedLibraryArticleSummary,
} from "./library.contracts";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A working version whole, with what comparing and publishing read off it. */
const DRAFT_VERSION_COLUMNS = "locale, title, summary, body, body_md5, is_complete";

/** A working version for the list: no body, but its digest and completeness. */
const DRAFT_VERSION_LIST_COLUMNS = "locale, title, summary, body_md5, is_complete";

const PUBLICATION_COLUMNS = `article_id, category, cover_image_id, cover_path, published_at, first_published_at, versions:library_article_publication_translations(locale, title, summary, body, body_md5)`;

/** The published copy's columns for a list: everything a card draws, no body. */
const PUBLICATION_SUMMARY_COLUMNS = `article_id, category, cover_path, published_at, first_published_at, versions:library_article_publication_translations(locale, title, summary)`;

/** The published copy's columns for comparing, without a body. */
const PUBLICATION_COMPARE_COLUMNS = `category, cover_image_id, versions:library_article_publication_translations(locale, title, summary, body_md5)`;

/**
 * The last saver's profile, embedded by its constraint's name, since the
 * author is a second key to the same table; an admin reads every profile.
 */
const LAST_SAVER_EMBED =
  "last_saver:profiles!library_articles_last_saved_by_fkey(first_name, last_name)";

/** The last saver's name, or null when no saver is recorded. */
function saverName(
  saver: { first_name: string; last_name: string } | null,
): string | null {
  return saver ? `${saver.first_name} ${saver.last_name}`.trim() : null;
}

interface WorkingVersionRow {
  locale: string;
  title: string;
  summary: string;
  body_md5: string | null;
  is_complete: boolean | null;
}

/**
 * The working copy as publishing would copy it, for comparing with what is
 * live: the shared fields and the complete versions alone.
 */
function publishable(row: {
  category: ComparableArticleCopy["category"];
  cover_image_id: string | null;
  versions: readonly WorkingVersionRow[];
}): ComparableArticleCopy {
  return {
    category: row.category,
    cover_image_id: row.cover_image_id,
    versions: row.versions.filter((version) => version.is_complete === true),
  };
}

interface PublicationSummaryRow {
  article_id: string;
  category: PublishedLibraryArticleSummary["category"];
  cover_path: string | null;
  published_at: string;
  first_published_at: string;
  versions: readonly { locale: string; title: string; summary: string }[];
}

interface PublicationRow extends Omit<PublicationSummaryRow, "versions"> {
  versions: readonly {
    locale: string;
    title: string;
    summary: string;
    body: string;
  }[];
}

function toPublishedSummary(
  row: PublicationSummaryRow,
): PublishedLibraryArticleSummary {
  return {
    id: row.article_id,
    category: row.category,
    coverPath: row.cover_path,
    firstPublishedAt: row.first_published_at,
    publishedAt: row.published_at,
    versions: inLocaleOrder(row.versions).map(({ locale, title, summary }) => ({
      locale,
      title,
      summary,
    })),
  };
}

function toPublished(row: PublicationRow): PublishedLibraryArticle {
  return {
    ...toPublishedSummary(row),
    versions: inLocaleOrder(row.versions).map(
      ({ locale, title, summary, body }) => ({ locale, title, summary, body }),
    ),
  };
}

/**
 * The Library's articles: the admin's working copies and publishing, and the
 * published copies the public pages read.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`.
 * The admin reads run under `library_articles`' admin-only SELECT policy; the
 * public reads run under `library_article_publications`' policy, which admits
 * anon, so they work on a signed-out server client. The writes are
 * admin-guarded RPCs — neither table carries a write grant, so a stray
 * `.insert()` fails closed. A cover is picked from the shared image catalogue,
 * which owns its uploads; an article holds only the entry's id.
 */
export class LibraryService {
  constructor(private supabase: AppSupabaseClient) {}

  // -------------------------------------------------------------------------
  // Admin reads
  // -------------------------------------------------------------------------

  /**
   * Every article, most recently saved first, with its versions' titles and
   * summaries, who last saved it and through which AI app, whether it is
   * live and whether publishing now would change what is.
   *
   * The comparison reads each version's short fields and its body's digest,
   * never a body, so the list stays small however long the articles are.
   * Walked, because the table only grows; `id` breaks ties so a page boundary
   * cannot repeat or drop a row.
   */
  async listAdminArticles(): Promise<AdminLibraryArticleListItem[]> {
    const rows = await walkPages("listAdminLibraryArticles", (from, to) =>
      this.supabase
        .from("library_articles")
        .select(
          `id, category, cover_image_id, cover_path, updated_at, last_saved_via, ${LAST_SAVER_EMBED}, versions:library_article_translations(${DRAFT_VERSION_LIST_COLUMNS}), publication:library_article_publications(${PUBLICATION_COMPARE_COLUMNS})`,
          { count: "exact" },
        )
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    );

    const appNames = await this.oauthClientNames(
      rows.map((row) => row.last_saved_via),
    );

    return rows.map((row) => ({
      id: row.id,
      versions: inLocaleOrder(row.versions).map(({ locale, title, summary }) => ({
        locale,
        title,
        summary,
      })),
      category: row.category,
      coverPath: row.cover_path,
      updatedAt: row.updated_at,
      lastSavedBy: saverName(row.last_saver),
      lastSavedVia: row.last_saved_via
        ? {
            clientId: row.last_saved_via,
            name: appNames.get(row.last_saved_via) ?? null,
          }
        : null,
      isPublished: row.publication !== null,
      hasUnpublishedChanges: hasUnpublishedChanges(
        publishable(row),
        row.publication,
      ),
    }));
  }

  /**
   * One article's working copy and its published copy, or `null` when no
   * article has that id. The id comes off the editor's URL, so one that is not
   * a UUID is answered as not found without a query, which Postgres would
   * otherwise refuse as a malformed uuid rather than find nothing.
   *
   * The cover's catalogue entry is embedded for its label, which the editor
   * shows under the picture; the path stays the working copy's own derived
   * column. The catalogue is admin-only, which this read already is. The
   * embed is unhinted, so it relies on `cover_image_id` being the only
   * foreign key from the working copy to the catalogue.
   *
   * A save that came through an AI app is named by a second read, made only
   * then: the app's registration lives in Supabase Auth, out of the Data
   * API's reach, behind an admin-gated function.
   */
  async getAdminArticle(id: string): Promise<AdminLibraryArticle | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("library_articles")
      .select(
        `id, category, cover_image_id, cover_path, created_at, updated_at, last_saved_via, ${LAST_SAVER_EMBED}, versions:library_article_translations(${DRAFT_VERSION_COLUMNS}), cover_entry:catalogue_images(label), publication:library_article_publications(${PUBLICATION_COLUMNS})`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const draft: LibraryArticleDraft = {
      id: data.id,
      versions: inLocaleOrder(data.versions).map(
        ({ locale, title, summary, body }) => ({ locale, title, summary, body }),
      ),
      category: data.category,
      coverImageId: data.cover_image_id,
      coverPath: data.cover_path,
      coverLabel: data.cover_entry?.label ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastSavedBy: saverName(data.last_saver),
      lastSavedVia: data.last_saved_via
        ? {
            clientId: data.last_saved_via,
            name: await this.oauthClientName(data.last_saved_via),
          }
        : null,
    };

    return {
      draft,
      publication: data.publication ? toPublished(data.publication) : null,
      hasUnpublishedChanges: hasUnpublishedChanges(
        publishable(data),
        data.publication,
      ),
    };
  }

  /**
   * The names of the AI apps a list of saves came through, each app read once
   * however many articles it saved. An app that gave no name or is no longer
   * registered is absent from the map.
   */
  private async oauthClientNames(
    clientIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const distinct = [
      ...new Set(clientIds.filter((id): id is string => id !== null)),
    ];
    const names = await Promise.all(
      distinct.map(async (id) => [id, await this.oauthClientName(id)] as const),
    );
    return new Map(
      names.flatMap(([id, name]) => (name === null ? [] : [[id, name] as const])),
    );
  }

  /**
   * The name an AI app registered itself under, or null when it gave none or
   * is no longer registered.
   */
  private async oauthClientName(clientId: string): Promise<string | null> {
    const { data, error } = await this.supabase.rpc("get_oauth_client", {
      p_id: clientId,
    });
    if (error) throw error;
    return oauthClientNameRows.parse(data)[0]?.client_name ?? null;
  }

  // -------------------------------------------------------------------------
  // Admin writes
  // -------------------------------------------------------------------------

  /** Create an article's working copy. Returns its id — the article's URL. */
  async createArticle(input: LibraryArticleInput): Promise<string> {
    const parsed = libraryArticleInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_library_article", {
      p_versions: parsed.versions,
      // Null maps to an omission, so the RPC's DEFAULT NULL writes the null.
      p_category: parsed.category ?? undefined,
      p_cover_image_id: parsed.coverImageId ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("create_library_article returned no id");
    return data;
  }

  /**
   * Save an article's working copy. What is live does not change until
   * `publishArticle`. The RPC assigns every field and replaces the whole
   * version set on every call, which is why the whole input travels on every
   * save.
   */
  async saveArticle(id: string, input: LibraryArticleInput): Promise<string> {
    const parsed = libraryArticleInput.parse(input);

    const { data, error } = await this.supabase.rpc("save_library_article", {
      p_id: id,
      p_versions: parsed.versions,
      p_category: parsed.category ?? undefined,
      p_cover_image_id: parsed.coverImageId ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("save_library_article returned no id");
    return data;
  }

  /**
   * Save one language version of an article's working copy, creating it when
   * the language is new. No other version, nor the category or cover, is
   * touched — so this cannot undo another admin's edit to anything else.
   */
  async saveArticleVersion(
    id: string,
    version: LibraryArticleVersionInput,
  ): Promise<string> {
    const parsed = libraryArticleVersionInput.parse(version);

    const { data, error } = await this.supabase.rpc(
      "save_library_article_version",
      {
        p_id: id,
        p_locale: parsed.locale,
        p_title: parsed.title,
        p_summary: parsed.summary,
        p_body: parsed.body,
      },
    );

    if (error) throw error;
    if (!data) throw new Error("save_library_article_version returned no id");
    return data;
  }

  /** Set the working copy's category alone; null clears it. */
  async setArticleCategory(
    id: string,
    category: LibraryCategory | null,
  ): Promise<string> {
    const parsed = libraryArticleCategoryInput.parse(category);

    const { data, error } = await this.supabase.rpc(
      "set_library_article_category",
      // Null maps to an omission, so the RPC's DEFAULT NULL writes the null.
      { p_id: id, p_category: parsed ?? undefined },
    );

    if (error) throw error;
    if (!data) throw new Error("set_library_article_category returned no id");
    return data;
  }

  /**
   * Set the working copy's cover alone, as a Library cover entry's id; null
   * clears it. The database refuses an entry of another purpose, or one that
   * has been removed.
   */
  async setArticleCover(
    id: string,
    coverImageId: string | null,
  ): Promise<string> {
    const parsed = libraryArticleCoverInput.parse(coverImageId);

    const { data, error } = await this.supabase.rpc(
      "set_library_article_cover",
      { p_id: id, p_cover_image_id: parsed ?? undefined },
    );

    if (error) throw error;
    if (!data) throw new Error("set_library_article_cover returned no id");
    return data;
  }

  /**
   * Make the saved working copy live — its category, cover and every complete
   * language version at once — replacing what was live. The database refuses
   * an article with no complete version or no category with `check_violation`
   * and a sentence naming what is missing.
   */
  async publishArticle(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("publish_library_article", {
      p_id: id,
    });
    if (error) throw error;
  }

  /** Take an article off the public Library. Its working copy is kept. */
  async unpublishArticle(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("unpublish_library_article", {
      p_id: id,
    });
    if (error) throw error;
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  /**
   * Every published article, newest first by the date it first went live,
   * with every live version and no body: a list feeds cards, and a card shows
   * nothing derived from the body. The caller picks each article's version for
   * its reader, card by card. Walked, because the Library only
   * grows. An article with no version it can show is left out.
   */
  async listPublishedArticles(): Promise<PublishedLibraryArticleSummary[]> {
    const rows = await walkPages("listPublishedLibraryArticles", (from, to) =>
      this.supabase
        .from("library_article_publications")
        .select(PUBLICATION_SUMMARY_COLUMNS, { count: "exact" })
        .order("first_published_at", { ascending: false })
        .order("article_id", { ascending: false })
        .range(from, to),
    );
    return rows
      .map(toPublishedSummary)
      .filter((article) => article.versions.length > 0);
  }

  /**
   * One published article by id, with every live version, or `null` when it
   * is not live. The caller picks the version for its reader
   * (`localizeArticle`).
   *
   * The id comes straight off a public URL, so one that is not a UUID at all
   * is `null` here rather than the query error Postgres would raise casting
   * it — a mistyped link is a not-found, never a server error.
   */
  async getPublishedArticle(
    id: string,
  ): Promise<PublishedLibraryArticle | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("library_article_publications")
      .select(PUBLICATION_COLUMNS)
      .eq("article_id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const article = toPublished(data);
    return article.versions.length > 0 ? article : null;
  }
}
