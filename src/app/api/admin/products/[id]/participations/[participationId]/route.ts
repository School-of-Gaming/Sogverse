import { NextResponse, after } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminRemoveParticipationRpcResult,
  demoteToWaitlistRpcResult,
  promoteFromWaitlistRpcResult,
  waitlistTransitionBody,
} from "@/services/participations/participations.contracts";
import { sendSeatOfferRpcResult } from "@/services/participations/seat-offer.contracts";
import { sendSeatOfferEmail } from "@/services/participations/seat-offer-email.server";

/** Both handlers address one participation on one product, by URL path. */
const routeParams = z.object({
  id: z.string().uuid(),
  participationId: z.string().uuid(),
});

/**
 * DELETE /api/admin/products/[id]/participations/[participationId]
 *
 * Admin-only un-enrollment — the inverse of the comp-enrollment POST on the
 * collection route. Hard-deletes the participation, which CASCADEs any linked
 * family_subscriptions row.
 *
 * Model C, like every other handler in this file: `participations` is
 * grant-locked, so the write goes through `admin_remove_participation`, an
 * admin-guarded SECURITY DEFINER RPC. Three preconditions live inside it rather
 * than here, and each is safer there than it was in TypeScript:
 *
 *  - the participation must be on THIS product (an id from another product
 *    could otherwise be cancelled through this URL);
 *  - a participation with a LIVE Stripe subscription is refused, because the
 *    CASCADE would orphan a subscription that keeps billing the customer with
 *    no DB record and no refund. In the RPC that check shares a transaction and
 *    a product lock with the delete, so unlike the route-level version it has no
 *    window between checking and deleting. It is what makes removal safe on
 *    every product type, including the paid consumer clubs a blanket type
 *    refusal used to stand in for — that refusal is gone, because without
 *    admin removal a *free* club has no exit at all (there is no parent-facing
 *    cancel for a free enrollment) and a hard-capped one could never free a
 *    seat. "Live" means a family_subscriptions row whose status is anything but
 *    `cancelled`; a dunning-dead subscription does not refuse, or removal —
 *    that seat's only exit — would be closed forever.
 *
 * The live-subscription refusal is an ORDINARY OUTCOME of this route, not a
 * broken invariant, and the status it answers with says so (400, exactly as the
 * PATCH handler's identically-coded demote refusal does). Any admin can reach
 * it by dragging a subscribed member onto the panel's remove zone, on any
 * product — including a club that was flipped from paid to free, whose members
 * keep their subscriptions. The panel's dialog normally stops the drag first.
 *
 * No refund is issued: nothing here calls Stripe.
 */
