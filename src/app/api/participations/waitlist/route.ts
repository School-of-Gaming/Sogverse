import { after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  joinWaitlistBody,
  joinWaitlistRpcResult,
  leaveWaitlistBody,
  leaveWaitlistResponse,
  leaveWaitlistRpcResult,
} from "@/services/participations/participations.contracts";
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";

/**
 * POST /api/participations/waitlist
 *
 * Model C: the user-bound client calls a guarded SECURITY DEFINER RPC. The
 * caller's identity is not a parameter — `join_product_waitlist` reads it from
 * `auth.uid()` — so this handler cannot waitlist anyone on behalf of anyone
 * else, and the RPC's own guard refuses a non-customer even if this route's
 * role check were bypassed.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can join a waitlist",
  body: joinWaitlistBody,

  // The RPC raises the canonical forbidden code when the caller is not a
  // customer, and a check violation for a request the customer may make but
  // that this data refuses (waitlist disabled, not the gamer's parent) — both
  // already land on the shared table. `no_data_found` is the exception: the
  // RPC raises it for a product that does not exist, which the client treats
  // as bad input rather than a missing endpoint, so it stays a 400 here.
  errorStatus: { P0002: 400 },

  // The RPC's messages are written for the parent to read — "waitlist is not
  // enabled for this product", "product … does not exist" — and the UI shows
  // them verbatim. They name no row the caller was not already holding.
  discloseErrorMessages:
    "the guarded RPC's messages are the user-facing explanation of a refused join",

  handler: async ({ request, supabase, profile, body }) => {
    const { data, error } = await supabase.rpc("join_product_waitlist", {
      p_product_id: body.productId,
      p_participant_id: body.participantId,
    });

    if (error) throw error;

    const parsed = joinWaitlistRpcResult.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        `join_product_waitlist returned an unexpected shape: ${parsed.error.message}`,
        500,
      );
    }

    // The place in line is taken; confirm it by mail, AFTER the response rather
    // than inside it. The spot is already committed and the send cannot change
    // it, so making the parent's click wait on two or three reads plus a Brevo
    // round trip buys nothing — `after()` keeps the function alive for the send
    // once the answer has gone out, the same committed-outcome/follow-up-send
    // shape the Discord webhook uses. Safe to fire and forget: the helper
    // swallows its own failures and cannot throw, and a failed send leaves the
    // spot exactly as it is.
    //
    // On the CALLER'S own client, which is the point — the reads behind the
    // mail (the product, the participant's name) are ones this parent may
    // already make, so the send needs no privilege the join did not already
    // have.
    //
    // The mail deliberately carries no position number. The card in My SOG
    // reads it live, and a number frozen into an inbox goes stale the moment
    // somebody ahead drops out — with no way for the reader to tell.
    //
    // `!idempotent` is the deciding signal for every return shape the RPC has
    // today. The RPC is idempotent by design and returns an existing row
    // shape-identically to a fresh insert, so without this flag a stale tab
    // resubmitting, or a browser retrying, mails a second "you're on the
    // waitlist" for a place in line that was already taken and already
    // confirmed. The flag is set inside the RPC, under the product gate lock, at
    // the moment the INSERT either ran or did not; recomputing it out here would
    // be a second query racing the first. Every non-`waitlisted` shape the RPC
    // can return — a second parent in the family joining a gamer who already
    // holds a seat gets `active` back at position 0 — comes back with
    // `idempotent: true`, so the flag alone already excludes it.
    //
    // The status check is therefore belt-and-braces, and kept deliberately: a
    // future return shape that pairs `idempotent: false` with a status other
    // than `waitlisted`, or a regression in the RPC that does the same, must not
    // be able to mail a parent "you're on the waitlist" about a seat they
    // actually hold. The condition costs nothing and closes that off in advance.
    if (parsed.data.status === "waitlisted" && !parsed.data.idempotent) {
      after(
        sendProductConfirmationEmail({
          client: supabase,
          request,
          customerId: profile.id,
          participantId: body.participantId,
          productId: body.productId,
          mode: "waitlist",
        }),
      );
    }

    return {
      participationId: parsed.data.participation_id,
      waitlistPosition: parsed.data.waitlist_position,
      status: parsed.data.status,
    };
  },
});

/**
 * DELETE /api/participations/waitlist
 *
 * Give up a spot in line — the same collection the POST above joins. Model C
 * again: the user-bound client calls a SECURITY DEFINER RPC that reads the
 * actor from `auth.uid()`. The body names a participation but never a person,
 * and `leave_my_waitlist_spot` matches on `customer_id = auth.uid()`, so a
 * parent aiming this at another family's participation id gets the same
 * `not_found` as they would for an id that never existed — the role gate here
 * is the outer of two independent checks, not the only one.
 *
 * Customer-only, matching the card: the corner badge does not render for
 * `audience="gamer"`, because giving up a place in line is a decision for the
 * adult who joined it.
 */
export const DELETE = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can leave a waitlist",
  body: leaveWaitlistBody,
  response: leaveWaitlistResponse,

  handler: async ({ supabase, body }) => {
    const { data, error } = await supabase.rpc("leave_my_waitlist_spot", {
      p_participation_id: body.participationId,
    });

    if (error) throw error;

    const parsed = leaveWaitlistRpcResult.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        `leave_my_waitlist_spot returned an unexpected shape: ${parsed.error.message}`,
        500,
      );
    }

    // Every outcome is a 200 carrying its kind, including `not_found`. All
    // three mean the same thing to the caller — this row is not a waitlist spot
    // of yours any more, refetch — and a 404 would additionally confirm to a
    // prober that some *other* id does exist. The RPC deliberately refuses to
    // distinguish "not yours" from "not real"; answering with a status code
    // would give that distinction back.
    return { kind: parsed.data.kind };
  },
});
