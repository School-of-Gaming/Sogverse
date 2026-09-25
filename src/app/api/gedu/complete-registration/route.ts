import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { detectLocaleFromHeader, resolveLocale } from "@/lib/constants/locales";
import { buildWelcomeGeduEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { registrationCompletedResponse } from "@/lib/registration-intent-cookie";
import { getOrigin } from "@/lib/url";
import { completeGeduRegistrationBody } from "@/services/gedu/gedu-registration.contracts";
import {
  geduPhoneDigits,
  promoteToGedu,
  resolveGeduGameHandles,
} from "@/services/gedu/gedu-registration.server";
import { REGISTRATION_ALREADY_COMPLETE } from "@/services/users/parent-registration.contracts";
import {
  isEmailVerifiedByGoogle,
  utmProfileColumns,
} from "@/services/users/registration-completion.server";

/**
 * POST /api/gedu/complete-registration
 *
 * Finishes an educator registration that began with Google on the Gedu
 * register page. The account exists and is signed in, as the customer the
 * new-user trigger makes of every account, and owes its registration; this
 * route asks for what `/register-gedu` asks minus the address and password,
 * promotes it to an uncertified Gedu through the same `register_gedu` call the
 * register route makes. That call also marks it registered, inside the
 * promotion's own transaction, so the account can never be a Gedu that still
 * owes its registration.
 *
 * It records no consents and shows no terms, exactly as the register route
 * does not: an educator's terms are their contract, signed later on its own
 * page.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  // A fresh Google account has no PIN yet — the finish page stands in the PIN
  // gate's place — so the PIN lock would refuse the only caller this route
  // exists for. The registration guard below narrows the audience instead.
  allowUnverified: true,
  // The role gate refuses an account that owes its registration everywhere
  // else; this route is where it pays what it owes.
  allowRegistrationOwed: true,
  body: completeGeduRegistrationBody,

  handler: async ({ request, body, user, profile }) => {
    const {
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

    // The role gate narrowed this to a customer; the stamp is the rest of the
    // guard. A parent who has finished registering can never promote
    // themselves to a Gedu through here.
    if (profile.registration_completed_at !== null) {
      return NextResponse.json(
        {
          error: "This account has already finished registering.",
          code: REGISTRATION_ALREADY_COMPLETE,
        },
        { status: 409 },
      );
    }

    const phoneDigits = geduPhoneDigits(phone);
    if (phoneDigits === null) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 },
      );
    }

    const locale = resolveLocale(requestedLocale);
    const admin = createAdminClient();
    const userId = user.id;

    const handles = await resolveGeduGameHandles({
      minecraftUsername,
      robloxUsername,
    });

    const { error: rpcError } = await promoteToGedu(admin, {
      userId,
      fields: { firstName, lastName, spokenLanguages, locationIds },
      locale,
      phoneDigits,
      handles,
    });
    if (rpcError) {
      // NO deleteUser here, unlike the register route. That route created the
      // auth user in the same request, so deleting it undoes its own work;
      // this account is the person's own, created by their Google sign-in and
      // possibly linked to it, and the RPC is one transaction, so a failure
      // leaves it exactly as it was — a customer still owing registration,
      // held on the finish page, free to retry.
      console.error("[gedu/complete-registration] register_gedu failed", rpcError);
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }

    // The rest the register route gets from signup metadata or never needs:
    // the attribution (consent-gated, the columns' one write) and Google's word
    // on the address. Best effort: the registration itself committed with the
    // promotion, and neither is worth failing a registration that has already
    // happened — a lost attribution under-reports, and an unverified address
    // is mailed a link below.
    const emailVerifiedByGoogle = await isEmailVerifiedByGoogle(
      admin,
      userId,
      profile.email,
    );
    const followUp = {
      ...utmProfileColumns(request, utm),
      ...(emailVerifiedByGoogle
        ? { email_verified_at: new Date().toISOString() }
        : {}),
    };
    if (Object.keys(followUp).length > 0) {
      const { error: followUpError } = await admin
        .from("profiles")
        .update(followUp)
        .eq("id", userId);
      if (followUpError) {
        console.error(
          `[gedu/complete-registration] attribution/verification write failed for ${userId}`,
          followUpError,
        );
      }
    }

    // The welcome mail, swallowed on failure like every product send.
    const mailLocale = resolveLocale(
      requestedLocale,
      resolveLocale(
        profile.locale,
        detectLocaleFromHeader(request.headers.get("Accept-Language")),
      ),
    );
    try {
      // The TRUSTED origin, never the raw Host header — the link below carries
      // a signed token.
      const origin = getOrigin(request);
      const t = await getEmailTranslator(mailLocale);
      const verificationUrl = emailVerifiedByGoogle
        ? undefined
        : `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(
            await createEmailVerificationToken(userId, profile.email),
          )}`;

      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME,
        toEmail: profile.email,
        subject: t("welcomeGedu.subject"),
        htmlContent: buildWelcomeGeduEmail(t, mailLocale, {
          firstName,
          verificationUrl,
          dashboardUrl: `${origin}${ROUTES.gedu.dashboard}`,
          settingsUrl: `${origin}${ROUTES.settings}`,
        }),
        // Product mail to a person: a reply is a question for support.
        replyToEmail: SUPPORT_EMAIL,
      });
    } catch (error) {
      console.error("[gedu/complete-registration] welcome email failed", error);
    }

    return registrationCompletedResponse();
  },
});