export const DELETE = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can remove gamers from a product",
  params: routeParams,

  // 55000 (object_not_in_prerequisite_state) is the live-subscription refusal,
  // the same code and the same status the PATCH handler answers for the same
  // condition: a request the admin can legitimately make and the database
  // legitimately declines, which is a 400. It was a 500 while a product-type
  // check made it unreachable in practice; with that check gone it is a routine
  // answer, and a 500 would have logged an ordinary refusal as a server fault.
  //
  // `no_data_found`: the participation is named by the URL path, so a
  // participation that is not on this product is a missing resource — the
  // shared table's 404 is what this route already answered.
  errorStatus: { "55000": 400 },

  handler: async ({ supabase, user, params }) => {
    const { id: productId, participationId } = params;

    const { data, error } = await supabase.rpc("admin_remove_participation", {
      p_product_id: productId,
      p_participation_id: participationId,
    });

    if (error) {
      // One code carries copy the admin needs, and the shared table's generic
      // message for the status would not tell them what to do next.
      if (error.code === "55000") {
        console.error(
          JSON.stringify({
            event: "admin_remove_gamer_blocked_live_subscription",
            admin_id: user.id,
            product_id: productId,
            participation_id: participationId,
            detail: error.message,
            at: new Date().toISOString(),
          }),
        );
        return NextResponse.json(
          {
            error:
              "This participation has a live Stripe subscription and can't be removed here. Cancel the subscription first.",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const parsed = adminRemoveParticipationRpcResult.safeParse(data);
    if (!parsed.success) {
      console.error(
        "admin_remove_participation returned an unexpected shape:",
        parsed.error.message,
      );
      throw new ApiError("Failed to remove gamer", 500);
    }

    // Audit trail — mirrors admin_add_gamer so we can answer "which admin
    // removed this gamer (and was anyone unenrolled who'd paid)?" later. Hosted
    // log aggregation picks this up; no DB write.
    console.info(
      JSON.stringify({
        event: "admin_remove_gamer",
        admin_id: user.id,
        product_id: productId,
        participation_id: participationId,
        result: parsed.data,
        at: new Date().toISOString(),
      }),
    );

    return { ok: true };
  },
});

/**
 * PATCH /api/admin/products/[id]/participations/[participationId]
 *
 * Admin waitlist actions on one row:
 *  - `promote` — a waitlisted gamer dragged into a group/unassigned. Gives them
 *    a seat via promote_from_waitlist (status→active, group set, waitlisted_at
 *    cleared). No seat-count gate — a deliberate admin capacity override.
 *  - `demote` — an active gamer dragged onto the waitlist. Sends them to the
 *    back via demote_to_waitlist (status→waitlisted, group cleared).
 *  - `invite` — the seat offer (00207). Grants nothing: it stamps the row and
 *    mails the family to ask whether they can still come.
 *
 * The first two are the user-context client against an admin-guarded RPC. Both
 * re-check the caller's role internally (like apply_group_changes, their
 * drag-UI sibling), so they must run with the caller's JWT — a service-role
 * call has no auth.uid() and would be Forbidden.
 *
 * **`invite` is the one action here that goes through the admin client, and the
 * reason is not about admins.** `send_seat_offer` is granted to `service_role`
 * alone because its two siblings have to be: the family answers from a PUBLIC
 * landing page with no session for a guard primitive to read, and the three
 * functions share one authorization model rather than splitting the feature
 * across two. The admin's identity is established by this route's own role
 * gate, above, which is where it belongs.
 *
 * **No product-type gate.** This route used to refuse consumer clubs outright,
 * which would have wrongly blocked every *free* club the moment clubs became
 * free-or-paid. What the refusal actually protected is one thing —  demoting a
 * family whose seat carries a live Stripe subscription, which a later
 * parent-side leave would CASCADE into an orphaned, still-billing sub — and
 * `demote_to_waitlist` now refuses exactly that, per participation, under the
 * same lock as the write. One predicate, one home: the route reads the RPC's
 * answer rather than keeping a coarser copy of it.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can change waitlist status",
  params: routeParams,
  body: waitlistTransitionBody,

  // `no_data_found` keeps the shared 404 for the same reason as the DELETE
  // handler: the participation is named by the URL path. The reads and the RPCs
  // used to answer 400 with raw Postgres text for every other failure; they now
  // go through the shared table with a generic message.
  //
  // 55000 (object_not_in_prerequisite_state) is the live-subscription demote
  // refusal — the same ERRCODE `admin_remove_participation` raises, now with
  // the same 400 on both handlers. One condition, one code, one status,
  // wherever it is met: an admin dragging a paying member onto the waitlist (or
  // onto the remove zone) is making a request the database declines, not
  // tripping a fault. Exactly the status the consumer-club refusal it replaces
  // answered with. Normally unreachable — the groups panel's dialog stops the
  // drag first. The handler returns the admin-facing copy itself; this pins the
  // status.
  errorStatus: { "55000": 400 },

  handler: async ({ request, supabase, user, params, body }) => {
    const { id: productId, participationId } = params;

    // IDOR guard: the participation must belong to THIS product (else a
    // participationId from another product could be transitioned via this URL).
    const { data: participation, error: fetchError } = await supabase
      .from("participations")
      .select("id, product_id")
      .eq("id", participationId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!participation || participation.product_id !== productId) {
      return NextResponse.json(
        { error: "Participation not found on this product" },
        { status: 404 },
      );
    }

    // The product itself is no longer consulted for a *decision* — nothing here
    // branches on its type any more — but it is still read, because a URL naming
    // a product that does not exist deserves a 404 rather than whatever the RPC
    // would say about a participation the caller reached through it.
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Dispatch to the matching RPC and validate its Json result shape before
    // responding (the db tests parse real RPC output through the same schemas).
    if (body.action === "invite") {
      const { data, error } = await createAdminClient().rpc("send_seat_offer", {
        p_participation_id: participationId,
      });
      if (error) throw error;

      const offer = sendSeatOfferRpcResult.safeParse(data);
      if (!offer.success) {
        throw new ApiError(
          `send_seat_offer returned an unexpected shape: ${offer.error.message}`,
          500,
        );
      }

      // The stamp is committed; the mail follows it, after the response rather
      // than inside it, exactly as the waitlist-join confirmation does. The
      // helper swallows its own failures, so a Brevo outage leaves an offer
      // standing with no mail behind it — which the admin can fix by pressing
      // Invite again once the window lapses, and which is strictly better than
      // handing them a 500 for a row that was successfully stamped.
      //
      // `!idempotent` is the whole of the double-click protection, and it comes
      // from inside the RPC under the product gate lock rather than from a
      // second query racing the first. A replay reports the ORIGINAL sent_at,
      // so re-mailing would send a second copy of a mail whose deadline had not
      // moved — two inboxes' worth of the same question.
      if (offer.data.kind === "offered" && !offer.data.idempotent) {
        after(
          sendSeatOfferEmail({
            // The admin client, not the caller's: this send reads the family's
            // profile and the product on a path whose whole authorization is
            // this route's role gate.
            client: createAdminClient(),
            request,
            participationId,
            customerId: offer.data.customer_id,
            participantId: offer.data.participant_id,
            productId,
            sentAt: offer.data.sent_at,
          }),
        );
      }
    } else if (body.action === "promote") {
      const { data, error } = await supabase.rpc("promote_from_waitlist", {
        p_participation_id: participationId,
        p_group_id: body.groupId ?? undefined,
      });
      if (error) throw error;
      promoteFromWaitlistRpcResult.parse(data);
    } else {
      const { data, error } = await supabase.rpc("demote_to_waitlist", {
        p_participation_id: participationId,
      });
      if (error) {
        // The one refusal with copy of its own: demoting would strand a live
        // Stripe subscription on a waitlisted row, which the parent can delete
        // outright — CASCADE-orphaning a sub that keeps billing.
        if (error.code === "55000") {
          console.error(
            JSON.stringify({
              event: "admin_demote_blocked_live_subscription",
              admin_id: user.id,
              product_id: productId,
              participation_id: participationId,
              detail: error.message,
              at: new Date().toISOString(),
            }),
          );
          return NextResponse.json(
            {
              error:
                "This gamer's seat has a live Stripe subscription, so they can't be moved to the waitlist. Cancel the subscription first.",
            },
            { status: 400 },
          );
        }
        throw error;
      }
      demoteToWaitlistRpcResult.parse(data);
    }

    // Audit trail — mirrors admin_add_gamer / admin_remove_gamer.
    console.info(
      JSON.stringify({
        event: "admin_waitlist_transition",
        action: body.action,
        admin_id: user.id,
        product_id: productId,
        participation_id: participationId,
        at: new Date().toISOString(),
      }),
    );

    return { ok: true };
  },
});
