import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import {
  buildFeedbackEmail,
  feedbackReplyToAddress,
} from "@/lib/email-templates/feedback";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { gamerHoldsOwnMailbox } from "@/lib/email/family-recipients.server";

const feedbackSchema = z.object({
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
});

/**
 * POST /api/feedback
 *
 * Naming all four roles is this gate's way of spelling "any authenticated
 * caller", and it stays that way deliberately: it loads the profile (the email
 * template needs the name, role and locale) and applies the parent-PIN gate
 * along the way, neither of which the any-authenticated posture does.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "customer", "gamer", "gedu"],
  body: feedbackSchema,

  // The submission RPC is self-scoping and its only failure is "the write did
  // not happen", which the shared table answers as a logged, generic 500. The
  // route used to return the thrown message from its own catch — incidental
  // forwarding, now closed.

  handler: async ({ request, supabase, user, profile, body }) => {
    // Atomic rate-limit check + insert via a self-scoping RPC on the USER-bound
    // client: `submit_my_feedback` writes a row for `auth.uid()` and has no
    // parameter naming a user, so this handler cannot file feedback as anyone
    // else. It re-checks the same length bounds the schema above enforces.
    const { data: accepted, error: rpcError } = await supabase.rpc(
      "submit_my_feedback",
      { p_message: body.message },
    );
    if (rpcError) throw rpcError;
    if (!accepted) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please try again later." },
        { status: 429 },
      );
    }

    // From here on the work is *notification*, not the user's own write. It goes
    // to the one shared support inbox rather than fanning out to every admin's
    // personal address: a message a family writes is answered by whoever is on
    // the inbox, and a recipient list assembled from the profiles table changes
    // whenever staff do.
    const role = profile.role;
    const userEmail = profile.email || "";
    let isGamer = false;
    let parentEmail: string | undefined;
    let gamerOwnMailbox = false;

    if (role === "gamer") {
      isGamer = true;
      // The service-role client is here and only here: a gamer's reply-to is
      // their parent's address, which is not in the submitter's RLS view and
      // must not be — an RPC that returned it would be readable by any
      // authenticated caller who invoked it directly. Nothing read here is ever
      // echoed back in the response.
      const adminClient = createAdminClient();
      const { data: parentLink } = await adminClient
        .from("parent_gamer")
        .select("parent_id")
        .eq("gamer_id", user.id)
        .limit(1)
        .single();

      if (parentLink) {
        const { data: parentProfile } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", parentLink.parent_id)
          .single();

        if (parentProfile?.email) {
          parentEmail = parentProfile.email;
        }
      }

      // Reply-To stays the parent's — Brevo takes one address, and we never
      // answer a child alone — but a gamer who holds a mailbox of their own is
      // named in the staff-facing note so the admin can include both. The gate
      // is the shared one: the real-email sign-in, which is the whole test.
      // Same service-role read as the parent lookup, and for the same reason.
      const { data: gamerProfile } = await adminClient
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", user.id)
        .maybeSingle();

      gamerOwnMailbox = gamerHoldsOwnMailbox({
        signIn: gamerProfile?.sign_in ?? null,
      });
    }

    // Resolve locale: profile preference → Accept-Language → English
    const pref = profile.locale;
    const locale = isSupportedLocale(pref)
      ? pref
      : detectLocaleFromHeader(request.headers.get("Accept-Language"));

    const t = await getEmailTranslator(locale);
    const displayName = profile.first_name || "Unknown";

    // `userEmail` is the submitter's own address, whatever it is — the mail
    // resolves the reply-to from it and the parent's, in the one place both
    // this send and the template's own "Reply to" row read it from.
    const mailOptions = {
      userName: displayName,
      userRole: role,
      userEmail,
      message: body.message,
      sentAt: new Date().toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      isGamer,
      parentEmail,
      gamerOwnMailbox,
    };
    const htmlContent = buildFeedbackEmail(t, locale, mailOptions);

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: SUPPORT_EMAIL,
      subject: t("feedback.subject", {
        displayName,
        role: t(ROLE_LABEL_KEYS[role]),
      }),
      htmlContent,
      // The one email whose reply-to is a person rather than our own support
      // inbox, and it stays that way: this mail is delivered *to* that inbox, so
      // replying is how whoever is on it answers the family who wrote in. The
      // usual SUPPORT_EMAIL reply-to would send the reply straight back to
      // ourselves.
      //
      // Resolved by the shared helper the mail's own "Reply to" row reads, so
      // the header and the printed address cannot drift apart: a gamer's goes
      // to their linked parent whatever sign-in the child holds, because we
      // never answer a child alone, and everyone else is answered at their own
      // address. See the helper for what an unlinked gamer falls back to.
      replyToEmail: feedbackReplyToAddress(mailOptions) || undefined,
    });

    return { success: true };
  },
});
