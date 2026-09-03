import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGamerWelcomeEmail } from "@/lib/gamer-welcome.server";

/**
 * POST /api/gamers/[id]/verification/send — a parent re-sends the mail that
 * verifies their child's email address.
 *
 * **The request has to be the parent's, because the child cannot make it.** A
 * gamer in sign-in mode `email` has no password until they have verified the
 * address, so they cannot sign in to ask for the link themselves. That is the
 * whole reason this route exists beside `/api/auth/verify-email/send`, which
 * every account with a session of its own uses.
 *
 * Three checks, in this order:
 *
 *  1. The `parent_gamer` link, on the RLS-bound client — the same shape the
 *     PATCH route beside it uses, so the database agrees the caller owns the
 *     link rather than this handler asserting it.
 *  2. The child's mode. Only `email` has an address worth verifying; the other
 *     two carry a synthetic handle nobody reads.
 *  3. The rate limit, through `request_gamer_verification_email` on the
 *     CALLER'S client. Its guard is `is_parent_of`, keyed to `auth.uid()`, so it
 *     re-derives entitlement rather than trusting the id in the path — and its
 *     allowance is keyed on the CHILD, so a parent of four gets four
 *     independent hourly allowances. `false` is a refusal, not an error, and
 *     becomes a 429.
 *
 * **The send is the outcome here, so its failure is the answer** — unlike the
 * same mail after a creation, which follows an account that already exists.
 * A parent who pressed "send it again" and got a 200 while nothing left the
 * building has been told the opposite of what happened.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only a parent can send this.",
  params: z.object({ id: z.string().uuid() }),

  handler: async ({ request, supabase, user, params }) => {
    const gamerId = params.id;

    const { data: link, error: linkError } = await supabase
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", user.id)
      .eq("gamer_id", gamerId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Not authorized to manage this gamer" },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { data: gamerProfile, error: modeError } = await admin
      .from("gamer_profiles")
      .select("sign_in")
      .eq("user_id", gamerId)
      .maybeSingle();
    if (modeError) throw modeError;

    if (!gamerProfile || gamerProfile.sign_in !== "email") {
      return NextResponse.json(
        { error: "This gamer has no email address to verify." },
        { status: 400 },
      );
    }

    // The allowance is spent BEFORE the Brevo call, so a send that fails burns
    // one of six — the same trade the self-service route makes, for the same
    // reason: charging afterwards would reopen the concurrent-double-send window
    // the advisory lock exists to close.
    const { data: accepted, error: rpcError } = await supabase.rpc(
      "request_gamer_verification_email",
      { p_gamer_id: gamerId },
    );
    if (rpcError) throw rpcError;
    if (!accepted) {
      return NextResponse.json(
        {
          error:
            "Too many verification emails requested for this gamer. Please try again later.",
        },
        { status: 429 },
      );
    }

    const { data: parentProfile } = await admin
      .from("profiles")
      .select("first_name")
      .eq("id", user.id)
      .single();

    await sendGamerWelcomeEmail({
      request,
      gamerId,
      parentFirstName: parentProfile?.first_name ?? "",
    });

    return { success: true };
  },
});
