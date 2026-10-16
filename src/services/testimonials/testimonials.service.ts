import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { walkPages } from "@/lib/supabase/paging";
import type { AppSupabaseClient, HomeTestimonialSpot } from "@/types";
import {
  HOME_TESTIMONIAL_SPOTS,
  homeTestimonialRows,
  oauthClientNameRows,
  testimonialInput,
  testimonialVersionInput,
  type AdminTestimonial,
  type HomeTestimonials,
  type TestimonialInput,
  type TestimonialSaver,
  type TestimonialUsage,
  type TestimonialVersion,
  type TestimonialVersionInput,
} from "./testimonials.contracts";

/** The shape Postgres accepts as a `uuid`, any case. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A testimonial whole, as the admin reads it: its versions, its home spot,
 * and both savers' profiles — embedded by their constraints' names, since the
 * two are keys to the same table; an admin reads every profile.
 */
const ADMIN_COLUMNS = `id, created_at, created_via, updated_at, last_saved_via, creator:profiles!testimonials_created_by_fkey(first_name, last_name), last_saver:profiles!testimonials_last_saved_by_fkey(first_name, last_name), versions:testimonial_translations(locale, attribution, quote), home:home_testimonials(spot, position)`;

interface Profile {
  first_name: string;
  last_name: string;
}

interface AdminRow {
  id: string;
  created_at: string;
  created_via: string | null;
  updated_at: string;
  last_saved_via: string | null;
  creator: Profile | null;
  last_saver: Profile | null;
  versions: readonly { locale: string; attribution: string; quote: string }[];
  home: { spot: HomeTestimonialSpot; position: number } | null;
}

function profileName(profile: Profile | null): string | null {
  return profile ? `${profile.first_name} ${profile.last_name}`.trim() : null;
}

function versionsOf(
  rows: readonly { locale: string; attribution: string; quote: string }[],
): TestimonialVersion[] {
  return inLocaleOrder(rows).map(({ locale, attribution, quote }) => ({
    locale,
    from: attribution,
    quote,
  }));
}

/**
 * Every place a testimonial is shown, from what its row embeds. A new kind of
 * place adds its embed to the read and its member here.
 */
function usagesOf(row: Pick<AdminRow, "home">): TestimonialUsage[] {
  return row.home === null
    ? []
    : [{ kind: "home", spot: row.home.spot, position: row.home.position }];
}

/**
 * Testimonials: Marketing's store of real words from parents, gamers and
 * gedus, and the read the home page and About make of the placed ones.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`.
 * The admin reads run under the tables' admin-only SELECT policies; the
 * writes are admin-guarded RPCs — no testimonial table carries a write grant.
 * Which testimonial fills a home spot is never written here: only migrations
 * write it.
 *
 * **The admin order is most recently saved first**, `id` breaking a tie.
 */
export class TestimonialsService {
  constructor(private supabase: AppSupabaseClient) {}

  // -------------------------------------------------------------------------
  // The public read
  // -------------------------------------------------------------------------

  /**
   * The testimonials placed in the home spots, by spot in reading order —
   * what the home page and About show. Every caller gets the same answer,
   * signed in or not. Bounded by construction: six positions at most.
   */
  async listHomeTestimonials(): Promise<HomeTestimonials> {
    const { data, error } = await this.supabase.rpc("list_home_testimonials");
    if (error) throw error;

    const spots: HomeTestimonials = { feature: [], safety: [], row: [] };
    const rows = homeTestimonialRows
      .parse(data)
      .toSorted(
        (a, b) =>
          HOME_TESTIMONIAL_SPOTS.indexOf(a.spot) -
            HOME_TESTIMONIAL_SPOTS.indexOf(b.spot) || a.position - b.position,
      );
    for (const row of rows) {
      const versions = versionsOf(row.versions);
      // A testimonial always has a version; one the app cannot show in any
      // locale it ships would paint an empty quote, so it is left out.
      if (versions.length === 0) continue;
      spots[row.spot].push({ id: row.testimonial_id, versions });
    }
    return spots;
  }

  // -------------------------------------------------------------------------
  // Admin reads
  // -------------------------------------------------------------------------

