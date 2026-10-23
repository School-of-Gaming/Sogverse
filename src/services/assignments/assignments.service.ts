import type { QueryData } from "@supabase/supabase-js";
import type { PlannedSession } from "@/lib/planned-sessions";
import {
  productVoiceRoom,
  type ProductVoiceRoom,
} from "@/lib/products/voice-room";
import type {
  AppSupabaseClient,
  GeduAssignedProduct,
  GeduAssignmentRole,
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
     * null for ongoing clubs. The card's schedule line states it.
     */
    startDate: string | null;
    /** Inclusive end date (YYYY-MM-DD), null for ongoing clubs. */
    endDate: string | null;
    /** False for in-person products — the join button is a no-op in that case. */
    isRemote: boolean;
    /**
     * How the product's sessions are joined — the Sogverse room, a meeting
     * elsewhere, or instructions per locale. Always `sogverse` in person.
     */
    voiceRoom: ProductVoiceRoom;
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
   * A standing seat's planned sessions, from the day before today to the
   * group's plan horizon, soonest first, each `cancelled` where the group
   * cancelled it. A card names its next session from them and the absence
   * picker lists them. Empty on a `substitution` row.
   */
  upcomingSessions: PlannedSession[];
  /**
   * Whether a `substitution` row's date is cancelled — asked of the date itself,
   * because the card stands for days after it. False on the other kinds.
   */
  substitutionCancelled: boolean;
  /**
   * When a `substitution` row's session runs, from the plan — `null` on a date
   * the plan no longer has (an orphan, a date outside the term, or one on a
   * holiday break), and on the other kinds.
   */
  substitutionStartsAt: Date | null;
  substitutionEndsAt: Date | null;
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
 * The columns both halves of the admin seat read take: the group by id and
 * name, and the product by id, type and the translation names a row shows.
 * One string, so the two halves cannot drift into different shapes.
 */
const ADMIN_SEAT_EMBEDS =
  "created_at, group:product_groups!inner(id, name), product:products!inner(id, product_type, product_translations(locale, name))";

function buildAdminAssignmentSeatsQuery(
  supabase: AppSupabaseClient,
  geduId: string,
) {
  return supabase
    .from("gedu_group_assignments")
    .select(`role, ${ADMIN_SEAT_EMBEDS}`)
    .eq("gedu_id", geduId);
}

function buildAdminTraineeSeatsQuery(
  supabase: AppSupabaseClient,
  geduId: string,
) {
  return supabase
    .from("gedu_group_trainees")
    .select(ADMIN_SEAT_EMBEDS)
    .eq("gedu_id", geduId);
}

type AdminTraineeSeatQueryRow = QueryData<
  ReturnType<typeof buildAdminTraineeSeatsQuery>
>[number];

/**
 * One standing seat a gedu holds, for the admin user page's "Assigned
 * products" section: a lead assignment (`primary` / `assistant`) or a trainee
 * seat, on one group of one product. A gedu holds at most one seat per
 * product, of either kind, so a product never appears twice.
 *
 * Substitutions are not seats and are not here: a sub covering one afternoon
 * is not one of the group's educators.
 */
export interface AdminGeduSeatRow {
  /** The seat's role — an assignment's pay class, or `trainee`. */
  role: GeduAssignmentRole | "trainee";
  /** When the seat was given, the order the section lists them in. */
  createdAt: string;
  group: AdminTraineeSeatQueryRow["group"];
  product: AdminTraineeSeatQueryRow["product"];
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
    return parseMyAssignedProductRows(data);
  }

  /**
   * Every standing seat the given gedu holds — lead assignments and trainee
   * seats together, newest first — for the admin user page. Plain table reads
   * under RLS: an admin reads every row of both tables, and nobody else
   * reaches another gedu's rows.
   */
  async getSeatsForGedu(geduId: string): Promise<AdminGeduSeatRow[]> {
    const [assignments, trainees] = await Promise.all([
      buildAdminAssignmentSeatsQuery(this.supabase, geduId),
      buildAdminTraineeSeatsQuery(this.supabase, geduId),
    ]);
    if (assignments.error) throw assignments.error;
    if (trainees.error) throw trainees.error;

    const seats: AdminGeduSeatRow[] = [
      ...assignments.data.map((row) => ({
        role: row.role,
        createdAt: row.created_at,
        group: row.group,
        product: row.product,
      })),
      ...trainees.data.map((row) => ({
        role: "trainee" as const,
        createdAt: row.created_at,
        group: row.group,
        product: row.product,
      })),
    ];
    return seats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

/**
 * A gedu's seat rows as the seat read returns them, parsed and reshaped. Two
 * reads return these rows — the web's own, for the signed-in gedu, and the
 * Discord bot's, for the gedu a Discord account is linked to — so both parse
 * through here.
 */
export function parseMyAssignedProductRows(
  data: unknown,
): MyAssignedProductSessionRow[] {
  return myAssignedProductRows.parse(data).map(toMyAssignedProductSessionRow);
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
      voiceRoom: productVoiceRoom(row.product, row.product.translations),
      siteName: row.product.site_name,
      topic: row.product.topic,
      spokenLanguageCode: row.product.spoken_language_code,
      productType: row.product.product_type,
      translations: row.product.translations,
    },
    groupId: row.group_id,
    kind: row.kind,
    substitutionDate: row.substitution_date,
    upcomingSessions: row.upcoming_sessions,
    substitutionCancelled: row.substitution_cancelled,
    substitutionStartsAt:
      row.substitution_starts_at === null
        ? null
        : new Date(row.substitution_starts_at),
    substitutionEndsAt:
      row.substitution_ends_at === null
        ? null
        : new Date(row.substitution_ends_at),
    groupCount: row.group_count,
    participantCount: row.participant_count,
    slots: row.product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
  };
}
