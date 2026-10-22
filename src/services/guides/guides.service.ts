import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { landingPlacedGuideIds, landingSections } from "@/lib/landing-pages/sections";
import { walkPages } from "@/lib/supabase/paging";
import { oauthClientNameRows } from "@/services/testimonials/testimonials.contracts";
import type { AppSupabaseClient } from "@/types";
import {
  GUIDES_BUCKET,
  guideDownloadRows,
  guideLabel,
  landingPageGuideRows,
  type AdminGuide,
  type GuideDownload,
  type GuideSaver,
  type GuideUsage,
  type PublicGuide,
} from "./guides.contracts";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A guide whole, as the admin reads it: its files and the savers' profiles —
 * embedded by their constraints' names, since the keys reach the same table;
 * an admin reads every profile.
 */
const ADMIN_COLUMNS = `id, label, created_at, created_via, updated_at, last_saved_via, creator:profiles!guides_created_by_fkey(first_name, last_name), last_saver:profiles!guides_last_saved_by_fkey(first_name, last_name), files:guide_files(locale, file_name, byte_size, uploaded_at, uploaded_via, uploader:profiles!guide_files_uploaded_by_fkey(first_name, last_name))`;

interface Profile {
  first_name: string;
  last_name: string;
}

interface AdminFileRow {
  locale: string;
  file_name: string;
  byte_size: number;
  uploaded_at: string;
  uploaded_via: string | null;
  uploader: Profile | null;
}

interface AdminRow {
  id: string;
  label: string;
  created_at: string;
  created_via: string | null;
  updated_at: string;
  last_saved_via: string | null;
  creator: Profile | null;
  last_saver: Profile | null;
  files: readonly AdminFileRow[];
}

function profileName(profile: Profile | null): string | null {
  return profile ? `${profile.first_name} ${profile.last_name}`.trim() : null;
}

/**
 * A landing page as the usages read it: its working titles and both copies'
 * structures, from which the guides it places are read. Walked by id, since
 * pages only grow; a structure is a handful of sections.
 */
const LANDING_USAGE_COLUMNS =
  "id, updated_at, sections, versions:landing_page_translations(locale, title), publication:landing_page_publications(sections)";

/** The guides one stored structure places. */
function placedIn(sections: unknown): Set<string> {
  return new Set(landingPlacedGuideIds(landingSections.parse(sections)));
}

/** A guide's files as a page shows them: language and size, in locale order. */
function publicFiles(
  rows: readonly { locale: string; byte_size: number }[],
): PublicGuide["files"] {
  return inLocaleOrder(rows).map(({ locale, byte_size }) => ({ locale, byteSize: byte_size }));
}

/**
 * Guides: Marketing's store of PDFs a landing page hands out, the read a live
 * landing page makes of the ones it places, and the download route's read.
 *
 * Every method runs on the injected client. The admin reads run under the
 * tables' admin-only SELECT policies; the writes here are admin-guarded RPCs —
 * no guide table carries a write grant. A file's upload is not here: its
 * bytes go to the private bucket on the service-role client, which only the
 * server-side store function holds (`guides.server.ts`).
 *
 * **The admin order is most recently saved first**, `id` breaking a tie.
 */
export class GuidesService {
  constructor(private supabase: AppSupabaseClient) {}

  // -------------------------------------------------------------------------
  // The public reads
  // -------------------------------------------------------------------------

  /**
   * The guides one live landing page places, each once, with which languages
   * have a file and each file's size — read from the store, so a replaced file
   * shows without a republish. Only the published copy is read: an
   * unpublished page, or a guide placed only in a working copy, answers
   * nothing. A guide with no file in a language the app ships is left out.
   */
  async listLandingPageGuides(pageId: string): Promise<PublicGuide[]> {
    if (!UUID.test(pageId)) return [];
    const { data, error } = await this.supabase.rpc("list_landing_page_guides", {
      p_page_id: pageId,
    });
    if (error) throw error;
    return landingPageGuideRows.parse(data).flatMap((row) => {
      const files = publicFiles(row.files);
      return files.length === 0 ? [] : [{ id: row.guide_id, files }];
    });
  }

  /**
   * The file of one guide this caller downloads in `locale`, or null when
   * they may download none of it: the reader's language, else English, else
   * the first uploaded, picked by the app's one picker from every file the
   * database lets the caller have. The database decides who may: any signed-in
   * account for a guide a live page places, an admin for any guide. Run it on
   * the reader's own session — never the service role, which the database
   * would answer for anyone.
   */
  async getGuideDownload(guideId: string, locale: SupportedLocale): Promise<GuideDownload | null> {
    if (!UUID.test(guideId)) return null;
    const { data, error } = await this.supabase.rpc("get_guide_download_files", {
      p_guide_id: guideId.toLowerCase(),
    });
    if (error) throw error;
    const files = inLocaleOrder(guideDownloadRows.parse(data));
    const file = resolveTranslation(files, locale);
    return file === null
      ? null
      : {
          locale: file.locale,
          storagePath: file.storage_path,
          fileName: file.file_name,
          byteSize: file.byte_size,
        };
  }

  // -------------------------------------------------------------------------
  // Admin reads
  // -------------------------------------------------------------------------

