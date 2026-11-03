/**
 * Every reader of seats, and whether it means the seats held now or the history.
 *
 * A seat (a `participations` row) ends and stays, and its subscription stays
 * beside it, so a read of either table that never asks about status sees the
 * families who left as well as the ones still there. This registry is where each
 * read says which of the two it means; `tests/unit/seat-reader-completeness.test.ts`
 * fails on a read that is missing from it and on an entry whose read is gone.
 *
 * - `live`: filters to seats held now — through `is_live_seat()`, the TypeScript
 *   status constants, or an explicit status filter that leaves `ended` out.
 * - `history`: deliberately sees ended rows too, and the reason says why that is
 *   the meaning wanted.
 * - `by-id-gated`: reads one row by its id (or its Stripe id), and the status is
 *   then checked or cannot matter.
 * - `writer`: inserts, updates or deletes; what it touches is decided by the
 *   caller or the row it was handed.
 */

export type SeatReadKind = "live" | "history" | "by-id-gated" | "writer";

export interface SeatRead {
  kind: SeatReadKind;
  why: string;
}

/**
 * Database readers, keyed `function:<name>`, `view:<name>` or
 * `policy:<table>.<name>`: every one whose definition in `supabase/schema/`
 * names `participations` or `family_subscriptions` outside a comment.
 */
