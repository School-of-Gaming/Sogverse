import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { walkPages } from "@/lib/supabase/paging";
import {
  landingSections,
  landingSectionTextsSchema,
  missingInLandingVersion,
  type LandingSection,
  type LandingSectionInput,
} from "@/lib/landing-pages/sections";
import type { SlugResolver } from "@/lib/links/own-site";
import { LibraryService } from "@/services/library/library.service";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import type { AppSupabaseClient } from "@/types";
import {
  defaultLandingSlug,
  hasUnpublishedChanges,
  landingImagePaths,
  landingPageInput,
  landingVersionInput,
  oauthClientNameRows,
  readSectionTexts,
  readSections,
  type AdminLandingPage,
  type AdminLandingPageListItem,
  type ComparableLandingCopy,
  type LandingPageDraft,
  type LandingPageInput,
  type LandingVersionInput,
  type ParsedLandingVersion,
  type PublishedLandingPage,
  type PublishedLandingPageSummary,
} from "./landing-pages.contracts";
import { canonicaliseLandingLinks, siteSlugResolver } from "./landing-pages.links";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A working version whole, with what comparing and publishing read off it. */
const DRAFT_VERSION_COLUMNS =
  "locale, title, summary, slug, section_texts, texts_md5, is_complete, first_published_at";

/** A working version for the list: no words, but their digest and completeness. */
const DRAFT_VERSION_LIST_COLUMNS =
  "locale, title, summary, slug, texts_md5, is_complete";

const PUBLICATION_COLUMNS = `page_id, sections, sections_md5, image_paths, published_at, first_published_at, versions:landing_page_publication_translations(locale, title, summary, slug, section_texts, texts_md5)`;

/** The published copy's columns for a list: no structure and no words. */
const PUBLICATION_SUMMARY_COLUMNS = `page_id, published_at, first_published_at, versions:landing_page_publication_translations(locale, title, summary, slug)`;

/** The published copy's columns for comparing, without its words. */
const PUBLICATION_COMPARE_COLUMNS = `sections_md5, versions:landing_page_publication_translations(locale, title, summary, slug, texts_md5)`;

/**
 * The last saver's profile, embedded by its constraint's name, since the
 * author is a second key to the same table; an admin reads every profile.
 */
const LAST_SAVER_EMBED =
  "last_saver:profiles!landing_pages_last_saved_by_fkey(first_name, last_name)";

function saverName(
  saver: { first_name: string; last_name: string } | null,
): string | null {
  return saver ? `${saver.first_name} ${saver.last_name}`.trim() : null;
}

/**
 * The working copy as publishing would copy it, for comparing with what is
 * live: the structure and the complete versions alone.
 */
function publishable(row: {
  sections_md5: string | null;
  versions: readonly {
    locale: string;
    title: string;
    summary: string;
    slug: string;
    texts_md5: string | null;
    is_complete: boolean;
  }[];
}): ComparableLandingCopy {
  return {
    sections_md5: row.sections_md5,
    versions: row.versions.filter((version) => version.is_complete),
  };
}

interface PublicationSummaryRow {
  page_id: string;
  published_at: string;
  first_published_at: string;
  versions: readonly { locale: string; title: string; summary: string; slug: string }[];
}

interface PublicationRow extends Omit<PublicationSummaryRow, "versions"> {
  sections: unknown;
  image_paths: unknown;
  versions: readonly {
    locale: string;
    title: string;
    summary: string;
    slug: string;
    section_texts: unknown;
  }[];
}

function toPublishedSummary(row: PublicationSummaryRow): PublishedLandingPageSummary {
  return {
    id: row.page_id,
    firstPublishedAt: row.first_published_at,
    publishedAt: row.published_at,
    versions: inLocaleOrder(row.versions).map(({ locale, title, summary, slug }) => ({
      locale,
      title,
      summary,
      slug,
    })),
  };
}

function toPublished(row: PublicationRow): PublishedLandingPage {
  const sections = readSections(row.sections);
  return {
    ...toPublishedSummary(row),
    sections,
    imagePaths: landingImagePaths.parse(row.image_paths),
    versions: inLocaleOrder(row.versions).map(
      ({ locale, title, summary, slug, section_texts }) => ({
        locale,
        title,
        summary,
        slug,
        sectionTexts: readSectionTexts(sections, section_texts),
      }),
    ),
  };
}

/** A version as the save RPCs take it, inside `p_versions` or spread. */
function toVersionPayload(version: ParsedLandingVersion) {
  return {
    locale: version.locale,
    title: version.title,
    summary: version.summary,
    slug: version.slug ?? null,
    default_slug: defaultLandingSlug(version.title),
    section_texts: version.sectionTexts,
  };
}