  /**
   * Every guide, most recently saved first, with its files, where it is
   * offered and who created and last saved it. Admin-only by RLS: a non-admin
   * caller gets an empty list.
   */
  async listAdminGuides(): Promise<AdminGuide[]> {
    const rows = await walkPages("listAdminGuides", (from, to) =>
      this.supabase
        .from("guides")
        .select(ADMIN_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    const [names, landing] = await Promise.all([
      this.oauthClientNames(rows.flatMap(clientIdsOf)),
      this.landingUsages(),
    ]);
    return rows.map((row) => toAdminGuide(row, names, landing));
  }

  /**
   * One guide, or `null` when none has that id. An id that is not a UUID is
   * answered as not found without a query.
   */
  async getAdminGuide(id: string): Promise<AdminGuide | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("guides")
      .select(ADMIN_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const [names, landing] = await Promise.all([
      this.oauthClientNames(clientIdsOf(data)),
      this.landingUsages(),
    ]);
    return toAdminGuide(data, names, landing);
  }

  /**
   * The guides with these ids as a page shows them — what an admin's landing
   * page status and preview read for a working copy, which the public read
   * never answers. Admin-only by RLS. An id no guide has is simply absent.
   */
  async listGuideSummaries(ids: readonly string[]): Promise<PublicGuide[]> {
    const wanted = ids.filter((id) => UUID.test(id));
    if (wanted.length === 0) return [];
    const { data, error } = await this.supabase
      .from("guides")
      .select("id, files:guide_files(locale, byte_size)")
      .in("id", wanted);
    if (error) throw error;
    return data.flatMap((row) => {
      const files = publicFiles(row.files);
      return files.length === 0 ? [] : [{ id: row.id, files }];
    });
  }

  /**
   * Each guide's usages, by guide id: every landing page whose working or live
   * copy places it, most recently saved first. Reads the pages' structures and
   * titles, never their words.
   */
  private async landingUsages(): Promise<Map<string, GuideUsage[]>> {
    const pages = await walkPages("listLandingGuideUsages", (from, to) =>
      this.supabase
        .from("landing_pages")
        .select(LANDING_USAGE_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    const usages = new Map<string, GuideUsage[]>();
    for (const page of pages) {
      const working = placedIn(page.sections);
      const live = page.publication === null ? new Set<string>() : placedIn(page.publication.sections);
      const titles = inLocaleOrder(page.versions).map(({ locale, title }) => ({ locale, title }));
      for (const id of new Set([...working, ...live])) {
        const list = usages.get(id) ?? [];
        list.push({
          pageId: page.id,
          titles,
          inLiveCopy: live.has(id),
          inWorkingCopy: working.has(id),
        });
        usages.set(id, list);
      }
    }
    return usages;
  }

  private async oauthClientNames(
    clientIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const distinct = [...new Set(clientIds.filter((id): id is string => id !== null))];
    const names = await Promise.all(
      distinct.map(async (id) => {
        const { data, error } = await this.supabase.rpc("get_oauth_client", { p_id: id });
        if (error) throw error;
        return [id, oauthClientNameRows.parse(data)[0]?.client_name ?? null] as const;
      }),
    );
    return new Map(names.flatMap(([id, name]) => (name === null ? [] : [[id, name] as const])));
  }

  // -------------------------------------------------------------------------
  // Admin writes
  // -------------------------------------------------------------------------

  /** Save a guide's label. No file is touched. */
  async saveGuideLabel(id: string, label: string): Promise<void> {
    const parsed = guideLabel.parse(label);
    const { error } = await this.supabase.rpc("save_guide_label", { p_id: id, p_label: parsed });
    if (error) throw error;
  }

  /**
   * Remove one language's file, then its object. The database refuses the
   * last file. The object goes on the same session, which the bucket's admin
   * delete policy admits; one left behind by a failed delete is unreachable —
   * the bucket is private and no row names it — so it is logged, not thrown,
   * since the removal the admin asked for has happened.
   */
  async removeGuideFile(id: string, locale: string): Promise<void> {
    const { data: removed, error } = await this.supabase.rpc("remove_guide_file", {
      p_id: id,
      p_locale: locale,
    });
    if (error) throw error;
    if (!removed) return;
    const { error: storageError } = await this.supabase.storage.from(GUIDES_BUCKET).remove([removed]);
    if (storageError) console.error("[guides] removed file's object was not deleted", storageError);
  }
}

function clientIdsOf(row: AdminRow): (string | null)[] {
  return [row.created_via, row.last_saved_via, ...row.files.map((file) => file.uploaded_via)];
}

function saver(
  profile: Profile | null,
  clientId: string | null,
  names: ReadonlyMap<string, string>,
): GuideSaver {
  return {
    by: profileName(profile),
    via: clientId === null ? null : { clientId, name: names.get(clientId) ?? null },
  };
}

function toAdminGuide(
  row: AdminRow,
  names: ReadonlyMap<string, string>,
  landing: ReadonlyMap<string, GuideUsage[]>,
): AdminGuide {
  return {
    id: row.id,
    label: row.label,
    files: inLocaleOrder(row.files).map((file) => ({
      locale: file.locale,
      fileName: file.file_name,
      byteSize: file.byte_size,
      uploadedAt: file.uploaded_at,
      uploaded: saver(file.uploader, file.uploaded_via, names),
    })),
    usages: landing.get(row.id) ?? [],
    createdAt: row.created_at,
    created: saver(row.creator, row.created_via, names),
    updatedAt: row.updated_at,
    lastSaved: saver(row.last_saver, row.last_saved_via, names),
  };
}
