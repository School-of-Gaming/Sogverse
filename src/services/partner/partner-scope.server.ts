import "server-only";

import {
  effectiveStatus,
  type EffectiveProductStatus,
} from "@/lib/products/effective-status";
import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import type { PartnerEnrolmentStatus } from "./partner.contracts";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  LIVE_SEAT_STATUSES,
  PROGRAMME_TERMS_SLUG,
} from "./partner-shared-values";

/**
 * What the partner API may see at all: the Programme's products and the live
 * seats on them. Every resource is a view of this scope, so it is defined once.
 *
 * Every read takes the client as its first argument (see
 * `partner-shared-db.server.ts`), walks anything not bounded by construction,
 * and chunks every key list — `src/lib/supabase/CLAUDE.md`.
 */

// ---------------------------------------------------------------------------
// Programme products
// ---------------------------------------------------------------------------

/**
 * Every Programme product's id (D2), ascending. Walked: one row per product that
 * requires the Programme's terms, which grows with every term the Programme
 * runs.
 */
export async function readProgrammeProductIds(db: PartnerDb): Promise<string[]> {
  const rows = await walkPages("partner programme products", (from, to) =>
    db
      .from("product_required_consents")
      .select("product_id", { count: "exact" })
      .eq("document_slug", PROGRAMME_TERMS_SLUG)
      .order("product_id")
      .range(from, to),
  );
  return rows.map((row) => row.product_id);
}

// ---------------------------------------------------------------------------
// In-scope seats
// ---------------------------------------------------------------------------

/**
 * The embed that scopes a `participations` select to Programme products,
 * without a product id list in the URL: an inner join through the seat's
 * product to that product's requirement of the Programme's terms. Use it with
 * `IN_SCOPE_SEAT_FILTER`, and the live statuses, on a keyset page over seats:
 *
 *   db.from("participations")
 *     .select(`id, product_id, ${IN_SCOPE_SEAT_EMBED}`, { count: "exact" })
 *     .in("status", LIVE_SEAT_STATUSES)
 *     .eq(IN_SCOPE_SEAT_FILTER, PROGRAMME_TERMS_SLUG)
 *     .order("id")
 *
 * Both `!inner`s are load-bearing: without them the filter narrows only the
 * embedded array and every seat still comes back. The embed adds a small
 * `programme` object to each row, which a record builder ignores.
 */
export const IN_SCOPE_SEAT_EMBED =
  "programme:products!inner(programme_terms:product_required_consents!inner(document_slug))";

/** The embedded column `IN_SCOPE_SEAT_EMBED` is filtered on. */
export const IN_SCOPE_SEAT_FILTER = "programme.programme_terms.document_slug";

/** A live seat on a Programme product — the unit every family-facing resource starts from. */
export interface InScopeSeat {
  id: string;
  product_id: string;
  group_id: string | null;
  participant_id: string;
  customer_id: string;
  status: PartnerEnrolmentStatus;
  signed_up_at: string;
}

/** Narrow by who holds or pays for the seat; omit to read every in-scope seat. */
export interface InScopeSeatFilter {
  participantIds?: readonly string[];
  customerIds?: readonly string[];
}

const SEAT_COLUMNS = `id, product_id, group_id, participant_id, customer_id, status, signed_up_at, ${IN_SCOPE_SEAT_EMBED}`;

function isLiveStatus(status: string): status is PartnerEnrolmentStatus {
  return (LIVE_SEAT_STATUSES as readonly string[]).includes(status);
}

/**
 * Every in-scope seat — live, on a Programme product — optionally narrowed to
 * seats held by `participantIds` or paid for by `customerIds` (a seat matching
 * either is returned once). Ascending by seat id.
 *
 * For a resource that needs the whole set to assemble its records (families,
 * campaign funnels). A resource that pages seats one to one — enrolments,
 * research rows — pages its own select with `IN_SCOPE_SEAT_EMBED` instead of
 * reading all of them per request.
 */
export async function readInScopeSeats(
  db: PartnerDb,
  filter: InScopeSeatFilter = {},
): Promise<InScopeSeat[]> {
  const base = () =>
    db
      .from("participations")
      .select(SEAT_COLUMNS, { count: "exact" })
      .in("status", LIVE_SEAT_STATUSES)
      .eq(IN_SCOPE_SEAT_FILTER, PROGRAMME_TERMS_SLUG);

  type Row = Awaited<ReturnType<typeof base>>["data"];
  const rows: NonNullable<Row> = [];

  if (filter.participantIds === undefined && filter.customerIds === undefined) {
    rows.push(
      ...(await walkPages("partner in-scope seats", (from, to) =>
        base().order("id").range(from, to),
      )),
    );
  } else {
    // Chunked for the URL, walked for the rows: one person holds many seats
    // over the terms, so a chunk of keys is not a bound on what comes back.
    for (const chunk of chunkKeys([...(filter.participantIds ?? [])])) {
      rows.push(
        ...(await walkPages("partner in-scope seats by participant", (from, to) =>
          base().in("participant_id", chunk).order("id").range(from, to),
        )),
      );
    }
    for (const chunk of chunkKeys([...(filter.customerIds ?? [])])) {
      rows.push(
        ...(await walkPages("partner in-scope seats by customer", (from, to) =>
          base().in("customer_id", chunk).order("id").range(from, to),
        )),
      );
    }
  }

  const seats = new Map<string, InScopeSeat>();
  for (const row of rows) {
    // The query filters on the live statuses, so this narrows a type and
    // refuses nothing the database did not already refuse.
    if (!isLiveStatus(row.status)) {
      throw new Error(`partner in-scope seats: seat ${row.id} came back ${row.status}`);
    }
    seats.set(row.id, {
      id: row.id,
      product_id: row.product_id,
      group_id: row.group_id,
      participant_id: row.participant_id,
      customer_id: row.customer_id,
      status: row.status,
      signed_up_at: row.signed_up_at,
    });
  }
  return [...seats.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Product status
// ---------------------------------------------------------------------------

/**
 * Each product's effective status at `now` — the same derivation the database's
 * `effective_status()` makes, from the same columns and the maintained count of
 * active seats — batched rather than one RPC per product. An id with no product
 * is absent from the map.
 */
export async function readEffectiveStatuses(
  db: PartnerDb,
  productIds: readonly string[],
  now: Date,
): Promise<Map<string, EffectiveProductStatus>> {
  const wanted = [...new Set(productIds)];
  const statuses = new Map<string, EffectiveProductStatus>();

  for (const chunk of chunkKeys(wanted)) {
    // Both keyed on the product id, one row per key: bounded by the chunk.
    const [products, counts] = await Promise.all([
      db
        .from("products")
        .select("id, start_date, end_date, signup_threshold, timezone")
        .in("id", chunk),
      db
        .from("product_seat_counts")
        .select("product_id, active_count")
        .in("product_id", chunk),
    ]);
    if (products.error) throw products.error;
    if (counts.error) throw counts.error;

    const active = new Map(
      counts.data.map((row) => [row.product_id, row.active_count]),
    );
    for (const product of products.data) {
      statuses.set(
        product.id,
        effectiveStatus(product, now, active.get(product.id) ?? 0),
      );
    }
  }
  return statuses;
}
