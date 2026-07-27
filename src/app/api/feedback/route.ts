import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { buildFeedbackEmail } from "@/lib/email-templates/feedback";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { SENDER_EMAIL } from "@/lib/constants";
import { detectLocaleFromHeader, isSupportedLocale } from "@/lib/constants/locales";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { z } from "zod";

const feedbackSchema = z.object({
  message: z.string().min(10, "Message must be at least 10 characters").max(2000, "Message must be at most 2000 characters"),
});

export async function POST(request: Request) {
  try {
    const result = await requireRole(["admin", "customer", "gamer", "gedu"]);
    if (result instanceof NextResponse) return result;

    const { user, profile, supabase } = result;

    const body = await request.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    // Atomic rate-limit check + insert via a self-scoping RPC on the USER-bound
    // client: `submit_my_feedback` writes a row for `auth.uid()` and has no
    // parameter naming a user, so this handler cannot file feedback as anyone
    // else. It re-checks the same length bounds the schema above enforces.
    const { data: accepted, error: rpcError } = await supabase.rpc(
      "submit_my_feedback",
      { p_message: parsed.data.message },
    );

    if (rpcError) {
      console.error("Failed to submit feedback:", rpcError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!accepted) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please try again later." },
        { status: 429 }
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
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const adminEmails = admins.flatMap((a) => (a.email ? [a.email] : []));

    // Determine reply-to email
    const role = profile.role;
    const userEmail = profile.email || "";
    let replyToEmail = userEmail;
    let isGamer = false;
    let parentEmail: string | undefined;

    if (role === "gamer") {
      isGamer = true;
      // Look up parent's email
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
      message: parsed.data.message,
      sentAt: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
      isGamer,
      parentEmail,
    });

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: t("senderFeedback"),
      toEmail: adminEmails,
      subject: t("feedback.subject", { displayName, role: t(ROLE_LABEL_KEYS[role]) }),
      htmlContent,
      replyToEmail: replyToEmail || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Feedback submission error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
