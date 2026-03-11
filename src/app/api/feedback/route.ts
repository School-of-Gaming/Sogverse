import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { buildFeedbackEmail } from "@/lib/email-templates/feedback";
import { SENDER_EMAIL, SENDER_NAME_FEEDBACK } from "@/lib/constants";
import { z } from "zod";

const feedbackSchema = z.object({
  message: z.string().min(10, "Message must be at least 10 characters").max(2000, "Message must be at most 2000 characters"),
});

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

    // Atomic rate-limit check + insert via RPC (prevents concurrent bypass)
    const { data: accepted, error: rpcError } = await adminClient.rpc("submit_feedback", {
      p_user_id: user.id,
      p_message: parsed.data.message,
    });

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
      fromName: SENDER_NAME_FEEDBACK,
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
