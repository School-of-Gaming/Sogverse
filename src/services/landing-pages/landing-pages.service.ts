import { readApiError } from "@/lib/api/json-response";
import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { walkPages } from "@/lib/supabase/paging";
import {
  LANDING_PRODUCT_TYPES,
  landingPickedProductIds,
  landingPlacedTestimonialIds,
  landingSections,
  landingSectionTextsSchema,
  missingInLandingVersion,
  type LandingSection,
  type LandingSectionInput,
} from "@/lib/landing-pages/sections";
import type { SlugResolver } from "@/lib/links/own-site";
import { LibraryService } from "@/services/library/library.service";
import { ProductsService } from "@/services/products/products.service";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import type { AppSupabaseClient } from "@/types";
import {
  defaultLandingSlug,
  hasUnpublishedChanges,
  landingCopyTitle,
  landingPictures,
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
import {
  landingProductPicks,
  type LandingProductsSectionPicks,
} from "./landing-pages.product-picks";
import { testimonialsById } from "./landing-pages.testimonials";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A working version whole, with what comparing and publishing read off it. */
const DRAFT_VERSION_COLUMNS =
  "locale, title, summary, slug, section_texts, texts_md5, share_title, share_image_id, share_image_alt, is_complete";

/** A working version for the list: no words, but their digest and completeness. */
const DRAFT_VERSION_LIST_COLUMNS =
  "locale, title, summary, slug, texts_md5, share_title, share_image_id, share_image_alt, is_complete";

const PUBLICATION_COLUMNS = `page_id, sections, sections_md5, pictures, published_at, first_published_at, versions:landing_page_publication_translations(locale, title, summary, slug, section_texts, texts_md5, share_title, share_image_id, share_image_alt)`;

/** The published copy's columns for a list: the structure, and no words. */
const PUBLICATION_SUMMARY_COLUMNS = `page_id, sections, pictures, published_at, first_published_at, versions:landing_page_publication_translations(locale, title, summary, slug)`;

/** The published copy's columns for comparing, without its words. */
const PUBLICATION_COMPARE_COLUMNS = `sections_md5, versions:landing_page_publication_translations(locale, title, summary, slug, texts_md5, share_title, share_image_id, share_image_alt)`;

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
    share_title: string;
    share_image_id: string | null;
    share_image_alt: string;
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
  sections: unknown;
  pictures: unknown;
  published_at: string;
  first_published_at: string;
  versions: readonly { locale: string; title: string; summary: string; slug: string }[];
}

interface PublicationRow extends Omit<PublicationSummaryRow, "versions"> {
  versions: readonly {
    locale: string;
    title: string;
    summary: string;
    slug: string;
    section_texts: unknown;
    share_title: string;
    share_image_id: string | null;
    share_image_alt: string;
  }[];
}

function toPublishedSummary(row: PublicationSummaryRow): PublishedLandingPageSummary {
  return {
    id: row.page_id,
    firstPublishedAt: row.first_published_at,
    publishedAt: row.published_at,
    sections: readSections(row.sections),
    pictures: landingPictures.parse(row.pictures),
    versions: inLocaleOrder(row.versions).map(({ locale, title, summary, slug }) => ({
      locale,
      title,
      summary,
      slug,
    })),
  };
}