export const DB_SEAT_READERS: Record<string, SeatRead> = {
  // --- live --------------------------------------------------------------
  "function:chat_channel_roster_ids": { kind: "live", why: "a group chat's members are its active seats" },
  "function:confirm_booking": { kind: "live", why: "the duplicate check counts active and waitlisted rows, and a settled booking's seat is looked up leaving ended out" },
  "function:count_active_seats": { kind: "live", why: "counts active seats" },
  "function:create_booking": { kind: "live", why: "the duplicate check counts active and waitlisted rows, so a family can come back after an end" },
  "function:gedu_assigned_products": { kind: "live", why: "member counts are active seats" },
  "function:gedu_assignment_summaries": { kind: "live", why: "roster and expected-attendance counts are active seats" },
  "function:gedu_teaches_gamer": { kind: "live", why: "a gedu teaches a gamer through an active seat in their group" },
  "function:get_admin_dashboard": { kind: "live", why: "unassigned and staffed-group figures count active seats; live offers count waitlisted rows" },
  "function:get_admin_product_sessions": { kind: "live", why: "each group's roster is its active seats" },
  "function:get_gedu_assigned_product": { kind: "live", why: "member counts and rosters are active seats" },
  "function:get_gedu_group_feed": { kind: "live", why: "the roster is the group's active seats" },
  "function:get_group_staff_overlay": { kind: "live", why: "the overlay covers the group's active seats" },
  "function:get_klaviyo_parent_snapshots": { kind: "live", why: "a profile lists seats held now and subscriptions not yet ended" },
  "function:get_my_participation_subscription_states": { kind: "live", why: "only past_due and canceling subscriptions, which an ended seat's cancelled one never is" },
  "function:get_my_planned_sessions": { kind: "live", why: "plans sessions for active seats" },
  "function:get_my_waitlist_positions": { kind: "live", why: "waitlisted rows only" },
  "function:get_product_groups_with_details": { kind: "live", why: "members and unassigned are active, the waitlist is waitlisted; the subscription join leaves cancelled out" },
  "function:get_trainee_assigned_product": { kind: "live", why: "member counts and rosters are active seats" },
  "function:get_trainee_group_feed": { kind: "live", why: "the roster is the group's active seats" },
  "function:get_trainee_group_overlay": { kind: "live", why: "the overlay covers the group's active seats" },
  "function:has_active_participation_in_group": { kind: "live", why: "asks for an active seat" },
  "function:has_active_participation_on_product": { kind: "live", why: "asks for an active seat" },
  "function:is_voice_group_member": { kind: "live", why: "voice admits an active seat" },
  "function:join_waitlist": { kind: "live", why: "the existing-row check counts occupying statuses only; positions count waitlisted rows" },
  "function:record_attendance": { kind: "live", why: "attendance is marked for an active seat in the group" },
  "function:refresh_product_seat_counts": { kind: "live", why: "counts active and waitlisted rows by status" },
  "function:set_gamer_group_creations": { kind: "live", why: "staff write only about someone still in the group: an ended seat refuses" },
  "function:set_gamer_group_note": { kind: "live", why: "staff write only about someone still in the group: an ended seat refuses" },
  "function:set_group_member_minecraft": { kind: "live", why: "a gedu reaches a gamer through an active seat in their group" },
  "function:set_group_member_roblox": { kind: "live", why: "a gedu reaches a gamer through an active seat in their group" },

  // --- history -----------------------------------------------------------
  "function:end_participation": { kind: "history", why: "the one way a seat ends: it reads the row to answer noop on one already ended" },
  "function:enqueue_klaviyo_parents_of_location": { kind: "history", why: "an over-wide fan-out: re-snapshotting a family whose seat ended costs one profile sync and changes nothing" },
  "function:enqueue_klaviyo_parents_of_product": { kind: "history", why: "an over-wide fan-out: re-snapshotting a family whose seat ended costs one profile sync and changes nothing" },
  "function:get_my_family_product_feed": { kind: "history", why: "an ended seat keeps its page, bounded at the instant it ended" },
  "function:klaviyo_attendance_marked": { kind: "history", why: "attributes an attendance mark to the family that held the seat, preferring a live one" },

  // --- by-id-gated -------------------------------------------------------
  "function:admin_move_participation": { kind: "by-id-gated", why: "refuses a seat that is not active" },
  "function:admin_move_unsubscribed_participation": { kind: "by-id-gated", why: "refuses a seat that is not active" },
  "function:admin_remove_participation": { kind: "by-id-gated", why: "hands the seat to end_participation, which answers noop on an ended one" },
  "function:demote_to_waitlist": { kind: "by-id-gated", why: "refuses a seat that is not active" },
  "function:get_waitlist_position": { kind: "by-id-gated", why: "answers only for a waitlisted row" },
  "function:klaviyo_family_subscription_changed": { kind: "by-id-gated", why: "reads the product of the subscription's own seat; status cannot matter" },
  "function:leave_my_waitlist_spot": { kind: "by-id-gated", why: "answers noop unless the row is waitlisted" },
  "function:promote_from_waitlist": { kind: "by-id-gated", why: "answers noop unless the row is waitlisted" },
  "function:respond_seat_offer": { kind: "by-id-gated", why: "refuses unless the row is waitlisted" },
  "function:send_seat_offer": { kind: "by-id-gated", why: "answers noop unless the row is waitlisted" },

  // --- writer ------------------------------------------------------------
  "function:admin_enroll_participant": { kind: "writer", why: "inserts an active seat; the occupying-status unique index refuses a second one and lets an ended pair come back" },
  "function:apply_group_changes": { kind: "writer", why: "its move filters to active seats, so one naming an ended seat from a stale panel is skipped" },
  "function:claim_expired_seat_offer_notifications": { kind: "writer", why: "claims waitlisted rows whose offer lapsed" },
  "function:confirm_paid_participation": { kind: "writer", why: "stamps the seat confirm_booking just answered with" },
  "function:erase_participations": { kind: "writer", why: "the one deletion of seats, for erasure" },
  "function:update_product": { kind: "writer", why: "drops waitlisted rows when the waitlist is turned off" },
};

export interface TsSeatRead extends SeatRead {
  /** The function or handler the read sits in; it must appear before the read. */
  in: string;
}

/**
 * TypeScript readers under `src/`, by file, in the order they appear in it: every
 * `.from("participations")`, `.from("family_subscriptions")` and embed of either
 * table in a select string.
 */
