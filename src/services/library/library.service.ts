import { walkPages } from "@/lib/supabase/paging";
import type {
  AppSupabaseClient,
  LibraryArticlePublicationRow,
  LibraryArticleRow,
} from "@/types";
import {
  hasUnpublishedChanges,
  libraryArticleInput,
  type AdminLibraryArticle,
  type AdminLibraryArticleListItem,
  type LibraryArticleDraft,
  type LibraryArticleInput,
  type PublishedLibraryArticle,
  type PublishedLibraryArticleSummary,
} from "./library.contracts";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DRAFT_COLUMNS =
  "id, title, summary, body, category, cover_image_id, cover_path, body_md5, created_at, updated_at";

const PUBLICATION_COLUMNS =
  "article_id, title, summary, body, category, cover_image_id, cover_path, body_md5, published_at, first_published_at";

/** The published copy's columns for a list: everything a card draws, no body. */
const PUBLICATION_SUMMARY_COLUMNS =
  "article_id, title, summary, category, cover_path, published_at, first_published_at";

/** The published copy's columns for comparing, without its body. */
const PUBLICATION_COMPARE_COLUMNS =
  "title, summary, category, cover_image_id, body_md5";

type DraftRow = Pick<
  LibraryArticleRow,
  | "id"
  | "title"
  | "summary"
  | "body"
  | "category"
  | "cover_image_id"
  | "cover_path"
  | "body_md5"
  | "created_at"
  | "updated_at"
>;

type PublicationRow = Pick<
  LibraryArticlePublicationRow,
  | "article_id"
  | "title"
  | "summary"
  | "body"
  | "category"
  | "cover_image_id"
  | "cover_path"
  | "body_md5"
  | "published_at"
  | "first_published_at"
>;

function toDraft(row: DraftRow): LibraryArticleDraft {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    coverImageId: row.cover_image_id,
    coverPath: row.cover_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type PublicationSummaryRow = Pick<
  LibraryArticlePublicationRow,
  | "article_id"
  | "title"
  | "summary"
  | "category"
  | "cover_path"
  | "published_at"
  | "first_published_at"
>;

function toPublishedSummary(
  row: PublicationSummaryRow,
): PublishedLibraryArticleSummary {
  return {
    id: row.article_id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    coverPath: row.cover_path,
    firstPublishedAt: row.first_published_at,
    publishedAt: row.published_at,
  };
}

function toPublished(row: PublicationRow): PublishedLibraryArticle {
  return { ...toPublishedSummary(row), body: row.body };
}

/**
 * The Library's articles: the admin's working copies and publishing, and the
 * published copies the public pages read.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`.
 * The admin reads run under `library_articles`' admin-only SELECT policy; the
 * public reads run under `library_article_publications`' policy, which admits
 * anon, so they work on a signed-out server client. The writes are four
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
   * Every article, most recently saved first, with whether each is live and
   * whether its working copy has changes that are not.
   *
   * The comparison reads the published copy's short fields and its body's
   * digest, never either body, so the list stays small however long the
   * articles are. Walked, because the table only grows; `id` breaks ties so a
   * page boundary cannot repeat or drop a row.
   */
  async listAdminArticles(): Promise<AdminLibraryArticleListItem[]> {
    const rows = await walkPages("listAdminLibraryArticles", (from, to) =>
      this.supabase
        .from("library_articles")
        .select(
          `id, title, summary, category, cover_image_id, cover_path, body_md5, updated_at, publication:library_article_publications(${PUBLICATION_COMPARE_COLUMNS})`,
          { count: "exact" },
        )
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      coverPath: row.cover_path,
      updatedAt: row.updated_at,
      isPublished: row.publication !== null,
      hasUnpublishedChanges: hasUnpublishedChanges(row, row.publication),
    }));
  }

  /**
   * One article's working copy and its published copy, or `null` when no
   * article has that id. The id comes off the editor's URL, so one that is not
   * a UUID is answered as not found without a query, which Postgres would
   * otherwise refuse as a malformed uuid rather than find nothing.
   */
  async getAdminArticle(id: string): Promise<AdminLibraryArticle | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("library_articles")
      .select(
        `${DRAFT_COLUMNS}, publication:library_article_publications(${PUBLICATION_COLUMNS})`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      draft: toDraft(data),
      publication: data.publication ? toPublished(data.publication) : null,
      hasUnpublishedChanges: hasUnpublishedChanges(data, data.publication),
    };
  }

  // -------------------------------------------------------------------------
  // Admin writes
  // -------------------------------------------------------------------------

  /** Create an article's working copy. Returns its id — the article's URL. */
  async createArticle(input: LibraryArticleInput): Promise<string> {
    const parsed = libraryArticleInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_library_article", {
      p_title: parsed.title,
      p_summary: parsed.summary,
      p_body: parsed.body,
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
   * `publishArticle`. The RPC assigns every field on every call, which is why
   * the whole input travels on every save.
   */
  async saveArticle(id: string, input: LibraryArticleInput): Promise<string> {
    const parsed = libraryArticleInput.parse(input);

    const { data, error } = await this.supabase.rpc("save_library_article", {
      p_id: id,
      p_title: parsed.title,
      p_summary: parsed.summary,
      p_body: parsed.body,
      p_category: parsed.category ?? undefined,
      p_cover_image_id: parsed.coverImageId ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("save_library_article returned no id");
    return data;
  }

  /**
   * Make the saved working copy live, replacing any live version. The
   * database refuses an incomplete working copy with `check_violation` and a
   * sentence naming every missing field.
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
   * without its body: a list feeds cards, and a card shows nothing derived
   * from the body. Walked, because the Library only grows.
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
    return rows.map(toPublishedSummary);
  }

  /**
   * One published article by id, or `null` when it is not live.
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
    return data ? toPublished(data) : null;
  }
}
