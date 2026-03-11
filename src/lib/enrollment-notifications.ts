import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME_ENROLLMENT } from "@/lib/constants";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
  enrollmentChangeSubjects,
} from "@/lib/email-templates/enrollment-changes";

interface EnrollmentNotificationContext {
  customerId: string;
  gamerId: string;
  groupId: string;
}

async function fetchNotificationData(ctx: EnrollmentNotificationContext) {
  const admin = createAdminClient();

  const [parentResult, gamerResult, groupResult, adminResult] = await Promise.all([
    // Parent profile
    admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", ctx.customerId)
      .single(),
    // Gamer profile + minecraft info
    admin
      .from("profiles")
      .select("display_name, gamer_profiles(minecraft_username, minecraft_uuid)")
      .eq("id", ctx.gamerId)
      .single(),
    // Group → gedu + product
    admin
      .from("product_groups")
      .select("gedu_id, products(name), profiles:gedu_id(display_name, email)")
      .eq("id", ctx.groupId)
      .single(),
    // Admin emails
    admin
      .from("profiles")
      .select("email")
      .eq("role", "admin"),
  ]);

  if (parentResult.error || !parentResult.data) {
    throw new Error(`Failed to fetch parent profile: ${parentResult.error?.message}`);
  }
  if (gamerResult.error || !gamerResult.data) {
    throw new Error(`Failed to fetch gamer profile: ${gamerResult.error?.message}`);
  }
  if (groupResult.error || !groupResult.data) {
    throw new Error(`Failed to fetch group data: ${groupResult.error?.message}`);
  }

  const parent = parentResult.data as { display_name: string; email: string };
  const gamer = gamerResult.data as {
    display_name: string;
    gamer_profiles: { minecraft_username: string | null; minecraft_uuid: string | null } | null;
  };
  const group = groupResult.data as {
    gedu_id: string;
    products: { name: string };
    profiles: { display_name: string; email: string };
  };

  const adminEmails: string[] = (adminResult.data ?? [])
    .map((a: { email: string | null }) => a.email)
    .filter((e: string | null): e is string => !!e);

  return {
    parentName: parent.display_name,
    parentEmail: parent.email,
    gamerName: gamer.display_name,
    minecraftUsername: gamer.gamer_profiles?.minecraft_username ?? null,
    minecraftUuid: gamer.gamer_profiles?.minecraft_uuid ?? null,
    geduName: group.profiles.display_name,
    geduEmail: group.profiles.email,
    productName: group.products.name,
    adminEmails,
  };
}

export async function sendEnrollmentNotifications(ctx: EnrollmentNotificationContext): Promise<void> {
  try {
    const data = await fetchNotificationData(ctx);

    const results = await Promise.allSettled([
      // Parent email (BCC admins — hidden from parent)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME_ENROLLMENT,
        toEmail: data.parentEmail,
        subject: enrollmentChangeSubjects.enrollmentParent(data.gamerName, data.productName),
        htmlContent: buildEnrollmentParentEmail({
          parentName: data.parentName,
          gamerName: data.gamerName,
          geduName: data.geduName,
          productName: data.productName,
          minecraftUsername: data.minecraftUsername,
          minecraftUuid: data.minecraftUuid,
        }),
        bcc: data.adminEmails,
      }),
      // Gedu email (CC admins — visible as collaborators)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME_ENROLLMENT,
        toEmail: data.geduEmail,
        subject: enrollmentChangeSubjects.enrollmentGedu(data.gamerName, data.productName),
        htmlContent: buildEnrollmentGeduEmail({
          geduName: data.geduName,
          gamerName: data.gamerName,
          productName: data.productName,
          minecraftUsername: data.minecraftUsername,
          minecraftUuid: data.minecraftUuid,
        }),
        cc: data.adminEmails,
      }),
    ]);

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("Failed to send enrollment notification:", r.reason);
      }
    }
  } catch (err) {
    console.error("Failed to send enrollment notifications:", err);
  }
}

export async function sendUnenrollmentNotifications(ctx: EnrollmentNotificationContext): Promise<void> {
  try {
    const data = await fetchNotificationData(ctx);

    const results = await Promise.allSettled([
      // Parent email (BCC admins)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME_ENROLLMENT,
        toEmail: data.parentEmail,
        subject: enrollmentChangeSubjects.unenrollmentParent(data.gamerName, data.productName),
        htmlContent: buildUnenrollmentParentEmail({
          parentName: data.parentName,
          gamerName: data.gamerName,
          geduName: data.geduName,
          productName: data.productName,
        }),
        bcc: data.adminEmails,
      }),
      // Gedu email (CC admins)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME_ENROLLMENT,
        toEmail: data.geduEmail,
        subject: enrollmentChangeSubjects.unenrollmentGedu(data.gamerName, data.productName),
        htmlContent: buildUnenrollmentGeduEmail({
          geduName: data.geduName,
          gamerName: data.gamerName,
          productName: data.productName,
          minecraftUsername: data.minecraftUsername,
          minecraftUuid: data.minecraftUuid,
        }),
        cc: data.adminEmails,
      }),
    ]);

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("Failed to send unenrollment notification:", r.reason);
      }
    }
  } catch (err) {
    console.error("Failed to send unenrollment notifications:", err);
  }
}
