import "server-only";

import { z } from "zod";

import { readPartnerPage } from "@/lib/api/partner-cursor.server";
import { possibleAgeOnDate } from "@/lib/gamer-age-eligibility";
import type {
  PartnerResearchRow,
  PartnerRobloxResearchQuery,
} from "./partner.contracts";
import {
  IN_SCOPE_SEAT_EMBED,
  IN_SCOPE_SEAT_FILTER,
} from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  creationKey,
  readCreations,
  readPlaces,
  readProductNames,
  readRobloxAccounts,
} from "./partner-shared-lookups.server";
import {
  LIVE_SEAT_STATUSES,
  PROGRAMME_TERMS_SLUG,
  productDelivery,
} from "./partner-shared-values";

/**
 * `/roblox-research`: the dataset the Programme's privacy policy allows to be
 * passed to Roblox — one row per in-scope seat a CHILD holds, in every live
 * status, paged in the order of the seat each row derives from.
 *
 * **The row names nobody.** Nothing on it identifies the child or the family:
 * the Roblox account, the parent's home municipality, an age range and the
 * activity. The seat id is the paging key, so it travels inside the cursor —
 * which is only a position, never a field of a row — and the row builder
 * below is the one place that decides what leaves; the response schema admits
 * nothing else.
 *
 * Scope and the two filters go to the database: the seat must be live on a
 * Programme product, its participant a gamer (a seat a parent holds themselves
 * has no row), and `product_id`, `from` and `to` narrow on the seat's product.
 * One rule cannot: a child with no Roblox username on file yields no row,
 * because the row is the Roblox account — `build` drops those.
 */

/**
 * The seat, its product and the two people behind it, each embed through the
 * foreign key it follows (a seat names a profile twice, so both are hinted).
 * The child's embed is inner so filtering on its role narrows the seats; the
 * activity's is inner so `from`/`to` on its start date do.
 */
const RESEARCH_SEAT_COLUMNS = `id, product_id, group_id, participant_id, ${IN_SCOPE_SEAT_EMBED}, child:profiles!participations_participant_id_fkey!inner(role, gamer_profiles(date_of_birth)), holder:profiles!participations_customer_id_fkey(home_location_id), activity:products!inner(product_type, is_remote, start_date, spoken_language_code)`;

const seatId = z.string().uuid();

/**
 * The activity's name: English where one has been written, else the
 * language the product is delivered in, else the locale whose code sorts
 * first. Every product carries at least one name, so none is a broken product.
 */
function activityName(
  productId: string,
  names: Record<string, string> | undefined,
  spokenLanguage: string,
): string {
  const locales = Object.keys(names ?? {}).sort();
  if (names === undefined || locales.length === 0) {
    throw new Error(`partner /roblox-research: product ${productId} has no name`);
  }
  const written = new Set(locales);
  const locale =
    ["en", spokenLanguage].find((candidate) => written.has(candidate)) ?? locales[0];
  return names[locale];
}

export async function readRobloxResearch(
  db: PartnerDb,
  query: PartnerRobloxResearchQuery,
): Promise<{ data: PartnerResearchRow[]; next_cursor: string | null }> {
  const fetchSeats = (after: string | null, take: number) => {
    let seats = db
      .from("participations")
      .select(RESEARCH_SEAT_COLUMNS, { count: "exact" })
      .in("status", LIVE_SEAT_STATUSES)
      .eq(IN_SCOPE_SEAT_FILTER, PROGRAMME_TERMS_SLUG)
      .eq("child.role", "gamer");
    if (query.product_id !== undefined) seats = seats.eq("product_id", query.product_id);
    if (query.from !== undefined) seats = seats.gte("activity.start_date", query.from);
    if (query.to !== undefined) seats = seats.lte("activity.start_date", query.to);
    if (after !== null) seats = seats.gt("id", after);
    return seats.order("id").limit(take);
  };

  type Row = NonNullable<Awaited<ReturnType<typeof fetchSeats>>["data"]>[number];
  const keyOf = (row: Row) => row.id;

  const build = async (rows: Row[]): Promise<(PartnerResearchRow | null)[]> => {
    const accounts = await readRobloxAccounts(
      db,
      rows.map((row) => row.participant_id),
    );
    // Enriched only once the account rule has spoken.
    const kept = rows.filter((row) => accounts.has(row.participant_id));

    const [places, names, creations] = await Promise.all([
      readPlaces(
        db,
        kept.flatMap((row) =>
          row.holder.home_location_id === null ? [] : [row.holder.home_location_id],
        ),
      ),
      readProductNames(
        db,
        kept.map((row) => row.product_id),
      ),
      readCreations(
        db,
        kept.flatMap((row) =>
          row.group_id === null
            ? []
            : [{ group_id: row.group_id, participant_id: row.participant_id }],
        ),
      ),
    ]);

    return rows.map((row): PartnerResearchRow | null => {
      const account = accounts.get(row.participant_id);
      if (account === undefined) return null;

      // A gamer's profile is written in the same transaction as the gamer, so
      // a child without one is a broken account, not a row to guess at.
      const dateOfBirth = row.child.gamer_profiles?.date_of_birth;
      if (dateOfBirth === undefined) {
        throw new Error(
          `partner /roblox-research: seat ${row.id} is held by a gamer with no gamer profile`,
        );
      }

      const home =
        row.holder.home_location_id === null
          ? undefined
          : places.get(row.holder.home_location_id);
      const { start_date } = row.activity;
      const published =
        row.group_id === null
          ? undefined
          : creations
              .get(creationKey(row.group_id, row.participant_id))
              ?.find((creation) => creation.is_roblox_url);

      return {
        roblox_username: account.username,
        roblox_user_id: account.user_id,
        // City and country together name the municipality; without one the
        // country still comes from the location's own chain.
        country_code: home?.place?.country_code ?? home?.country_code ?? null,
        city: home?.place?.city ?? null,
        age: start_date === null ? null : possibleAgeOnDate(dateOfBirth, start_date),
        activity: {
          product_id: row.product_id,
          name: activityName(
            row.product_id,
            names.get(row.product_id),
            row.activity.spoken_language_code,
          ),
          type: row.activity.product_type,
          delivery: productDelivery(row.activity.is_remote),
          start_date,
        },
        published_game_url: published?.url ?? null,
      };
    });
  };

  return readPartnerPage({
    resource: "roblox-research",
    query,
    key: seatId,
    fetch: fetchSeats,
    keyOf,
    build,
  });
}