/**
 * Landing pages: the admin's working copies and publishing, and the published
 * copies the public pages read.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`.
 * The admin reads run under the working tables' admin-only SELECT policies;
 * the public reads run under the published tables' policies, which admit
 * anon, so they work on a signed-out server client. The writes are
 * admin-guarded RPCs — no table carries a write grant, so a stray `.insert()`
 * fails closed. Every write's input passes through `canonicaliseLandingLinks`
 * before it is sent.
 */
export class LandingPageService {
  constructor(private supabase: AppSupabaseClient) {}

  // -------------------------------------------------------------------------
  // Admin reads
  // -------------------------------------------------------------------------

  /**
   * Every page, most recently saved first, with its versions' short fields
   * and completeness, who last saved it and through which AI app, whether it
   * is live and whether publishing now would change what is. Never reads a
   * page's words: the comparison reads digests. Walked, because the table only
   * grows; `id` breaks ties.
   */
  async listAdminPages(): Promise<AdminLandingPageListItem[]> {
    const rows = await walkPages("listAdminLandingPages", (from, to) =>
      this.supabase
        .from("landing_pages")
        .select(
          `id, sections_md5, updated_at, last_saved_via, ${LAST_SAVER_EMBED}, versions:landing_page_translations(${DRAFT_VERSION_LIST_COLUMNS}), publication:landing_page_publications(${PUBLICATION_COMPARE_COLUMNS})`,
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
      versions: inLocaleOrder(row.versions).map(
        ({ locale, title, summary, slug, is_complete }) => ({
          locale,
          title,
          summary,
          slug,
          isComplete: is_complete,
        }),
      ),
      updatedAt: row.updated_at,
      lastSavedBy: saverName(row.last_saver),
      lastSavedVia: row.last_saved_via
        ? {
            clientId: row.last_saved_via,
            name: appNames.get(row.last_saved_via) ?? null,
          }
        : null,
      isPublished: row.publication !== null,
      hasUnpublishedChanges: hasUnpublishedChanges(publishable(row), row.publication),
    }));
  }

  /**
   * One page's working copy and its published copy, or `null` when no page
   * has that id. An id that is not a UUID is answered as not found without a
   * query. Each draft version carries what it still needs before publishing
   * takes it, by the TypeScript half of the required-text rule.
   */
  async getAdminPage(id: string): Promise<AdminLandingPage | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("landing_pages")
      .select(
        `id, sections, sections_md5, image_paths, created_at, updated_at, last_saved_via, ${LAST_SAVER_EMBED}, versions:landing_page_translations(${DRAFT_VERSION_COLUMNS}), publication:landing_page_publications(${PUBLICATION_COLUMNS})`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const sections = readSections(data.sections);
    const imagePaths = landingImagePaths.parse(data.image_paths);
    const draft: LandingPageDraft = {
      id: data.id,
      sections,
      imagePaths,
      imageLabels: await this.catalogueLabels(Object.keys(imagePaths)),
      versions: inLocaleOrder(data.versions).map((version) => {
        const sectionTexts = readSectionTexts(sections, version.section_texts);
        return {
          locale: version.locale,
          title: version.title,
          summary: version.summary,
          slug: version.slug,
          sectionTexts,
          missing: missingInLandingVersion(sections, {
            title: version.title,
            summary: version.summary,
            slug: version.slug,
            sectionTexts,
          }),
          slugFixed: version.first_published_at !== null,
        };
      }),
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
   * The catalogue label of each of these entries, by id. A second read rather
   * than an embed, because the structure references its pictures from inside
   * JSON, where no foreign key reaches. The catalogue is admin-only, which the
   * admin read already is.
   */
  private async catalogueLabels(ids: readonly string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const { data, error } = await this.supabase
      .from("catalogue_images")
      .select("id, label")
      .in("id", ids);
    if (error) throw error;
    return Object.fromEntries(data.map(({ id, label }) => [id, label]));
  }

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

  /** Create a page's working copy, whole. Returns its id. */
  async createPage(input: LandingPageInput): Promise<string> {
    const write = await canonicaliseLandingLinks(landingPageInput.parse(input), {
      resolver: this.slugResolver(),
    });

    const { data, error } = await this.supabase.rpc("create_landing_page", {
      p_sections: write.sections ?? [],
      p_versions: write.versions.map(toVersionPayload),
    });

    if (error) throw error;
    if (!data) throw new Error("create_landing_page returned no id");
    return data;
  }

  /**
   * Save a page's working copy whole — the structure and every version, the
   * set replacing what is stored. What is live does not change until
   * `publishPage`.
   */
  async savePage(id: string, input: LandingPageInput): Promise<string> {
    const write = await canonicaliseLandingLinks(landingPageInput.parse(input), {
      resolver: this.slugResolver(),
    });

    const { data, error } = await this.supabase.rpc("save_landing_page", {
      p_id: id,
      p_sections: write.sections ?? [],
      p_versions: write.versions.map(toVersionPayload),
    });

    if (error) throw error;
    if (!data) throw new Error("save_landing_page returned no id");
    return data;
  }

  /**
   * Save the working copy's structure alone — the ordered sections and their
   * shared fields. No version's words are written, except that a section the
   * structure drops takes its words in every language with it.
   */
  async saveStructure(id: string, sections: LandingSectionInput[]): Promise<string> {
    const write = await canonicaliseLandingLinks(
      { sections: landingSections.parse(sections), versions: [] },
      { resolver: this.slugResolver() },
    );

    const { data, error } = await this.supabase.rpc("save_landing_page_structure", {
      p_id: id,
      p_sections: write.sections ?? [],
    });

    if (error) throw error;
    if (!data) throw new Error("save_landing_page_structure returned no id");
    return data;
  }

  /**
   * Save one language version of the working copy — its title, summary, slug
   * and every section's words in that language — creating it when the
   * language is new. No other version, and not the structure, is touched.
   *
   * The words are checked against the page's current structure, read first;
   * a page that does not exist is left to the database to refuse.
   */
  async saveVersion(id: string, version: LandingVersionInput): Promise<string> {
    const parsed = landingVersionInput.parse(version);
    const sections = await this.currentSections(id);
    const checked: ParsedLandingVersion = {
      ...parsed,
      sectionTexts:
        sections === null
          ? {}
          : landingSectionTextsSchema(sections).parse(parsed.sectionTexts),
    };

    const write = await canonicaliseLandingLinks(
      { sections: null, versions: [checked] },
      { resolver: this.slugResolver(), structure: sections ?? [] },
    );
    const [payload] = write.versions.map(toVersionPayload);

    const { data, error } = await this.supabase.rpc("save_landing_page_version", {
      p_id: id,
      p_locale: payload.locale,
      p_title: payload.title,
      p_summary: payload.summary,
      p_slug: payload.slug ?? undefined,
      p_default_slug: payload.default_slug,
      p_section_texts: payload.section_texts,
    });

    if (error) throw error;
    if (!data) throw new Error("save_landing_page_version returned no id");
    return data;
  }

  /**
   * A fresh resolver for one write's own-site links: a slug found among live
   * pages only, through each area's public reader, so a stored id address is
   * one a reader can open. Fresh per write, so its list reads are never stale.
   */
  private slugResolver(): SlugResolver {
    return siteSlugResolver({
      libraryArticles: () => new LibraryService(this.supabase).listPublishedArticles(),
      teamProfiles: () => new TeamProfilesService(this.supabase).listPublicTeamProfiles(),
      landingPageId: async (locale, slug) =>
        (await this.getPublishedPageBySlug(locale, slug))?.id ?? null,
    });
  }

  /** The working copy's current structure, or null when no page has that id. */
  private async currentSections(id: string): Promise<LandingSection[] | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.supabase
      .from("landing_pages")
      .select("sections")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? readSections(data.sections) : null;
  }

  /**
   * Make the saved working copy live — its structure and every complete
   * language version at once — replacing what was live. The database refuses
   * a page with no complete version with `check_violation`.
   */
  async publishPage(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("publish_landing_page", { p_id: id });
    if (error) throw error;
  }

  /** Take a page off the site. Its working copy is kept. */
  async unpublishPage(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("unpublish_landing_page", { p_id: id });
    if (error) throw error;
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  /**
   * Every published page, newest first by the date it first went live, with
   * every live version's short fields and no structure or words — what the
   * sitemap and `llms.txt` read. Walked, because pages only grow.
   */
  async listPublishedPages(): Promise<PublishedLandingPageSummary[]> {
    const rows = await walkPages("listPublishedLandingPages", (from, to) =>
      this.supabase
        .from("landing_page_publications")
        .select(PUBLICATION_SUMMARY_COLUMNS, { count: "exact" })
        .order("first_published_at", { ascending: false })
        .order("page_id", { ascending: false })
        .range(from, to),
    );
    return rows.map(toPublishedSummary).filter((page) => page.versions.length > 0);
  }

  /**
   * One published page by id, with every live version, or `null` when it is
   * not live. The caller picks the version for its reader
   * (`localizeLandingPage`). An id that is not a UUID is `null` rather than
   * the query error Postgres would raise.
   */
  async getPublishedPage(id: string): Promise<PublishedLandingPage | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("landing_page_publications")
      .select(PUBLICATION_COLUMNS)
      .eq("page_id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const page = toPublished(data);
    return page.versions.length > 0 ? page : null;
  }

  /**
   * The published page whose live version in `locale` has this slug, or
   * `null`. A slug addresses a page in its own locale only.
   */
  async getPublishedPageBySlug(
    locale: string,
    slug: string,
  ): Promise<PublishedLandingPage | null> {
    const { data, error } = await this.supabase
      .from("landing_page_publication_translations")
      .select("page_id")
      .eq("locale", locale)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data ? this.getPublishedPage(data.page_id) : null;
  }
}
