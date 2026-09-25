import { NextResponse, after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { REGISTRATION_CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";
import { detectLocaleFromHeader, resolveLocale } from "@/lib/constants/locales";
import { buildWelcomeParentEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { reportMetaConversion } from "@/lib/meta-conversions.server";
import { getOrigin } from "@/lib/url";
import {
  REGISTRATION_ALREADY_COMPLETE,
  completeParentRegistrationBody,
} from "@/services/users/parent-registration.contracts";
import {
  isEmailVerifiedByGoogle,
  utmProfileColumns,
} from "@/services/users/registration-completion.server";

/**
 * POST /api/auth/complete-registration
 *
 * Finishes a parent registration that began with Google. The account already
 * exists and is signed in — the Google identity created it — but it arrived
 * with no name, no terms and no consents, so `registration_completed_at` is
 * NULL and the proxy holds it on the finish page. This route supplies what the
 * register form would have, then marks the account registered.
 *
 * **The stamp is the last write.** The terms record is the one failure that
 * stops the route (500), and it stops it before the stamp, so an account is
 * only ever "registered" with the record of what it was opened under — and one
 * that failed is still owed the finish page, where the parent can simply press
 * the button again (every write before the stamp is safe to repeat).
 *
 * **Only an account that owes its registration may run this.** A customer
 * whose stamp is set — every password account from creation, and every
 * existing parent who linked Google — gets a 409 and nothing is written, so
 * nobody can use this route to rename themselves past settings, re-record
 * consents, or write the write-once attribution columns a second time.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  // A fresh Google account has no PIN yet — the finish page stands in the PIN
  // gate's place — so the PIN lock would refuse the only caller this route
  // exists for. The guard below is what narrows the audience instead: nothing
  // is written unless the account still owes its registration.
  allowUnverified: true,
  // The role gate refuses an account that owes its registration everywhere
  // else; this route is where it pays what it owes.
  allowRegistrationOwed: true,
  body: completeParentRegistrationBody,

  handler: async ({ request, body, user, profile }) => {
    const {
      firstName,
      lastName,
      homeLocationId,
      locale: requestedLocale,
      utm,
      marketingConsent,
    } = body;

    // The role gate already narrowed this to a customer; the registration
    // stamp is the rest of the "fresh account" guard.
    if (profile.registration_completed_at !== null) {
      return NextResponse.json(
        {
          error: "This account has already finished registering.",
          code: REGISTRATION_ALREADY_COMPLETE,
        },
        { status: 409 },
      );
    }

    const admin = createAdminClient();
    const userId = user.id;
    const now = new Date().toISOString();

    // Google's word on the address, when it gave one: the verification link
    // would be a question already answered.
    const emailVerifiedByGoogle = await isEmailVerifiedByGoogle(
      admin,
      userId,
      profile.email,
    );

    // Everything the register form would have written, in one statement. The
    // attribution columns and the verification stamp have no authenticated
    // UPDATE grant, which is why this is the service-role client.
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        ...(homeLocationId ? { home_location_id: homeLocationId } : {}),
        ...(requestedLocale ? { locale: requestedLocale } : {}),
        ...utmProfileColumns(request, utm),
        ...(emailVerifiedByGoogle ? { email_verified_at: now } : {}),
      })
      .eq("id", userId);
    if (profileError) {
      console.error(
        `[auth/complete-registration] profile write failed for ${userId}`,
        profileError,
      );
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }

    // What the account is opened under. FATAL here, unlike on the register
    // route: there the account already exists and a failure is logged for a
    // hand repair, while here the account is not registered until this row
    // exists — so the stamp below waits for it, and the parent retries.
    const { error: termsError } = await admin.rpc("record_account_consents", {
      p_customer_id: userId,
      p_document_slugs: [...REGISTRATION_CONSENT_DOCUMENTS],
    });
    if (termsError) {
      console.error(
        `[auth/complete-registration] account consent write failed for ${userId}`,
        termsError,
      );
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }

    // The marketing answer, written even when it is a no, and never fatal —
    // the register route's reasoning, unchanged: losing an opt-in
    // under-markets, which is the safe direction to fail in.
    try {
      const { error: consentError } = await admin.rpc(
        "record_registration_marketing_consent",
        { p_customer_id: userId, p_granted: marketingConsent ?? false },
      );
      if (consentError) throw consentError;
    } catch (error) {
      console.error(
        "[auth/complete-registration] marketing consent write failed",
        error,
      );
    }

    // The stamp, last: from here the proxy lets the account through.
    //
    // **Conditional, because the guard above is a read.** Two submissions of
    // the finish page (a double click, two tabs) can both pass it while the
    // column is still NULL. Everything before this point is safe to run twice:
    // the profile write sets the same person's own answers again, the terms
    // record is ON CONFLICT DO NOTHING, and the marketing write only records a
    // change of state. The stamp is where the two part: only one statement
    // finds the column NULL, and the other request gets the guard's 409 — so
    // the welcome mail and the conversion below go out exactly once.
    const { data: stamped, error: stampError } = await admin
      .from("profiles")
      .update({ registration_completed_at: now })
      .eq("id", userId)
      .is("registration_completed_at", null)
      .select("id");
    if (stampError) {
      console.error(
        `[auth/complete-registration] registration stamp failed for ${userId}`,
        stampError,
      );
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }
    if (stamped.length === 0) {
      return NextResponse.json(
        {
          error: "This account has already finished registering.",
          code: REGISTRATION_ALREADY_COMPLETE,
        },
        { status: 409 },
      );
    }

    // The mail's language: what the form was read in, else the account's
    // stored preference, else what the browser asked for.
    const locale =
      requestedLocale ??
      resolveLocale(
        profile.locale,
        detectLocaleFromHeader(request.headers.get("Accept-Language")),
      );

    // The welcome mail, swallowed on failure like every product send: the
    // registration is the outcome, and it is committed.
    try {
      // The TRUSTED origin, never the raw Host header — the link below carries
      // a signed token.
      const origin = getOrigin(request);
      const t = await getEmailTranslator(locale);
      const verificationUrl = emailVerifiedByGoogle
        ? undefined
        : `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(
            await createEmailVerificationToken(userId, profile.email),
          )}`;

      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME,
        toEmail: profile.email,
        subject: t("welcomeParent.subject"),
        htmlContent: buildWelcomeParentEmail(t, locale, {
          firstName,
          verificationUrl,
          dashboardUrl: `${origin}${ROUTES.customer.dashboard}`,
          shopUrl: `${origin}${ROUTES.shop}`,
          settingsUrl: `${origin}${ROUTES.settings}`,
        }),
        // Product mail to a person: a reply is a question for support.
        replyToEmail: SUPPORT_EMAIL,
      });
    } catch (error) {
      console.error("[auth/complete-registration] welcome email failed", error);
    }

    // The account-creation conversion, reported here because this is where a
    // Google account becomes a registered one — exactly once, since only the
    // request whose stamp changed a row gets this far. After the response, and
    // only with the request's own marketing consent (the reporter decides).
    after(
      reportMetaConversion(request, {
        event: "account_created",
        sourcePath: ROUTES.register,
      }),
    );

    return { ok: true };
  },
});
