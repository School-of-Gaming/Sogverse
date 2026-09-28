import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectLocaleFromHeader, resolveLocale } from "@/lib/constants/locales";
import { registerGeduBody } from "@/services/gedu/gedu-registration.contracts";
import {
  geduPhoneDigits,
  promoteToGedu,
  resolveGeduGameHandles,
} from "@/services/gedu/gedu-registration.server";
import { utmMetadataForConsent } from "@/lib/utm";
import { parseConsentCookieHeader } from "@/lib/consent";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildWelcomeGeduEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { getOrigin } from "@/lib/url";

/**
 * POST /api/gedu/register
 *
 * Educators self-register, like parents. A new gedu is created unverified; an
 * admin verifies them before they can be assigned to a group (the verification
 * gate lives in the assignment UI, not here).
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "educators self-register, so no session can exist yet. The highest-value public route on the surface: it creates an account, and the account it creates is unverified until an admin approves it",
  body: registerGeduBody,

  // The promotion RPC's failure used to be returned to the registrant as a 500
  // carrying its raw message. That is closed: it is logged and answered
  // generically. Nothing here opts into disclosure, because an unauthenticated
  // caller is the last one who should be shown database text.

  handler: async ({ request, body }) => {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      spokenLanguages,
      locale: requestedLocale,
      locationIds,
      minecraftUsername,
      robloxUsername,
      utm,
    } = body;

    const locale = resolveLocale(requestedLocale);

    // The body schema takes these as plain strings and leaves the format rule to
    // here, deliberately: the educator never typed the UTM values and cannot see
    // them, so a malformed one must not become a 400 that blocks their
    // registration. A bad value degrades to null and the account is created
    // without that field — the same outcome as arriving with no link at all.
    //
    // GATED ON MARKETING CONSENT, read off this request's own `Cookie` header,
    // exactly as the parent route does it: counsel reads the UTM parameters on
    // a landing link as tracking under the marketing purpose, so the three
    // `profiles.utm_*` columns are written only for a visitor whose stored
    // answer granted it. An educator who refused the banner, chose
    // analytics-only or never answered creates an account with all three NULL.
    // `src/lib/utm.ts` has the ruling.
    const utmMetadata = utmMetadataForConsent(
      parseConsentCookieHeader(request.headers.get("cookie")),
      utm,
    );

    // Phone → digits to match the profiles.phone CHECK. Empty or absent stays
    // "" and the RPC NULLIFs it.
    const phoneDigits = geduPhoneDigits(phone);
    if (phoneDigits === null) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Before the account exists: nothing about either name can refuse the
    // registration, and `createUser` below is the step that cannot be undone
    // cheaply, so everything else goes first.
    const handles = await resolveGeduGameHandles({
      minecraftUsername,
      robloxUsername,
    });

    // Step 1: create the auth user. The handle_new_user trigger seeds a
    // customer-role profile + customer_profiles row; email_confirm
    // short-circuits the (disabled) confirmation flow so the gedu can sign in
    // immediately.
    const composedDisplayName = [firstName, lastName].filter(Boolean).join(" ");
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          display_name: composedDisplayName,
          // The same three metadata keys the parent path uses, reaching the same
          // trigger, which writes profiles.utm_source / utm_medium /
          // utm_campaign and re-sanitises on the way in. Each is omitted when
          // absent so its column simply stays null. The promotion RPC below
          // names a targeted column list that mentions none of them, so the
          // trigger-written values survive.
          ...utmMetadata,
        },
      });

    if (authError) {
      // Most commonly: the email is already registered. That is the one thing
      // the registrant can act on, so it keeps its own copy — and it says no
      // more than the sign-in form would already tell them.
      console.error("[gedu/register] createUser failed", authError);
      return NextResponse.json(
        {
          error:
            "That email could not be registered. If you already have an account, sign in instead.",
        },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    // Step 2: atomic promotion. The RPC swaps customer→gedu, writes the profile
    // fields, coverage, and Minecraft account in one transaction. On any
    // failure we delete the auth user so no half-promoted debris survives — the
    // narrow remaining gap (process death between createUser and the RPC) is
    // far smaller than the old multi-step invite route's exposure.
    const { error: rpcError } = await promoteToGedu(admin, {
      userId,
      fields: { firstName, lastName, spokenLanguages, locationIds },
      locale,
      phoneDigits,
      handles,
    });

    if (rpcError) {
      await admin.auth.admin.deleteUser(userId);
      console.error("[gedu/register] register_gedu failed", rpcError);
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }

    // Step 3: the welcome mail, and the only step whose failure the educator
    // never hears about. The account is the outcome they asked for and it now
    // exists; a Brevo error must not undo it, and a fresh verification link is
    // one button away in settings.
    //
    // The locale is the one the form was being read in, else the browser's,
    // else English — one step longer than the chain the profile's own `locale`
    // takes above, because a registrant who sent no preference still has a
    // browser that stated one, and a mail is the one artefact that leaves
    // before they can pick.
    const mailLocale =
      resolveLocale(
        requestedLocale,
        detectLocaleFromHeader(request.headers.get("Accept-Language")),
      );
    try {
      // The TRUSTED origin, never the raw Host header: this mail carries a
      // signed verification token, and a spoofed Host would make it a phishing
      // link the recipient has every reason to trust.
      const origin = getOrigin(request);
      // Bound to the address Supabase actually stored — GoTrue normalises it on
      // the way in, so a token minted against the typed string could never
      // verify.
      const storedEmail = authData.user.email ?? email;
      const token = await createEmailVerificationToken(userId, storedEmail);
      const t = await getEmailTranslator(mailLocale);

      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME,
        toEmail: storedEmail,
        subject: t("welcomeGedu.subject"),
        htmlContent: buildWelcomeGeduEmail(t, mailLocale, {
          firstName,
          verificationUrl: `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(token)}`,
          dashboardUrl: `${origin}${ROUTES.gedu.dashboard}`,
          settingsUrl: `${origin}${ROUTES.settings}`,
        }),
        // Product mail to a person: an educator replying to this is asking us
        // something, so the reply goes to the monitored support inbox rather
        // than the unattended sending address.
        replyToEmail: SUPPORT_EMAIL,
      });
    } catch (error) {
      console.error("[gedu/register] welcome email failed", error);
    }

    return { userId };
  },
});
