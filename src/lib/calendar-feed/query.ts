import type { QueryData, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { FeedSeat } from "./events";
import { sandboxDefinitionSchema, type SandboxDefinition } from "./sandbox";

/**
 * The reads behind the subscribed calendar feed.
 *
 * **There is no session here.** A calendar app polls with no cookie and no
 * bearer token — the signed token in the path is the whole of the
 * authorization — so every family-enumeration path in `src/services/` is
 * useless: they are all `auth.uid()`-scoped. These reads take an injected
 * client (the route hands them the service-role one) and are filtered
 * explicitly on the **verified** customer id instead. That explicit filter is
 * the only thing standing between one family's feed and another's, which is why
 * it is applied in the query builder rather than left to a caller.
 *
 * The select mirrors the family dashboard's upcoming-sessions read, so the feed
 * and the dashboard expand the same columns through the same arithmetic and
 * cannot disagree about when a session is.
 */

type Client = SupabaseClient<Database>;

function buildFeedParticipationsQuery(supabase: Client, customerId: string) {
  return supabase
    .from("participations")
    .select(
      `
        id,
        participant_id,
        group_id,
        product:products!inner(
          id, product_type, timezone, start_date, end_date, is_remote,
          spoken_language_code,
          product_translations(*),
          schedule_slots(weekday, start_time, duration_minutes),
          location:locations(name, name_i18n)
        ),
        participant:profiles!participations_participant_id_fkey!inner(
          first_name
        )
      `,
    )
    .eq("customer_id", customerId)
    .eq("status", "active");
}

/** One seat the feed covers, inferred from the query so the two cannot drift. */
export type FeedParticipationRow = QueryData<
  ReturnType<typeof buildFeedParticipationsQuery>
>[number];

/** Who the feed is for: the name on it, and the locale its words are written in. */
export interface FeedCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /**
   * The customer's own UI locale, not the caller's. A feed is read in a
   * calendar app that sends no `Accept-Language` we could act on, so the
   * profile is the only signal there is — and it is the right one anyway: the
   * words belong to the person who subscribed.
   */
  locale: SupportedLocale;
}

/**
 * The customer the token names, or `null` when no such profile exists or it is
 * not a customer.
 *
 * The role check matters: a token is minted from a customer id, but the same
 * signature would verify for any id the minting route was ever pointed at, and
 * a feed is defined as "the seats this parent pays for". Answering `null` here
 * rather than an empty calendar keeps the route's single 404 the answer to
 * every unanswerable request.
 */
export async function loadFeedCustomer(
  supabase: Client,
  customerId: string,
): Promise<FeedCustomer | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, locale")
    .eq("id", customerId)
    .eq("role", "customer")
    .maybeSingle();

  if (error) throw error;
  if (data === null) return null;

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    locale: data.locale === null ? DEFAULT_LOCALE : resolveLocale(data.locale),
  };
}

/** Every active seat the customer pays for — their children's and their own. */
export async function loadFeedParticipations(
  supabase: Client,
  customerId: string,
): Promise<FeedParticipationRow[]> {
  const { data, error } = await buildFeedParticipationsQuery(
    supabase,
    customerId,
  );
  if (error) throw error;
  return data;
}

/**
 * The paid-through instant of every **canceling** subscription among the given
 * participations, keyed by participation.
 *
 * The dashboard gets this from an `auth.uid()`-scoped RPC, which is unusable
 * without a session; the RPC is a two-column read of `family_subscriptions`
 * joined to `participations`, so reproducing it on an explicitly-filtered
 * service-role read is a straight translation rather than a re-implementation.
 * The participation ids are already the caller's own — they came out of the
 * query above — so the `in` filter is what keeps this scoped.
 *
 * `past_due` is deliberately not read: it drives a badge, and a calendar has
 * nowhere to put one.
 */
export async function loadCancelingSubscriptionEnds(
  supabase: Client,
  participationIds: readonly string[],
): Promise<Map<string, Date>> {
  const ends = new Map<string, Date>();
  if (participationIds.length === 0) return ends;

  const { data, error } = await supabase
    .from("family_subscriptions")
    .select("participation_id, current_period_end")
    .eq("status", "canceling")
    .in("participation_id", [...participationIds]);

  if (error) throw error;

  for (const row of data) {
    // A canceling row with no period end simply yields no clamp, exactly as it
    // does on the dashboard.
    if (row.current_period_end !== null) {
      ends.set(row.participation_id, new Date(row.current_period_end));
    }
  }
  return ends;
}

/**
 * The sandbox family a token names, or `null` when there is no such row or the
 * stored document no longer parses.
 *
 * A read by primary key on a table nothing else touches — the token is the
 * authorization, exactly as it is on the customer path, and the service-role
 * client is here for the same reason: the caller is a calendar app with no
 * session at all.
 *
 * An unparseable document answers `null` rather than throwing. The column
 * guarantees only that it holds an object, and a sandbox row written under an
 * older shape of the schema is a stale scratchpad, not a server error — the
 * route's 404 tells the client the same thing it tells a bad token, and the
 * admin's card fixes it by saving again.
 */
export async function loadFeedSandbox(
  supabase: Client,
  sandboxId: string,
): Promise<SandboxDefinition | null> {
  const { data, error } = await supabase
    .from("calendar_feed_sandboxes")
    .select("definition")
    .eq("id", sandboxId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return null;

  const parsed = sandboxDefinitionSchema.safeParse(data.definition);
  return parsed.success ? parsed.data : null;
}

/**
 * The database's answer, as the seats the expansion consumes.
 *
 * This is where every locale-dependent choice a row carries gets made — which
 * of a product's translations names it, and which of a location's names a
 * reader sees — so that nothing downstream has to know a database row exists.
 * The sandbox's own mapper is the sibling of this one, and the two meeting at
 * `FeedSeat` is what keeps one pipeline behind two sources.
 */
export function toFeedSeats(
  rows: readonly FeedParticipationRow[],
  cancelEnds: ReadonlyMap<string, Date>,
  locale: SupportedLocale,
): FeedSeat[] {
  return rows.map((row) => {
    const { product } = row;
    const site = product.location;
    return {
      participationId: row.id,
      participantId: row.participant_id,
      gamerName: row.participant.first_name,
      isPlaced: row.group_id !== null,
      productType: product.product_type,
      productName:
        resolveTranslation(product.product_translations, locale)?.name ?? "",
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      isRemote: product.is_remote,
      locationName: site === null ? null : localizedLocationName(site, locale),
      spokenLanguageCode: product.spoken_language_code,
      slots: product.schedule_slots.map((slot) => ({
        weekday: slot.weekday,
        startTime: slot.start_time,
        durationMinutes: slot.duration_minutes,
      })),
      cancelsAt: cancelEnds.get(row.id) ?? null,
    };
  });
}
