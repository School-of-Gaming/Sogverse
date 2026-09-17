import "server-only";

import { z } from "zod";

import { readPartnerPage } from "@/lib/api/partner-cursor.server";
import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import type { PartnerProduct, PartnerProductsQuery } from "./partner.contracts";
import { readEffectiveStatuses } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import { readPlaces, readProductNames } from "./partner-shared-lookups.server";
import { PROGRAMME_TERMS_SLUG, toUtcIso } from "./partner-shared-values";

/**
 * `/products` — the Programme catalogue: every product that requires the
 * Programme's terms (D2), listed or not, one record per product, paged by
 * product id.
 */

/**
 * The embed that scopes a `products` select to the Programme: an inner join to
 * the product's requirement of the Programme's terms, filtered on
 * `PROGRAMME_SCOPE_FILTER`. The `!inner` is load-bearing — without it the filter
 * narrows only the embedded array and every product still comes back.
 */
const PROGRAMME_SCOPE_EMBED =
  "programme_terms:product_required_consents!inner(document_slug)";
const PROGRAMME_SCOPE_FILTER = "programme_terms.document_slug";

const PRODUCT_COLUMNS = `id, product_type, is_remote, for_gamers, for_parents, location_id, start_date, end_date, timezone, min_age, max_age, created_at, ${PROGRAMME_SCOPE_EMBED}`;

/** A product's groups as the record lists them. */
type ProductGroup = PartnerProduct["groups"][number];

/**
 * Each product's groups, keyed by product id, in the order the admin's group
 * board shows them (created, then id). Walked per chunk: a product has as many
 * groups as an admin makes, so the chunk bounds only the URL.
 */
async function readGroups(
  db: PartnerDb,
  productIds: readonly string[],
): Promise<Map<string, ProductGroup[]>> {
  const groups = new Map<string, ProductGroup[]>();
  for (const chunk of chunkKeys([...new Set(productIds)])) {
    const rows = await walkPages("partner product groups", (from, to) =>
      db
        .from("product_groups")
        .select("id, product_id, name", { count: "exact" })
        .in("product_id", chunk)
        .order("product_id")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
    for (const row of rows) {
      const list = groups.get(row.product_id) ?? [];
      list.push({ id: row.id, name: row.name });
      groups.set(row.product_id, list);
    }
  }
  return groups;
}

/**
 * One page of the Programme catalogue, ascending by product id.
 *
 * **`status` is derived, so it cannot be a database filter.** A product's
 * effective status is a function of its dates, its threshold, the live seat
 * count and `now` — nothing is stored to filter on. The page reader walks every
 * Programme product in id order and the build drops the ones whose status does
 * not match, deciding each batch's statuses before enriching the survivors, so a
 * narrow filter costs a status read per batch and nothing more. Dropping rather
 * than narrowing the fetch is also what keeps the keyset exact: the cursor is a
 * position in the one order every page walks, whatever each product's status.
 *
 * A product with no translation at all, or a gamer product without its ages,
 * throws: the database refuses both, so either is a broken invariant, and a
 * loud 500 beats a record the contract would have to lie about.
 */
export async function readPartnerProducts(
  db: PartnerDb,
  query: PartnerProductsQuery,
  now: Date,
): Promise<{ data: PartnerProduct[]; next_cursor: string | null }> {
  const keyOf = (row: { id: string }) => row.id;

  return readPartnerPage({
    resource: "products",
    query,
    key: z.string().uuid(),
    keyOf,
    fetch: (after, take) => {
      const base = db
        .from("products")
        .select(PRODUCT_COLUMNS, { count: "exact" })
        .eq(PROGRAMME_SCOPE_FILTER, PROGRAMME_TERMS_SLUG);
      return (after === null ? base : base.gt("id", after))
        .order("id")
        .limit(take);
    },
    build: async (rows) => {
      const statuses = await readEffectiveStatuses(
        db,
        rows.map((row) => row.id),
        now,
      );
      const statusOf = (id: string) => {
        const status = statuses.get(id);
        if (status === undefined) {
          throw new Error(`partner products: product ${id} has no effective status`);
        }
        return status;
      };
      const kept = rows.filter(
        (row) => query.status === undefined || statusOf(row.id) === query.status,
      );

      const [names, places, groups] = await Promise.all([
        readProductNames(db, kept.map((row) => row.id)),
        readPlaces(
          db,
          kept.flatMap((row) => (row.location_id === null ? [] : [row.location_id])),
        ),
        readGroups(db, kept.map((row) => row.id)),
      ]);

      const placeOf = (locationId: string) => {
        const place = places.get(locationId);
        // The foreign key restricts deleting a location a product points at.
        if (place === undefined) {
          throw new Error(`partner products: location ${locationId} does not exist`);
        }
        return place.place;
      };

      const keptIds = new Set(kept.map((row) => row.id));
      return rows.map((row): PartnerProduct | null => {
        if (!keptIds.has(row.id)) return null;

        const name = names.get(row.id);
        if (name === undefined) {
          throw new Error(`partner products: product ${row.id} has no translation`);
        }

        let age_range: PartnerProduct["age_range"] = null;
        if (row.for_gamers) {
          if (row.min_age === null || row.max_age === null) {
            throw new Error(`partner products: gamer product ${row.id} has no age range`);
          }
          age_range = { min: row.min_age, max: row.max_age };
        }

        return {
          id: row.id,
          name,
          type: row.product_type,
          delivery: row.is_remote ? "online" : "in_person",
          audience: { gamers: row.for_gamers, parents: row.for_parents },
          location: row.location_id === null ? null : placeOf(row.location_id),
          status: statusOf(row.id),
          start_date: row.start_date,
          end_date: row.end_date,
          timezone: row.timezone,
          age_range,
          groups: groups.get(row.id) ?? [],
          created_at: toUtcIso(row.created_at),
        };
      });
    },
  });
}
