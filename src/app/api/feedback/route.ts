import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { buildFeedbackEmail } from "@/lib/email-templates/feedback";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import { z } from "zod";

const feedbackSchema = z.object({
  message: z.string().min(10, "Message must be at least 10 characters").max(2000, "Message must be at most 2000 characters"),
});

const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX = 6;

export async function POST(request: Request) {
  try {
    const result = await requireRole(["admin", "customer", "gamer", "gedu"], {
      select: "role, email, display_name, username",
    });
    if (result instanceof NextResponse) return result;

    const { user, profile } = result;

    const body = await request.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Rate limit: count submissions in the last hour
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await adminClient
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);

    if (countError) {
      console.error("Failed to check rate limit:", countError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please try again later." },
        { status: 429 }
      );
    }

    // Insert submission
    const { error: insertError } = await adminClient
      .from("feedback_submissions")
      .insert({ user_id: user.id, message: parsed.data.message });

    if (insertError) {
      console.error("Failed to insert feedback:", insertError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Get all admin emails
    const { data: admins, error: adminsError } = await adminClient
      .from("profiles")
      .select("email")
      .eq("role", "admin");

    if (adminsError || !admins?.length) {
      console.error("Failed to fetch admin emails:", adminsError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const adminEmails = admins.map((a) => a.email).filter(Boolean) as string[];

    // Determine reply-to email
    const role = profile.role as string;
    const userEmail = (profile.email as string) || "";
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

    const displayName = (profile.display_name as string) || (profile.username as string) || "Unknown";

    const htmlContent = buildFeedbackEmail({
      userName: displayName,
      userRole: role,
      userEmail: replyToEmail || userEmail,
      message: parsed.data.message,
      sentAt: new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
      isGamer,
      parentEmail,
    });

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: `${SENDER_NAME} Feedback`,
      toEmail: adminEmails,
      subject: `Feedback from ${displayName} (${role})`,
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
