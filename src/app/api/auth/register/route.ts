import { NextResponse, after } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { isEmailAlreadyRegistered } from "@/lib/auth-email.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";
import { ROUTES } from "@/lib/constants/routes";
import { REGISTRATION_CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";
import { detectLocaleFromHeader } from "@/lib/constants/locales";
import { buildWelcomeParentEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { utmFromCookieHeader, utmMetadataForConsent } from "@/lib/utm";
import { parseConsentCookieHeader } from "@/lib/consent";
import { reportAdConversion } from "@/lib/ad-conversions.server";
import { signUpProductFor } from "@/lib/sign-up-product.server";
import {
  resolveSignUpIntent,
  signUpIntentColumns,
} from "@/lib/sign-up-intent.server";
import { getOrigin } from "@/lib/url";
import {
  REGISTER_WEAK_PASSWORD,
  registerParentBody,
} from "@/services/users/parent-registration.contracts";

/**
 * POST /api/auth/register
 *
 * Parent self-registration. The mirror image of `/api/gedu/register`, and it
 * exists for the same reason that one does: creating the account server-side is
 * what lets the request that creates it also *send* something. A browser
 * `signUp()` returns to a page that has no verification token, no trusted
 * origin and no translator, so the welcome mail had nowhere to be sent from.
 *
 * WHERE IT DIFFERS FROM THE EDUCATOR ROUTE, WHICH IS NOT NOWHERE. Both create
 * an unprivileged account from an unauthenticated request and mail the address
 * they created it with — the same creation power. The exposure is not the same:
 * this route answers a distinct 409 when the address already has an account,
 * where `/api/gedu/register` collapses every refusal into one 400. So this one
 * confirms account existence to anyone who asks, and that is a deliberate
 * trade, not an oversight — a parent who mistypes their way into "that email
 * could not be registered" has no way to tell a duplicate from a broken form,
 * and the flow this replaced leaked the same fact client-side through the
 * empty `identities` array `signUp()` returns for an existing address. What
 * makes it acceptable here and not everywhere: forgot-password answers 200
 * whatever it finds, because nobody needs to be told anything by it, so the
 * enumeration would buy the user nothing at all. Registration cannot say
 * nothing — the parent is stuck until they know which of the two problems they
 * have — and an enumeration oracle that a sign-in form already provides is the
 * lesser evil.
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
    "parents self-register, so no session can exist yet. It creates an account and sends one email to the address that account was created with — the same creation power as the educator registration route beside it. Its exposure is one step wider: a 409 for an address that already has an account, which confirms existence. Accepted deliberately, because registration has to tell the parent which problem they have, and the client-side flow this replaced leaked the same fact through signUp()'s empty identities array",
  body: registerParentBody,

  handler: async ({ request, body }) => {
    const {
      email,
      password,
      firstName,
      lastName,
      homeLocationId,
      locale: requestedLocale,
      redirect,
      marketingConsent,
    } = body;

    // The attribution cookie, re-sanitised on the way out of it. A malformed
    // value degrades to null and the account is created without that field; the
    // five are independent, so a junk `utm_source` does not cost a well-formed
    // `utm_campaign`.
    //
    // GATED ON MARKETING CONSENT, DECIDED HERE. Counsel reads the UTM
    // parameters on a landing link as tracking, under the marketing purpose, so
    // the five `profiles.utm_*` columns are written only for a visitor whose
    // stored answer granted it — anything else (no cookie, a refusal,
    // analytics-only) drops all five keys and the columns stay NULL. The
    // answer is read off THIS request's own `Cookie` header, the same way the
    // Conversions API reporter below decides whether to send: a
    // `marketingConsent` field in the body is the checkbox for our mailing
    // list, a different question with a different answer, and either way a
    // client can send whatever it likes. `src/lib/utm.ts` has the ruling.
    const cookieHeader = request.headers.get("cookie");
    const utmMetadata = utmMetadataForConsent(
      parseConsentCookieHeader(cookieHeader),
      utmFromCookieHeader(cookieHeader),
    );

    // Which of our pages the parent set out to reach — a product, a
    // municipality club, a live landing page — decided by the row and stored
    // as its kind and id. Not gated on the marketing cookie: it is first-party,
    // and it is not attribution from a link. Never throws; no intent is `null`.
    const signUpIntent = await resolveSignUpIntent(redirect);

    const admin = createAdminClient();

    // The metadata shape is exactly what the browser `signUp()` sent before, and
    // it has to stay that way: `handle_new_user` reads `first_name`,
    // `last_name`, the five `utm_*` keys and the two `signup_intent_*` keys out
    // of it to build the profile row.
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
          // Each field omitted entirely when absent, so its column simply stays
          // null. The trigger re-sanitises whatever arrives, so a junk value
          // costs this registration nothing.
          ...utmMetadata,
          // Both or neither; the trigger re-checks the shape.
          ...signUpIntentColumns(signUpIntent),
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
      // The other refusal the registrant can act on, and the one the generic
      // answer below actively misdirects: GoTrue rejected the password (too
      // short for the project's policy, or found in a breach corpus). Nothing
      // is conflicting, so it stays a 400; the code is what lets the form say
      // "pick a different password" instead of "maybe you already have an
      // account". The provider's own sentence is not echoed — it is raw English
      // and sometimes names the check that fired.
      if (isWeakPassword(authError)) {
        return NextResponse.json(
          {
            error: "That password was refused as too weak.",
            code: REGISTER_WEAK_PASSWORD,
          },
          { status: 400 },
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
    // NEVER FATAL. The account exists, both fields are optional, and both are
    // re-pickable from settings — deleting a working account over either, or
    // stranding the parent on the registration form, would both be strictly
    // worse than losing the value.
    //
    // The locale is persisted, not just used for the mail below: it is the
    // language the parent registered in, and the profile is the only source a
    // browserless sender can consult — the Stripe webhook's confirmation mail
    // resolves profile.locale first and would otherwise fall through
    // Accept-Language on STRIPE'S request to English. (`register_gedu` already
    // persists the educator's locale; this is the parent half of the same
    // decision.)
    //
    // THE MARKETING ANSWER RIDES ALONG. `registration_marketing_consent` is the
    // write-once record of what the sign-up form was told about School of
    // Gaming's own mailing list; the current answer lives in Klaviyo, which the
    // parent sync sends this to. The column carries no Data API write grant,
    // so only this service-role write can set it. Written even when they
    // declined — false is "asked and said no", NULL is "never asked" — and an
    // absent field is read as a decline for the same reason the form always
    // sends one: see the contract. Losing it under-markets, which is the safe
    // direction to fail in, so it shares the extras' never-fatal handling.
    const profileExtras: {
      home_location_id?: string;
      locale?: string;
      registration_marketing_consent: boolean;
    } = { registration_marketing_consent: marketingConsent ?? false };
    if (homeLocationId) profileExtras.home_location_id = homeLocationId;
    if (requestedLocale) profileExtras.locale = requestedLocale;
    const { error: extrasError } = await admin
      .from("profiles")
      .update(profileExtras)
      .eq("id", userId);
    if (extrasError) {
      console.error(
        "[auth/register] could not save the profile extras",
        extrasError,
      );
    }

    // Locale for the mail: what the form was being read in, else what the
    // browser asked for, else English. The stored preference written above is
    // the same value, so consulting it would be a read-after-write for nothing.
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

    // What the account was opened under: the Terms and Conditions and the
    // guardian declaration, each recorded against the version that is current
    // right now. The contract already refused the request unless the
    // box was ticked, so reaching this line means the agreement happened; this
    // write is what makes it provable, and which TEXT it was given for.
    //
    // After everything that must succeed: nothing above it may be delayed or
    // broken by a consent write. It is NOT fatal for the same reason either — the account exists,
    // the parent has been mailed, and destroying a working account here would
    // cost them more than the missing row costs us.
    //
    // But it is not the same *kind* of loss, which is why the failure is logged
    // at error level with the id rather than shrugged off: a lost marketing
    // opt-in under-markets, while a lost record here is the legal value of the
    // tick going missing on an account that really did tick it. The id is in
    // the line so the row can be written by hand afterwards.
    try {
      const { error: termsError } = await admin.rpc("record_account_consents", {
        p_customer_id: userId,
        p_document_slugs: [...REGISTRATION_CONSENT_DOCUMENTS],
      });
      if (termsError) throw termsError;
    } catch (error) {
      console.error(
        `[auth/register] account consent write failed for ${userId}`,
        error,
      );
    }

    const response = NextResponse.json({ userId });

    // The account-creation conversion, reported from here to the advertising
    // platforms rather than by a script on the next page the browser loads. This handler is the only
    // place that knows an account was created, exactly once — the marker cookie
    // this replaced had to survive a redirect and a page load, and was lost or
    // double-counted whenever it did not.
    //
    // AFTER the response, so a platform's round trip cannot delay or fail a
    // registration that has already succeeded. The helper decides for itself
    // whether to send anything: it refuses unless this request's own consent
    // cookie says marketing is allowed, so an un-consented registration reports
    // nothing. The source path is the page the parent was on, stated rather than
    // derived from this route's own URL. The product is the advertised product
    // page the sign-up started from, if it did — looked up after the response
    // too, so it can neither delay nor fail the registration.
    //
    // No role check, and none is possible to need: the account this just created
    // is an ordinary customer, and a gamer cannot reach a registration form at
    // all.
    after(async () =>
      reportAdConversion(
        request,
        {
          event: "account_created",
          product: await signUpProductFor(redirect),
          sourcePath: ROUTES.register,
        },
        // The account this request just created — the parent's own id and
        // address.
        { id: userId, email: storedEmail },
      ),
    );

    return response;
  },
});

/**
 * Whether GoTrue refused this signup because of the password itself.
 *
 * The code is the whole test, unlike the shared duplicate-email check, and it is
 * enough: `weak_password` is the one code the auth client attaches to a
 * password refusal, and it attaches it on both paths — the modern response
 * carries `error_code: "weak_password"`, and the legacy response with no code
 * at all is recognised by its `weak_password.reasons` payload and re-thrown as
 * an error whose `code` is set to the same string. There is no third spelling
 * to fall back to a message for, and guessing at prose here would be worse than
 * the generic answer: a message-sniffing rule that fires on the wrong refusal
 * tells a parent to change a password that was never the problem.
 */
function isWeakPassword(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "weak_password"
  );
}
