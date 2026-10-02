import type {
  AppSupabaseClient,
  GeduAssignedProduct,
  ProductTopic,
  ProductType,
  SpokenLanguageCode,
} from "@/types";
import {
  geduAssignedProduct,
  myAssignedProductRows,
  traineeAssignedProduct,
  type MyAssignedProductRow,
  type TraineeAssignedProduct,
} from "./assignments.contracts";

/**
 * Row shape consumed by the gedu dashboard's "My Groups" section. One
 * entry per `gedu_group_assignments` row for the signed-in gedu, with
 * the product shell + product-wide aggregates (group count, gamer count
 * across every group). The cards on the dashboard talk about *groups* —
 * the gedu's mental model — but the underlying truth is one card per
 * assigned *product*, since `(gedu_id, product_id)` is unique. The TS
 * naming follows the data.
 */
export interface MyAssignedProductSessionRow {
  /** The product the gedu is assigned to. */
  product: {
    id: string;
    timezone: string;
    /**
     * Inclusive start date in product-local calendar (YYYY-MM-DD), or
     * null for ongoing clubs. Matches the participations shape so the
     * shared occurrence enumeration can clamp pre-start phantom
     * occurrences out of the list.
     */
    startDate: string | null;
    /** Inclusive end date (YYYY-MM-DD), null for ongoing clubs. */
    endDate: string | null;
    /** False for in-person products — the join button is a no-op in that case. */
    isRemote: boolean;
    /**
     * The venue on an in-person product, or `null` — always on a remote one
     * (the read tests the remote flag, never the presence of a location, since a
     * remote municipality club carries one and has no building), and on an
     * in-person product with no site recorded.
     */
    siteName: string | null;
    topic: ProductTopic;
    spokenLanguageCode: SpokenLanguageCode;
    /**
     * Product kind. The dashboard card uses it to pick the right URL prefix
     * for "View details" — `/gedu/clubs/[id]`, `/gedu/camps/[id]`, or
     * `/gedu/events/[id]` — so the gedu lands on a route that matches their
     * mental model.
     */
    productType: ProductType;
    /**
     * Raw translation rows. Resolved at render time so a locale switch
     * doesn't refetch. The `description` key carries the short teaser — the
     * gedu RPC keeps that output key while the column itself is named
     * `short_description`.
     */
    translations: MyAssignedProductRow["product"]["translations"];
  };
  /** The gedu's group on this product — assigned, or the one they substitute on. */
  groupId: string;
  /**
   * Which kind of seat this row is: a standing `assignment`, or one
   * live `substitution` on one date.
   *
   * Two arms of one read because they share every product-shell fact and
   * differ only in the card's chrome — a substitution is its own small card, named as
   * a substitution and dated, rather than the recurring assignment card. A consumer
   * that ignored this would render a sub's one substituted afternoon as though they
   * taught the club every week. A `trainee` row is a trainee seat, whose
   * workspace is the trainee's redacted one.
   */
  kind: "assignment" | "substitution" | "trainee";
  /**
   * The date a `substitution` row is for, product-local `YYYY-MM-DD`; null on an
   * `assignment` row. It is the other half of a substitution card's identity — one
   * card per substitution date, standing from the moment the substitution is approved
   * until it expires. The *workspace* the card links to opens later, 48 hours
   * before the substituted session; a card that waited for it would hide from a sub
   * the afternoon they had agreed to take.
   */
  substitutionDate: string | null;
  /**
   * This row's group's cancelled session dates, product-local `YYYY-MM-DD`,
   * from the day before today onwards. A card skips them when naming the next
   * session and names the ones before it; the absence picker never offers one.
   */
  cancelledDates: readonly string[];
  /**
   * Whether a `substitution` row's date is cancelled — asked of the date itself,
   * because the card stands for days after it and `cancelledDates` starts the
   * day before today. False on an `assignment` row.
   */
  substitutionCancelled: boolean;
  /** Total number of groups in the product (every `product_groups` row). */
  groupCount: number;
  /** Active participations summed across every group in the product. */
  participantCount: number;
  slots: Array<{
    weekday: number;
    startTime: string;
    durationMinutes: number;
  }>;
}

