import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
} from "@/lib/email-templates/enrollment-changes";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";

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
      .select("display_name, email, locale")
      .eq("id", ctx.customerId)
      .single(),
    // Gamer profile + minecraft info
    admin
      .from("profiles")
      .select("display_name, minecraft_accounts(minecraft_username, minecraft_uuid)")
      .eq("id", ctx.gamerId)
      .single(),
    // Group → gedu + product
    admin
      .from("product_groups")
      .select("gedu_id, products(name), profiles:gedu_id(display_name, email, locale)")
      .eq("id", ctx.groupId)
      .single(),
    // Admin emails
    admin
      .from("profiles")
      .select("email")
      .eq("role", "admin"),
  ]);

  if (parentResult.error) {
    throw new Error(`Failed to fetch parent profile: ${parentResult.error.message}`);
  }
  if (gamerResult.error) {
    throw new Error(`Failed to fetch gamer profile: ${gamerResult.error.message}`);
  }
  if (groupResult.error) {
    throw new Error(`Failed to fetch group data: ${groupResult.error.message}`);
  }

  const parent = parentResult.data as { display_name: string; email: string; locale: string | null };
  const gamer = gamerResult.data as {
    display_name: string;
    minecraft_accounts: { minecraft_username: string | null; minecraft_uuid: string | null } | null;
  };
  const group = groupResult.data as {
    gedu_id: string;
    products: { name: string };
    profiles: { display_name: string; email: string; locale: string | null };
  };

  const adminEmails: string[] = (adminResult.data ?? [])
    .map((a: { email: string | null }) => a.email)
    .filter((e: string | null): e is string => !!e);

  return {
    parentName: parent.display_name,
    parentEmail: parent.email,
    parentLocale: resolveLocale(parent.locale),
    gamerName: gamer.display_name,
    minecraftUsername: gamer.minecraft_accounts?.minecraft_username ?? null,
    minecraftUuid: gamer.minecraft_accounts?.minecraft_uuid ?? null,
    geduName: group.profiles.display_name,
    geduEmail: group.profiles.email,
    geduLocale: resolveLocale(group.profiles.locale),
    productName: group.products.name,
    adminEmails,
  };
}

/** Cache translators to avoid loading messages multiple times per request. */
async function resolveTranslators(locales: SupportedLocale[]): Promise<Map<SupportedLocale, EmailTranslator>> {
  const unique = [...new Set(locales)];
  const entries = await Promise.all(
    unique.map(async (l) => [l, await getEmailTranslator(l)] as const),
  );
  return new Map(entries);
}

export async function sendEnrollmentNotifications(ctx: EnrollmentNotificationContext): Promise<void> {
  try {
    const data = await fetchNotificationData(ctx);
    const translators = await resolveTranslators([data.parentLocale, data.geduLocale]);
    const parentT = translators.get(data.parentLocale)!;
    const geduT = translators.get(data.geduLocale)!;

    const results = await Promise.allSettled([
      // Parent email (BCC admins — hidden from parent)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: parentT("senderEnrollment"),
        toEmail: data.parentEmail,
        subject: parentT("enrollmentParent.subject", { gamerName: data.gamerName, productName: data.productName }),
        htmlContent: buildEnrollmentParentEmail(parentT, data.parentLocale, {
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
        fromName: geduT("senderEnrollment"),
        toEmail: data.geduEmail,
        subject: geduT("enrollmentGedu.subject", { gamerName: data.gamerName, productName: data.productName }),
        htmlContent: buildEnrollmentGeduEmail(geduT, data.geduLocale, {
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
    const translators = await resolveTranslators([data.parentLocale, data.geduLocale]);
    const parentT = translators.get(data.parentLocale)!;
    const geduT = translators.get(data.geduLocale)!;

    const results = await Promise.allSettled([
      // Parent email (BCC admins)
      sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: parentT("senderEnrollment"),
        toEmail: data.parentEmail,
        subject: parentT("unenrollmentParent.subject", { gamerName: data.gamerName, productName: data.productName }),
        htmlContent: buildUnenrollmentParentEmail(parentT, data.parentLocale, {
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
        fromName: geduT("senderEnrollment"),
        toEmail: data.geduEmail,
        subject: geduT("unenrollmentGedu.subject", { gamerName: data.gamerName, productName: data.productName }),
        htmlContent: buildUnenrollmentGeduEmail(geduT, data.geduLocale, {
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