  /**
   * Every testimonial, placed or not, most recently saved first, with its
   * versions, where it is shown and who created and last saved it.
   * Admin-only by RLS: a non-admin caller gets an empty list.
   */
  async listAdminTestimonials(): Promise<AdminTestimonial[]> {
    const rows = await walkPages("listAdminTestimonials", (from, to) =>
      this.supabase
        .from("testimonials")
        .select(ADMIN_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    const names = await this.oauthClientNames(
      rows.flatMap((row) => [row.created_via, row.last_saved_via]),
    );
    return rows.map((row) => toAdminTestimonial(row, names));
  }

  /**
   * One testimonial, or `null` when none has that id. An id that is not a
   * UUID is answered as not found without a query.
   */
  async getAdminTestimonial(id: string): Promise<AdminTestimonial | null> {
    if (!UUID.test(id)) return null;

    const { data, error } = await this.supabase
      .from("testimonials")
      .select(ADMIN_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const names = await this.oauthClientNames([data.created_via, data.last_saved_via]);
    return toAdminTestimonial(data, names);
  }

  private async oauthClientNames(
    clientIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const distinct = [
      ...new Set(clientIds.filter((id): id is string => id !== null)),
    ];
    const names = await Promise.all(
      distinct.map(async (id) => {
        const { data, error } = await this.supabase.rpc("get_oauth_client", {
          p_id: id,
        });
        if (error) throw error;
        return [id, oauthClientNameRows.parse(data)[0]?.client_name ?? null] as const;
      }),
    );
    return new Map(
      names.flatMap(([id, name]) => (name === null ? [] : [[id, name] as const])),
    );
  }

  // -------------------------------------------------------------------------
  // Admin writes
  // -------------------------------------------------------------------------

  /** Create a testimonial with its whole version set. Returns its id. It is placed nowhere. */
  async createTestimonial(input: TestimonialInput): Promise<string> {
    const parsed = testimonialInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_testimonial", {
      p_versions: parsed.versions.map(toVersionPayload),
    });

    if (error) throw error;
    if (!data) throw new Error("create_testimonial returned no id");
    return data;
  }

  /**
   * Save a testimonial whole — the editor's save: the whole version set,
   * replacing what is stored, so a language left out is removed.
   */
  async saveTestimonial(id: string, input: TestimonialInput): Promise<string> {
    const parsed = testimonialInput.parse(input);

    const { data, error } = await this.supabase.rpc("save_testimonial", {
      p_id: id,
      p_versions: parsed.versions.map(toVersionPayload),
    });

    if (error) throw error;
    if (!data) throw new Error("save_testimonial returned no id");
    return data;
  }

  /**
   * Write one language version alone, replacing what that language held or
   * adding it. No other version is touched.
   */
  async saveTestimonialVersion(id: string, input: TestimonialVersionInput): Promise<void> {
    const parsed = testimonialVersionInput.parse(input);

    const { error } = await this.supabase.rpc("save_testimonial_version", {
      p_id: id,
      p_locale: parsed.locale,
      p_attribution: parsed.from,
      p_quote: parsed.quote,
    });

    if (error) throw error;
  }

  /** Remove one language version. The database refuses the last one. */
  async removeTestimonialVersion(id: string, locale: string): Promise<void> {
    const { error } = await this.supabase.rpc("remove_testimonial_version", {
      p_id: id,
      p_locale: locale,
    });

    if (error) throw error;
  }
}

function toVersionPayload(version: { locale: string; from: string; quote: string }) {
  return { locale: version.locale, attribution: version.from, quote: version.quote };
}

function saver(
  profile: Profile | null,
  clientId: string | null,
  names: ReadonlyMap<string, string>,
): TestimonialSaver {
  return {
    by: profileName(profile),
    via: clientId === null ? null : { clientId, name: names.get(clientId) ?? null },
  };
}

function toAdminTestimonial(
  row: AdminRow,
  names: ReadonlyMap<string, string>,
): AdminTestimonial {
  return {
    id: row.id,
    versions: versionsOf(row.versions),
    usages: usagesOf(row),
    createdAt: row.created_at,
    created: saver(row.creator, row.created_via, names),
    updatedAt: row.updated_at,
    lastSaved: saver(row.last_saver, row.last_saved_via, names),
  };
}