/**
 * Reads the gedu's product assignments for the dashboard. Calls the
 * `get_my_assigned_products` RPC (SECURITY DEFINER, gedu-only); the
 * function bakes its own authorization, so the user-bound client is
 * enough — no admin client required.
 */
export class AssignmentsService {
  constructor(private supabase: AppSupabaseClient) {}

  async getMyAssignedProducts(): Promise<MyAssignedProductSessionRow[]> {
    const { data, error } = await this.supabase.rpc("get_my_assigned_products");
    if (error) throw error;
    return myAssignedProductRows.parse(data).map(toMyAssignedProductSessionRow);
  }

  /**
   * Fetches everything the gedu's session-details page needs in a single
   * round trip — product shell, every group's name/gamer count/gedu list,
   * and the full roster (with primary parent email) for the caller's own
   * group. Backed by the SECURITY DEFINER RPC `get_gedu_assigned_product`;
   * the RPC raises 42501 when the caller isn't a gedu or isn't assigned to
   * the product, which we surface as `null` so the route can render a clean
   * "not your session" empty state instead of throwing.
   *
   * **`groupId` names which group of the product is "mine".** Without
   * one the answer is the caller's assignment group; with one
   * they are assigned to or substituting on, that group is. A sub has no assignment
   * row to resolve a group from, and a gedu substituting a *sibling* group of a
   * product they already teach would otherwise be sent to their own group's
   * workspace — so the substitution card's link carries the group, and this is what it
   * carries it to.
   */
  async getAssignedProductDetail(
    productId: string,
    groupId: string | null = null,
  ): Promise<GeduAssignedProduct | null> {
    const { data, error } = await this.supabase.rpc(
      "get_gedu_assigned_product",
      {
        p_product_id: productId,
        // Omitted rather than sent as null when there is none: the parameter
        // carries a SQL default, and the generator types no RPC argument as
        // nullable, so "no group named" is the absence of the key.
        ...(groupId !== null ? { p_group_id: groupId } : {}),
      },
    );

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return geduAssignedProduct.parse(data);
  }

  /**
   * The trainee's counterpart of {@link getAssignedProductDetail}: the product
   * shell, the caller's own trainee group with its redacted roster, and the
   * product's other groups by name only. Backed by
   * `get_trainee_assigned_product`, which refuses (42501) a caller holding no
   * trainee seat on the product — surfaced as `null`, exactly as the gedu read
   * surfaces its own refusal.
   */
  async getTraineeAssignedProduct(
    productId: string,
    groupId: string | null = null,
  ): Promise<TraineeAssignedProduct | null> {
    const { data, error } = await this.supabase.rpc(
      "get_trainee_assigned_product",
      {
        p_product_id: productId,
        ...(groupId !== null ? { p_group_id: groupId } : {}),
      },
    );

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return traineeAssignedProduct.parse(data);
  }
}

function toMyAssignedProductSessionRow(
  row: MyAssignedProductRow,
): MyAssignedProductSessionRow {
  return {
    product: {
      id: row.product.id,
      timezone: row.product.timezone,
      startDate: row.product.start_date,
      endDate: row.product.end_date,
      isRemote: row.product.is_remote,
      siteName: row.product.site_name,
      topic: row.product.topic,
      spokenLanguageCode: row.product.spoken_language_code,
      productType: row.product.product_type,
      translations: row.product.translations,
    },
    groupId: row.group_id,
    kind: row.kind,
    substitutionDate: row.substitution_date,
    cancelledDates: row.cancelled_dates,
    substitutionCancelled: row.substitution_cancelled,
    groupCount: row.group_count,
    participantCount: row.participant_count,
    slots: row.product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
  };
}
