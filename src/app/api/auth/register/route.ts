import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { detectLocaleFromHeader } from "@/lib/constants/locales";
import { buildWelcomeParentEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { sanitiseReferralCode } from "@/lib/referral";
import { getOrigin } from "@/lib/url";
import { registerParentBody } from "@/services/users/parent-registration.contracts";

/**
 * POST /api/auth/register
 *
 * Parent self-registration. The mirror image of `/api/gedu/register`, and it
 * exists for the same reason that one does: creating the account server-side is
 * what lets the request that creates it also *send* something. A browser
 * `signUp()` returns to a page that has no verification token, no trusted
 * origin and no translator, so the welcome mail had nowhere to be sent from.
 *
 * The account it creates is an ordinary customer, which is the whole of its
 * privilege story: `handle_new_user` hardcodes the role, so nothing in this
 * body — including a `role` key a caller invents — can influence what the new
 * profile is granted.
 *
 * What the parent path does NOT need, and the gedu path does: a promotion RPC.
 * A customer profile is exactly what the signup trigger already produces, so
 * there is no second write to unwind and no orphaned auth user to compensate
 * for. The one optional extra — the home location — is deliberately not fatal
 * (see below), so this route has no rollback path at all. That is a property of
 * the flow, not an omission.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "parents self-register, so no session can exist yet. It creates an account and sends one email to the address that account was created with — the same shape, and the same exposure, as the educator registration route beside it",
  body: registerParentBody,

  handler: async ({ request, body }) => {
    const {
      email,
      password,
      firstName,
      lastName,
      homeLocationId,
      locale: requestedLocale,
      referralCode,
    } = body;

    // The schema takes this as a plain string and leaves the format rule here,
    // deliberately — see the contract. A malformed value degrades to null and
    // the account is created without a code.
    const sanitisedReferralCode = sanitiseReferralCode(referralCode);

    const admin = createAdminClient();

    // The metadata shape is exactly what the browser `signUp()` sent before, and
    // it has to stay that way: `handle_new_user` reads `first_name`,
    // `last_name` and `referral_code` out of it to build the profile row.
    // `display_name` is not read by the trigger — it is the label the Supabase
    // Auth dashboard shows for the user — and `role` is not read either, since
    // the trigger hardcodes `customer`. Both are kept because the dashboard and
    // any future reader of the metadata should see the same thing they saw
    // before this moved server-side.
    //
    // `email_confirm` short-circuits the (disabled) confirmation flow, so the
    // parent can sign in immediately. Confirmation mail is ours, not Supabase's
    // — the verification link below is the whole of it.
    const composedDisplayName = `${firstName} ${lastName}`;
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          display_name: composedDisplayName,
          role: "customer",
          // Omitted entirely when absent, so the column simply stays null. The
          // trigger re-sanitises whatever arrives, so a junk value costs this
          // registration nothing.
          ...(sanitisedReferralCode !== null
            ? { referral_code: sanitisedReferralCode }
            : {}),
        },
      });

    if (authError) {
      console.error("[auth/register] createUser failed", authError);
      // The one refusal the registrant can act on gets its own status, so the
      // form can offer them the sign-in link instead of a dead end. It says no
      // more than the sign-in form would already tell them, and no more than
      // the old client-side flow did.
      if (isEmailAlreadyRegistered(authError)) {
        return NextResponse.json(
          { error: "That email is already registered. Sign in instead." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            "That email could not be registered. If you already have an account, sign in instead.",
        },
        { status: 400 },
      );
    }

    const userId = authData.user.id;
    // The address Supabase actually stored, which is what the profile row holds
    // and therefore what the verification token has to be bound to — GoTrue
    // normalises the address on the way in, so the string the parent typed can
    // differ from it and a token minted against the typed one would never
    // verify.
    const storedEmail = authData.user.email ?? email;

    // The optional home location, written here rather than passed through
    // signup metadata. The alternative was to have `handle_new_user` resolve it
    // — and that trigger is the one function in the schema that assigns roles,
    // runs SECURITY DEFINER past RLS, and has a test suite whose whole subject
    // is that client-supplied metadata cannot influence what it grants. Teaching
    // it to read a caller-supplied foreign key is real surface added to the most
    // sensitive object here, to save one statement.
    //
    // NEVER FATAL. The account exists, the field is optional, and it is
    // re-pickable from settings — deleting a working account over it, or
    // stranding the parent on the registration form, would both be strictly
    // worse than losing the value.
    if (homeLocationId) {
      const { error: locationError } = await admin
        .from("profiles")
        .update({ home_location_id: homeLocationId })
        .eq("id", userId);
      if (locationError) {
        console.error(
          "[auth/register] could not save the home location",
          locationError,
        );
      }
    }

    // Locale for the mail: what the form was being read in, else what the
    // browser asked for, else English. There is no stored preference to consult
    // — the profile was created a moment ago and `handle_new_user` writes no
    // locale — which is precisely why the form sends the one it is rendering in.
    const locale =
      requestedLocale ??
      detectLocaleFromHeader(request.headers.get("Accept-Language"));

    // The welcome mail. Wrapped because a Brevo failure must not fail the
    // registration: the account is the outcome the parent asked for, it exists,
    // and they can send themselves a fresh verification link from settings.
    try {
      // The TRUSTED origin, never the raw Host header. These links go in an
      // email and one of them carries a signed token, so a spoofed
      // `Host: evil.com` would turn it into a phishing URL the recipient has
      // every reason to trust.
      const origin = getOrigin(request);
      const token = await createEmailVerificationToken(userId, storedEmail);
      const t = await getEmailTranslator(locale);

      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME,
        toEmail: storedEmail,
        subject: t("welcomeParent.subject"),
        htmlContent: buildWelcomeParentEmail(t, locale, {
          firstName,
          verificationUrl: `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(token)}`,
          dashboardUrl: `${origin}${ROUTES.customer.dashboard}`,
          shopUrl: `${origin}${ROUTES.shop}`,
          settingsUrl: `${origin}${ROUTES.settings}`,
        }),
        // Product mail to a person: someone replying to this is asking us
        // something, so the reply goes to the monitored support inbox rather
        // than the unattended sending address.
        replyToEmail: SUPPORT_EMAIL,
      });
    } catch (error) {
      console.error("[auth/register] welcome email failed", error);
    }

    return { userId };
  },
});

/**
 * Whether GoTrue refused this signup because the address already has an
 * account.
 *
 * Read the machine-readable code first — `email_exists` is what current GoTrue
 * sends — and fall back to the message, because the code is a relatively recent
 * addition and an older deployment (or a proxy that drops it) still says the
 * same thing in prose. Getting this wrong costs a 409 that should have been a
 * 400, not a security property: both answers refuse, and neither reveals more
 * than the sign-in form does.
 */
function isEmailAlreadyRegistered(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "email_exists") return true;
  return (
    "message" in error &&
    typeof error.message === "string" &&
    /already( been)? registered/i.test(error.message)
  );
}
