import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { walkPages } from "@/lib/supabase/paging";
import type { AppSupabaseClient } from "@/types";
import {
  spotlightInput,
  type AdminSpotlight,
  type EnabledSpotlight,
  type SpotlightInput,
  type SpotlightVersion,
} from "./spotlights.contracts";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VERSIONS_EMBED = "versions:spotlight_translations(locale, title, body)";

/**
 * The picture's catalogue entry, for its label. Unhinted, so it relies on
 * `image_id` being the only foreign key from a spotlight to the catalogue.
 */
const ADMIN_COLUMNS = `id, image_id, image_path, enabled, created_at, image_entry:catalogue_images(label), ${VERSIONS_EMBED}`;

function versionsOf(
  rows: readonly { locale: string; title: string; body: string }[],
): SpotlightVersion[] {
  return inLocaleOrder(rows).map(({ locale, title, body }) => ({
    locale,
    title,
    body,
  }));
}

/**
 * Spotlights: the admin's notes appended to every parent's session report
 * email, and
 * the read the email makes of them.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`.
 * The admin reads run under the tables' admin-only SELECT policies; the
 * email's read runs on the service-role client its route already holds. The
 * writes are admin-guarded RPCs — neither table carries a write grant, so a
 * stray `.insert()` fails closed. The picture is picked from the shared image
 * catalogue, which owns its uploads; a spotlight holds only the entry's id.
 *
 * **The one order is newest first**: `created_at` descending, `id` breaking a
 * tie. There is no position to sort by.
 */
export class SpotlightsService {
  constructor(private supabase: AppSupabaseClient) {}

  // -------------------------------------------------------------------------
  // Admin reads
  // -------------------------------------------------------------------------

  /**
   * Every spotlight, enabled or not, newest first, with its versions and its
   * picture. Admin-only by RLS: a non-admin caller gets an empty list rather
   * than an error.
   */
  async listAdminSpotlights(): Promise<AdminSpotlight[]> {
    const rows = await walkPages("listAdminSpotlights", (from, to) =>
      this.supabase
        .from("spotlights")
        .select(ADMIN_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
    return rows.map(toAdminSpotlight);
  }

  /**
   * One spotlight, or `null` when no spotlight has that id. The id comes off
   * an admin URL, so one that is not a UUID is answered as not found without a
   * query, which Postgres would otherwise refuse as a malformed uuid.
   */
  async getAdminSpotlight(id: string): Promise<AdminSpotlight | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("spotlights")
      .select(ADMIN_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? toAdminSpotlight(data) : null;
  }

  // -------------------------------------------------------------------------
  // The session report email's read
  // -------------------------------------------------------------------------

  /**
   * Every enabled spotlight, newest first, with every version and its
   * picture's public URL and stored size — what a session report email
   * appends, read once per send and drawn per recipient in their locale.
   *
   * Call it with the service-role client: the tables are admin-only to the
   * Data API, and the route sending the report is a gedu's. The picture is
   * always there, since an enabled spotlight cannot be without one.
   */
  async listEnabledSpotlights(): Promise<EnabledSpotlight[]> {
    const rows = await walkPages("listEnabledSpotlights", (from, to) =>
      this.supabase
        .from("spotlights")
        .select(`id, image_path, created_at, ${VERSIONS_EMBED}`, {
          count: "exact",
        })
        .eq("enabled", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );

    const { width, height } = CATALOGUE_IMAGE_PURPOSES.spotlight_image;
    return rows.map((row) => {
      // chk_spotlights_enabled_has_image and the image-path trigger make this
      // unreachable; a mail drawing an empty frame would hide it.
      if (!row.image_path) {
        throw new Error(`Enabled spotlight ${row.id} has no picture`);
      }
      return {
        id: row.id,
        versions: versionsOf(row.versions),
        image: {
          url: catalogueImageUrl("spotlight_image", row.image_path),
          width,
          height,
        },
        createdAt: row.created_at,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Admin writes
  // -------------------------------------------------------------------------

  /**
   * Create a spotlight, switched on or off as the input says. Returns its id.
   * The database refuses switching on one with no picture.
   */
  async createSpotlight(input: SpotlightInput): Promise<string> {
    const parsed = spotlightInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_spotlight", {
      p_versions: parsed.versions,
      p_enabled: parsed.enabled,
      // Null maps to an omission, so the RPC's DEFAULT NULL writes the null.
      p_image_id: parsed.imageId ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("create_spotlight returned no id");
    return data;
  }

  /**
   * Save a spotlight whole: whether it is enabled, its picture and its whole
   * version set, replacing what is stored, in one write. The database refuses
   * leaving it enabled with no picture.
   */
  async saveSpotlight(id: string, input: SpotlightInput): Promise<string> {
    const parsed = spotlightInput.parse(input);

    const { data, error } = await this.supabase.rpc("save_spotlight", {
      p_id: id,
      p_versions: parsed.versions,
      p_enabled: parsed.enabled,
      p_image_id: parsed.imageId ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("save_spotlight returned no id");
    return data;
  }

  /** Remove a spotlight outright. Its picture stays in the catalogue. */
  async deleteSpotlight(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_spotlight", { p_id: id });
    if (error) throw error;
  }
}

function toAdminSpotlight(row: {
  id: string;
  image_id: string | null;
  image_path: string | null;
  enabled: boolean;
  created_at: string;
  image_entry: { label: string } | null;
  versions: readonly { locale: string; title: string; body: string }[];
}): AdminSpotlight {
  return {
    id: row.id,
    versions: versionsOf(row.versions),
    imageId: row.image_id,
    imagePath: row.image_path,
    imageLabel: row.image_entry?.label ?? null,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}
