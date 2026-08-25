import { z } from "zod";
import { Constants } from "@/types";

/**
 * Contracts for the admin groups API (the apply route and the admin
 * participation add/remove routes). The route parses its request body with
 * the body schema, and BOTH ends validate the result shape: the route parses
 * the RPC's `Json` return before responding, the service parses the response
 * it receives — so the wire contract is checked where it's produced and
 * where it's consumed.
 */

export const groupChangeSet = z.object({
  addedGroups: z.array(
    z.object({
      tempId: z.string(),
      name: z.string(),
      geduIds: z.array(z.string()),
    })
  ),
  renamedGroups: z.array(z.object({ groupId: z.string(), name: z.string() })),
  deletedGroupIds: z.array(z.string()),
  geduAssignmentsAdded: z.array(
    z.object({ groupId: z.string(), geduId: z.string() })
  ),
  geduAssignmentsRemoved: z.array(
    z.object({ groupId: z.string(), geduId: z.string() })
  ),
  participationMoves: z.array(
    z.object({
      participationId: z.string(),
      /** null = unassign (back to inbox); a tempId resolves via the new-group map */
      toGroupId: z.string().nullable(),
    })
  ),
});

export type GroupChangeSet = z.infer<typeof groupChangeSet>;

/** `apply_group_changes` result: throwaway tempId → persisted group UUID. */
export const applyGroupChangesResult = z.object({
  tempMap: z.record(z.string()),
});

export type ApplyGroupChangesResult = z.infer<typeof applyGroupChangesResult>;

/** Response of POST /api/admin/products/[id]/participations (comp-enrollment). */
export const addParticipationResponse = z.object({
  participation_id: z.string(),
});

export const groupParticipationDetail = z.object({
  id: z.string(),
  participant_id: z.string(),
  participant_first_name: z.string(),
  /**
   * The three child-shaped facts. Null together on an adult seat, which carries
   * no gamer profile and no linked game account — the chip renders that absence
   * deliberately rather than as a gap (parent game-account linking is out of
   * scope; the slot is meant to be empty).
   */
  participant_date_of_birth: z.string().nullable(),
  participant_gender: z.enum(Constants.public.Enums.gender_type).nullable(),
  participant_minecraft_username: z.string().nullable(),
  participant_minecraft_uuid: z.string().nullable(),
  /**
   * The Roblox half of the same story (00195), independent of the Minecraft
   * pair above it: a child may have given one handle, both, or neither, and
   * the chip draws whichever the product's topic is about.
   *
   * The account id is a JSON **number** rather than a string — Roblox's key is
   * an int64 in a `bigint` column, where Mojang's is a dashed UUID in a text
   * one. Null means no lookup ever confirmed the account; presence is the whole
   * of "verified", exactly as the uuid is for Minecraft.
   */
  participant_roblox_username: z.string().nullable(),
  participant_roblox_user_id: z.number().nullable(),
  /**
   * The contact standing behind a *child's* seat — not the participant, which
   * is why these two lost the `gamer_` prefix in 00175 rather than gaining a
   * `participant_` one. Null on an adult seat, which has no linked parent.
   */
  parent_first_name: z.string().nullable(),
  parent_last_name: z.string().nullable(),
  /**
   * The seat-holder's own address, emitted only for an adult participant —
   * who has no linked parent, so the two name fields above are null for them
   * and this is the only contact the chip can show. Null on every child row,
   * where a gamer profile's email is the synthetic
   * `@gamer.sogverse.internal` handle rather than a mailbox.
   *
   * Exactly one of `parent_first_name`/`participant_email` is populated on any
   * row, and which one it is decides the chip's variant.
   */
  participant_email: z.string().nullable(),
  status: z.enum(Constants.public.Enums.participation_status),
  signed_up_at: z.string(),
  /**
   * Whether this participation has a live Stripe subscription behind it —
   * the condition `demote_to_waitlist` refuses on, resolved server-side so the
   * panel's demote dialog can fire from the drag handler without a round trip
   * per chip. Required on every participation object, including waitlisted
   * ones, where it is a constant false: the RPC refuses to create a waitlisted
   * row carrying a subscription, so there is nothing there to report.
   */
  has_live_subscription: z.boolean(),
  /**
   * Whether money ever arrived for this participation — the recorded Stripe
   * Checkout Session id being non-null. It is a statement about the past, not
   * about the seat being currently paid for: demotion to the waitlist
   * preserves it, so a family that paid and was later demoted still reads
   * true, while one that only ever joined the queue has no session id and
   * reads false. That difference is the promote dialog's condition on a paid
   * product.
   */
  has_payment_marker: z.boolean(),
  /**
   * The staff-only flair (00203), emitted identically in all three arms of the
   * snapshot — grouped, unassigned and waitlist — from one shared LEFT JOIN.
   * On the two group-less arms it comes back null throughout, which is the
   * truth: a seat in no group is new to nothing and has no note filed under any
   * group. Keeping one expression is what keeps the three shapes one shape, and
   * this schema is where that shows up on the TypeScript side.
   *
   * The names are unprefixed, matching `status` / `signed_up_at` /
   * `has_payment_marker` beside them: these are facts about the participation
   * and the (group, member) pair rather than about the person — and they are
   * spelled the same on all three readers.
   *
   * The groups panel draws **neither** mark: a participant chip there is a drag
   * handle, a badge has no bearing on a move, and a note is a control. The
   * note is rendered by the group members card in the sessions panel on the same
   * page; `group_joined_at` rides here for shape parity rather than for a badge,
   * since the newcomer badge is drawn on no admin surface.
   */
  group_joined_at: z.string().nullable(),
  note: z.string().nullable(),
  note_updated_by_first_name: z.string().nullable(),
});

export const groupGeduDetail = z.object({
  id: z.string(),
  first_name: z.string(),
  email: z.string().nullable(),
});

export const productGroupWithDetails = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  gedus: z.array(groupGeduDetail),
  participations: z.array(groupParticipationDetail),
});

/**
 * The `get_product_groups_with_details` JSONB document backing the admin
 * Groups panel. The RPC returns `Json`; this schema is the structure,
 * written from the function body in supabase/schema.sql and re-verified
 * against real Postgres by the db tests that parse through it.
 */
export const productGroupsSnapshot = z.object({
  product_id: z.string(),
  groups: z.array(productGroupWithDetails),
  unassigned: z.array(groupParticipationDetail),
  /**
   * Waitlisted participants in derived order (waitlisted_at, id) — same detail shape
   * as a group/unassigned chip. Waitlist position is the array index + 1,
   * computed in the UI; it is never stored. See migration 00118.
   */
  waitlist: z.array(groupParticipationDetail),
});

/**
 * The compile-time shapes for the Groups panel, derived from the schemas above
 * so the wire contract and the type can't drift. Re-exported through `@/types`
 * (see types/index.ts) so consumers keep a single import surface.
 */
export type GroupParticipationDetail = z.infer<typeof groupParticipationDetail>;
export type GroupGeduDetail = z.infer<typeof groupGeduDetail>;
export type ProductGroupWithDetails = z.infer<typeof productGroupWithDetails>;
export type ProductGroupsSnapshot = z.infer<typeof productGroupsSnapshot>;