export const TS_SEAT_READERS: Record<string, readonly TsSeatRead[]> = {
  "src/app/api/admin/products/[id]/participations/[participationId]/route.ts": [
    { in: "PATCH", kind: "by-id-gated", why: "the IDOR check that the seat is on this product; the transition RPC checks status" },
  ],
  "src/app/api/gedu/sessions/email-report/route.ts": [
    { in: "POST", kind: "live", why: "the report goes to the group's active seats" },
  ],
  "src/app/api/participations/seat-offer/route.ts": [
    { in: "POST", kind: "by-id-gated", why: "only a waitlisted row can carry an offer stamp, so an ended one answers invalid" },
  ],
  "src/app/api/voice/token/route.ts": [
    { in: "POST", kind: "live", why: "voice admits an active seat" },
  ],
  "src/app/api/webhooks/stripe/products/route.ts": [
    { in: "handleCheckoutCompleted", kind: "writer", why: "inserts the subscription for the seat just confirmed" },
    { in: "handleInvoicePaid", kind: "by-id-gated", why: "the renewal's own subscription, by its Stripe id" },
    { in: "handleInvoicePaid", kind: "by-id-gated", why: "the product of that subscription's own seat" },
    { in: "handleSubscriptionUpdated", kind: "by-id-gated", why: "by Stripe id, and an ended subscription returns before any write" },
    { in: "handleSubscriptionUpdated", kind: "writer", why: "updates the row just read" },
    { in: "handleSubscriptionDeleted", kind: "by-id-gated", why: "by Stripe id; ending an already ended seat is a noop" },
  ],
  "src/lib/minecraft/join-check.server.ts": [
    { in: "loadJoinCheck", kind: "live", why: "active seats only" },
  ],
  "src/lib/seat-offer.server.ts": [
    { in: "resolveSeatOfferLink", kind: "by-id-gated", why: "the signed link's row; the offer classifier refuses anything not waitlisted" },
    { in: "resolveSeatOfferDeadEnd", kind: "by-id-gated", why: "the signed link's row; the offer classifier refuses anything not waitlisted" },
  ],
  "src/services/billing/billing.server.ts": [
    { in: "resolveBillingAccountsViaRls", kind: "history", why: "an ended subscription covers nobody and is left out of an account's list, but its Stripe customer stays, its invoices and cards still the family's" },
    { in: "resolveBillingAccountsViaRls", kind: "history", why: "the name and club of each subscription's seat, read with it before the ended ones are skipped" },
    { in: "resolveParticipationStripeCustomerId", kind: "by-id-gated", why: "the Stripe customer behind one seat, which stays the family's after it ends" },
    { in: "ownsStripeCustomer", kind: "history", why: "an ownership proof: any subscription the parent ever had shows the Stripe customer is theirs" },
  ],
  "src/services/participations/move-seat.server.ts": [
    { in: "hasLiveSubscription", kind: "live", why: "leaves cancelled out" },
    { in: "checkNoSubscriptionMove", kind: "by-id-gated", why: "refuses a seat that is not active" },
    { in: "checkNoSubscriptionMove", kind: "live", why: "the target check counts occupying statuses only" },
  ],
  "src/services/participations/participations.service.ts": [
    { in: "buildGamerParticipationsQuery", kind: "history", why: "the admin user page's assigned products: every seat a gamer held" },
    { in: "getParticipationCounts", kind: "live", why: "the picker's lock folds rows through mergeGamerSignupState, which ignores ended" },
    { in: "getConfirmation", kind: "by-id-gated", why: "an ended seat reads as null" },
    { in: "getConfirmationByCheckoutSession", kind: "by-id-gated", why: "the booking's own seat; an ended one reads as seat_gone" },
    { in: "hasSeatOnProduct", kind: "live", why: "occupying statuses only" },
    { in: "buildMyUpcomingSessionsQuery", kind: "history", why: "the dashboards keep an ended seat as a finished card" },
    { in: "buildMyWaitlistQuery", kind: "live", why: "waitlisted rows only" },
  ],
  "src/services/participations/switch-club.server.ts": [
    { in: "checkSwitchClub", kind: "by-id-gated", why: "refuses a seat that is not active" },
    { in: "checkSwitchClub", kind: "live", why: "leaves cancelled out" },
    { in: "checkSwitchClub", kind: "live", why: "the target check counts occupying statuses only" },
  ],
  "src/services/partner/partner-enrolments.server.ts": [
    { in: "fetchSeats", kind: "live", why: "occupying statuses only" },
  ],
  "src/services/partner/partner-roblox-research.server.ts": [
    { in: "fetchSeats", kind: "live", why: "occupying statuses only" },
  ],
  "src/services/partner/partner-scope.server.ts": [
    { in: "base", kind: "live", why: "occupying statuses only" },
  ],
};
