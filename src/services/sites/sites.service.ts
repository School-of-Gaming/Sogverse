import type { QueryData } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/types";
import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import {
  SITE_DETAILS_COLUMNS,
  SITE_PRODUCT_COLUMNS,
  SITE_PRODUCT_TALLY_COLUMNS,
  SITE_STAFF_DETAILS_COLUMNS,
} from "./sites.contracts";

/**
 * A site as the people who *manage* it deal with it, rather than as a node of
 * the geography.
 *
 * **Why this is not on `LocationsService`.** The tree service owns the
 * `locations` table and every rule about reading it — the column literal, the
 * embed form, the total order, which reads may see a retired row — and the
 * admin sites table's paged read lives there for exactly that reason: it is a
 * `locations` read and belongs under the sweep that polices them. What lives
 * here is everything that is *not* a locations read: the two detail tables
 * hanging off a site, and the products pointing at one. Those are three other
 * tables with three other policies, and putting them on the tree service would
 * make it the service for "anything a place is mentioned in".
 *
 * Every read runs on the injected client. Both write paths this feature uses
 * already exist as admin routes, so there is no `fetch()` method here at all —
 * the rename goes through `LocationsService.updateLocation` and the address and
 * both notes through the site-notes mutation in the products service.
 */

/**
 * The three editable fields that live beside a site row, folded into one shape.
 *
 * They come from two tables with two different audiences, and the split is the
 * point: `site_details` is member-visible (a family reads the address and the
 * note), `site_staff_details` is not. Both rows are **sparse** — a site nobody
 * has written anything about has neither — so every field here is nullable and
 * "no row" and "an empty field" are deliberately the same answer to a reader.
 */
export interface SiteNotes {
  address: string | null;
  /** The note families read. Stored on `site_details`. */
  memberNote: string | null;
  /** The note only gedus and admins see. Stored on `site_staff_details`. */
  staffNote: string | null;
}

function buildSiteProductsQuery(
  supabase: AppSupabaseClient,
  locationId: string,
  from: number,
  to: number,
) {
  return (
    supabase
      .from("products")
      .select(SITE_PRODUCT_COLUMNS, { count: "exact" })
      .eq("location_id", locationId)
      // Newest first is how every admin product list reads, and `id` behind it
      // is what makes the order total: two products created in one transaction
      // share a `created_at`, and a tie straddling a page boundary is how a
      // walk both repeats a row and drops another.
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
}

/** One product connected to a site, as the site page's list renders it. */
export type SiteProductRow = QueryData<
  ReturnType<typeof buildSiteProductsQuery>
>[number];

export class SitesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The address and both notes for one site.
   *
   * Two reads rather than one embed: the tables have different audiences and
   * different policies, and a PostgREST embed between two tables that share
   * only a foreign key to a third would have to hang off `locations` — which
   * would make this a locations read carrying two payloads nothing else wants.
   * Both are single-row lookups by primary key, issued together.
   *
   * A missing row is not an error. Nobody has written anything about this site
   * yet, which is the overwhelmingly common state and reads as three empty
   * fields.
   */
  async getSiteNotes(locationId: string): Promise<SiteNotes> {
    const [member, staff] = await Promise.all([
      this.supabase
        .from("site_details")
        .select(SITE_DETAILS_COLUMNS)
        .eq("location_id", locationId)
        .maybeSingle(),
      this.supabase
        .from("site_staff_details")
        .select(SITE_STAFF_DETAILS_COLUMNS)
        .eq("location_id", locationId)
        .maybeSingle(),
    ]);

    if (member.error) throw member.error;
    if (staff.error) throw staff.error;

    return {
      address: member.data?.address ?? null,
      memberNote: member.data?.notes ?? null,
      staffNote: staff.data?.notes ?? null,
    };
  }

  /**
   * Every product whose `location_id` is this site.
   *
   * Walked rather than paged: the page renders the whole list, and nothing
   * about the query bounds it — a long-running venue accumulates a club per
   * term for as long as it is in use. A filter that matches few rows today is
   * not a bound.
   *
   * **Read by equality on `location_id`, and that is right here where it is
   * wrong elsewhere.** The rule against comparing `location_id` to a place id
   * is about *municipality* membership, where an in-person club points one
   * level deeper and an equality test silently keeps only the online half.
   * A site is a leaf: nothing sits below it, so a product at this building
   * points at this row and at no other.
   */
  async getProductsAtSite(locationId: string): Promise<SiteProductRow[]> {
    return walkPages("getProductsAtSite", (from, to) =>
      buildSiteProductsQuery(this.supabase, locationId, from, to),
    );
  }

  /**
   * How many products each of the given sites carries.
   *
   * PostgREST has no GROUP BY, so the tally is done here: the read asks for one
   * column of the products at those sites and counts them.
   *
   * **The key list is chunked, and both halves of the read need it.** The caller
   * is the admin sites table, which holds every site there is — so an unchunked
   * `in.(…)` grows with the table until a proxy refuses the URL, which is the
   * bound the shared chunk size exists for. Within a chunk the rows are *not*
   * one-per-key (a site carries many products), so each chunk is walked rather
   * than trusted to fit: chunking bounds the request, the walk bounds the
   * response, and neither substitutes for the other.
   *
   * Every requested id gets an entry, including the ones with no products at
   * all. A caller rendering a count needs zero to be an answer rather than an
   * absence, or a site with nothing at it is indistinguishable from one whose
   * tally has not landed.
   */
  async getProductCountsBySite(
    siteIds: readonly string[],
  ): Promise<Record<string, number>> {
    const wanted = [...new Set(siteIds)].sort();
    if (wanted.length === 0) return {};

    const counts: Record<string, number> = {};
    for (const id of wanted) counts[id] = 0;

    for (const batch of chunkKeys(wanted)) {
      const rows = await walkPages("getProductCountsBySite", (from, to) =>
        this.supabase
          .from("products")
          .select(SITE_PRODUCT_TALLY_COLUMNS, { count: "exact" })
          .in("location_id", batch)
          // The primary key alone is a total order, and this read has no order
          // it would rather have — nothing downstream reads the sequence.
          .order("id")
          .range(from, to),
      );
      for (const row of rows) {
        const id = row.location_id;
        if (id !== null && id in counts) counts[id] += 1;
      }
    }
    return counts;
  }
}
