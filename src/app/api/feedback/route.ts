import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { buildFeedbackEmail } from "@/lib/email-templates/feedback";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";

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

    const adminClient = createAdminClient();

    // From here on the work is *notification*, not the user's own write, and it
    // stays on the service-role client by necessity: the recipient list is every
    // admin's email address, and a gamer's reply-to is their parent's. Neither
    // is in the submitter's RLS view, and neither may be — an RPC that returned
    // them would be readable by any authenticated caller who invoked it
    // directly. Nothing read here is ever echoed back in the response.
    const { data: admins, error: adminsError } = await adminClient
      .from("profiles")
      .select("email")
      .eq("role", "admin");

    if (adminsError || !admins.length) {
      console.error("Failed to fetch admin emails:", adminsError);
      throw new ApiError("no admin recipients for the feedback notification", 500);
    }

    const adminEmails = admins.flatMap((a) => (a.email ? [a.email] : []));

    const role = profile.role;
    const userEmail = profile.email || "";
    let replyToEmail = userEmail;
    let isGamer = false;
    let parentEmail: string | undefined;

    if (role === "gamer") {
      isGamer = true;
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
          replyToEmail = parentProfile.email;
          parentEmail = parentProfile.email;
        }
      }
    }

    // Resolve locale: profile preference → Accept-Language → English
    const pref = profile.locale;
    const locale = isSupportedLocale(pref)
      ? pref
      : detectLocaleFromHeader(request.headers.get("Accept-Language"));

    const t = await getEmailTranslator(locale);
    const displayName = profile.first_name || "Unknown";

    const htmlContent = buildFeedbackEmail(t, locale, {
      userName: displayName,
      userRole: role,
      userEmail: replyToEmail || userEmail,
      message: body.message,
      sentAt: new Date().toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      isGamer,
      parentEmail,
    });

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: adminEmails,
      subject: t("feedback.subject", {
        displayName,
        role: t(ROLE_LABEL_KEYS[role]),
      }),
      htmlContent,
      // The one email whose reply-to is a person rather than an inbox, and it
      // stays that way: this mail goes to admins, so replying is how an admin
      // answers the family who wrote in. Pointing it at support would send the
      // reply back to ourselves.
      //
      // For a gamer this is their parent's address *when the link above
      // resolves*. A gamer with no linked parent leaves their own synthetic
      // handle here, which would bounce — accepted, because every gamer is
      // created through a parent, so an unlinked one is a broken row rather
      // than a state to design a reply-to for.
      replyToEmail: replyToEmail || undefined,
    });

    return { success: true };
  },
});