function toPublished(row: PublicationRow): PublishedLandingPage {
  const summary = toPublishedSummary(row);
  const { sections } = summary;
  return {
    ...summary,
    versions: inLocaleOrder(row.versions).map(
      ({ locale, title, summary, slug, section_texts, share_title, share_image_id, share_image_alt }) => ({
        locale,
        title,
        summary,
        slug,
        sectionTexts: readSectionTexts(sections, section_texts),
        shareTitle: share_title,
        shareImageId: share_image_id,
        shareImageAlt: share_image_alt,
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
    share_title: version.shareTitle,
    share_image_id: version.shareImageId,
    share_image_alt: version.shareImageAlt,
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
   * takes it, by the TypeScript half of the required-text rule; the page
   * carries the current words of every testimonial its working copy places;
   * and each products section of the working copy, which of its picks readers
   * are shown now and why the others are not.
   */
  async getAdminPage(id: string): Promise<AdminLandingPage | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("landing_pages")
      .select(
        `id, sections, sections_md5, pictures, created_at, updated_at, last_saved_via, ${LAST_SAVER_EMBED}, versions:landing_page_translations(${DRAFT_VERSION_COLUMNS}), publication:landing_page_publications(${PUBLICATION_COLUMNS})`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const sections = readSections(data.sections);
    const pictures = landingPictures.parse(data.pictures);
    const draft: LandingPageDraft = {
      id: data.id,
      sections,
      pictures,
      versions: inLocaleOrder(data.versions).map((version) => {
        const sectionTexts = readSectionTexts(sections, version.section_texts);
        return {
          locale: version.locale,
          title: version.title,
          summary: version.summary,
          slug: version.slug,
          sectionTexts,
          shareTitle: version.share_title,
          shareImageId: version.share_image_id,
          shareImageAlt: version.share_image_alt,
          missing: missingInLandingVersion(sections, {
            title: version.title,
            summary: version.summary,
            slug: version.slug,
            sectionTexts,
          }),
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
      testimonials: await this.testimonialWords(sections),
      productPicks: await this.productPicksOf(sections),
    };
  }

  /**
   * The words of the testimonials a structure places, read from the store
   * under the admin's own policy; a structure placing none reads nothing.
   */
  private async testimonialWords(
    sections: readonly LandingSection[],
  ): Promise<Record<string, PublicTestimonial>> {
    const ids = landingPlacedTestimonialIds(sections);
    if (ids.length === 0) return {};
    return testimonialsById(await new TestimonialsService(this.supabase).listTestimonialWords(ids));
  }

  /**
   * Each products section's picks, shown or not and why: the listing of every
   * product type asked about the picks — the answer the public page draws by —
   * and the picks' own rows for the reasons. A structure with no products
   * section reads nothing.
   */
  private async productPicksOf(
    sections: readonly LandingSection[],
  ): Promise<LandingProductsSectionPicks[]> {
    const ids = landingPickedProductIds(sections);
    if (ids.length === 0) return [];
    const products = new ProductsService(this.supabase);
    const [listed, facts] = await Promise.all([
      products.listVisibleListingAmong(LANDING_PRODUCT_TYPES, ids),
      products.getListingFacts(ids),
    ]);
    return landingProductPicks(
      sections,
      new Set(listed.map((row) => row.id)),
      facts,
      new Date(),
    );
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
   * Save one language version of the working copy — its title, summary, slug,
   * every section's words and the share card in that language — creating it
   * when the language is new. No other version, and not the structure, is
   * touched.
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
      p_share_title: payload.share_title,
      p_share_image_id: payload.share_image_id ?? undefined,
      p_share_image_alt: payload.share_image_alt,
    });

    if (error) throw error;
    if (!data) throw new Error("save_landing_page_version returned no id");
    return data;
  }

  /**
   * Remove one language version from the working copy — its title, summary,
   * slug and words. A live language stays live until the next publish takes
   * it down. The database refuses the page's last language with
   * `check_violation`, and a language the page does not have with
   * `no_data_found`.
   */
  async removeVersion(id: string, locale: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("remove_landing_page_version", {
      p_id: id,
      p_locale: locale,
    });

    if (error) throw error;
    if (!data) throw new Error("remove_landing_page_version returned no id");
    return data;
  }

  /**
   * Clone a page's working copy into a new, unpublished page, in one database
   * call. Returns the new page's id.
   *
   * Everything is copied verbatim — the structure with its pictures, and each
   * language's summary and words — except that every section and item takes
   * a new id (the words re-keyed with them, by the database) and each
   * language's title is marked as a copy in that language's own word, from
   * `copyMarker`. Its slug is derived from the new title as any version
   * without one takes its title's, and numbered by the database (`-2`, `-3`,
   * …) when another page already holds it in that locale. Only `source`'s
   * versions are named, and each must still be on the page; the database
   * refuses an id no page has with `no_data_found`.
   *
   * No words are sent, so the link hook has nothing to see: the copied words'
   * links were made canonical when they were saved.
   */
  async clonePage(
    source: Pick<LandingPageDraft, "id" | "versions">,
    copyMarker: (locale: SupportedLocale) => Promise<string>,
  ): Promise<string> {
    const versions = await Promise.all(
      source.versions.map(async (version) => {
        const title = landingCopyTitle(version.title, await copyMarker(version.locale));
        return { locale: version.locale, title, default_slug: defaultLandingSlug(title) };
      }),
    );

    const { data, error } = await this.supabase.rpc("clone_landing_page", {
      p_id: source.id,
      p_versions: versions,
    });

    if (error) throw error;
    if (!data) throw new Error("clone_landing_page returned no id");
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

  /**
   * Publish from the browser — the admin's status page. The publish runs on
   * the server, through the admin's publication route, which then tells search
   * engines what changed (`src/lib/indexnow/`); the server side calls
   * `publishPage` there. A refusal arrives as an `ApiError` carrying the
   * database's sentence and code, so `landingWriteFailure` reads it as it
   * would the database's own.
   */
  async publishPageViaRoute(id: string): Promise<void> {
    await this.changePublicationViaRoute(id, "PUT", "Failed to publish the page");
  }

  /** Unpublish from the browser, through the same route as `publishPageViaRoute`. */
  async unpublishPageViaRoute(id: string): Promise<void> {
    await this.changePublicationViaRoute(id, "DELETE", "Failed to unpublish the page");
  }

  private async changePublicationViaRoute(
    id: string,
    method: "PUT" | "DELETE",
    fallback: string,
  ): Promise<void> {
    const response = await fetch(
      `/api/admin/landing-pages/${encodeURIComponent(id)}/publication`,
      { method },
    );
    if (!response.ok) throw await readApiError(response, fallback);
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  /**
   * Every published page, newest first by the date it first went live, with
   * its live structure and every live version's short fields, and no words —
   * what the `/discover` index, the sitemap and `llms.txt` read. Walked,
   * because pages only grow.
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
      // exact-locale: a slug resolves only in its own locale
      .eq("locale", locale)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    return data ? this.getPublishedPage(data.page_id) : null;
  }
}
