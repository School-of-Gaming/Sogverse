import type { AppSupabaseClient } from "@/types";
import {
  familyProductFeed,
  type FamilyProductFeed,
} from "./family-product-feed.contracts";

/**
 * The read behind a family club/camp/event page.
 *
 * One method, one RPC, no writes: nothing on a family product page is editable.
 * The function is SECURITY DEFINER and self-scoping — it resolves the
 * participation itself and answers only if the caller is that participation's
 * participant (their own seat, on a for-parents product) or a parent linked to
 * them — so the authorization lives in one place rather than being re-derived
 * at every call site, and the underlying tables grant `authenticated` nothing
 * at all.
 */

/**
 * Why a page cannot be shown, when it cannot.
 *
 * **Both reasons render as the same not-found state**, and that is the settled
 * decision rather than an omission — a family has nothing to do with either
 * answer, and there is no version of "you may not read this" worth showing
 * someone who did not choose to ask. They are still two values here because the
 * distinction is real, cheap to carry, and the sort of thing a page might one
 * day want to word differently (an unplaced seat is a *state of theirs*, not a
 * refusal, and the dashboard already says so on its awaiting card).
 *
 * - `not_yours` — the participation is neither this caller's own seat nor one
 *   of their children's, **or does not exist**.
 *   The two are deliberately indistinguishable: an error that separated them
 *   would answer "does this id exist" for any id anyone cared to try.
 * - `unplaced` — it is genuinely theirs, and it has no group yet. There is no
 *   feed to build and no page behind it, which is exactly what the dashboard's
 *   awaiting card already promises by rendering no link.
 */
export type FamilyProductFeedUnavailableReason = "not_yours" | "unplaced";

/**
 * What the read answers: the document, or why there isn't one.
 *
 * A discriminated union rather than `null`, because two different refusals
 * collapsing into one empty value is how a page loses the ability to tell them
 * apart later without changing every layer between. It is plain JSON, so it
 * dehydrates into a server-seeded cache unchanged.
 */
export type FamilyProductFeedResult =
  | { status: "ok"; feed: FamilyProductFeed }
  | { status: "unavailable"; reason: FamilyProductFeedUnavailableReason };

export class FamilyProductFeedService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Everything one (participant × product) enrollment renders, in a single
   * round trip: whoever holds the seat, the product shell and its schedule, the
   * group and its public note, the venue on in-person products, the gedus, and
   * the group's **full** stored session history with that one participant's
   * attendance marks.
   *
   * The whole history comes back at once and that is load-bearing rather than
   * merely convenient. The client projects past occurrences from the schedule
   * and merges these rows over them, so a partial fetch would make older
   * sessions that *do* have write-ups render as though they had none — wrong,
   * not short. It is also one PostgREST row whatever its size, which is what
   * keeps it clear of the `max_rows` ceiling that truncates table selects.
   *
   * The generated signature says `Returns: Json`, so the zod parse is not a
   * belt-and-braces check on a typed value — it *is* the type. A db test parses
   * real Postgres output through the same schema in CI, so a drifted key fails
   * loudly at the boundary instead of arriving as `undefined` three components
   * later.
   *
   * Two error codes are answers rather than failures and are mapped, not
   * thrown; anything else is a genuine fault and propagates.
   */
  async getProductFeed(
    participationId: string,
  ): Promise<FamilyProductFeedResult> {
    const { data, error } = await this.supabase.rpc(
      "get_my_family_product_feed",
      { p_participation_id: participationId },
    );

    if (error) {
      // `insufficient_privilege` — not the caller's participation, or no such
      // row. PostgREST answers 403.
      if (error.code === "42501") {
        return { status: "unavailable", reason: "not_yours" };
      }
      // `no_data_found` — theirs, but not placed in a group yet. PostgREST
      // answers 404.
      if (error.code === "P0002") {
        return { status: "unavailable", reason: "unplaced" };
      }
      throw error;
    }

    return { status: "ok", feed: familyProductFeed.parse(data) };
  }
}
