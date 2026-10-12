"use client";

import { useState } from "react";
import { Link, getPathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { pushGtmEvent } from "@/lib/gtm";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { REGISTER_WEAK_PASSWORD } from "@/services/users/parent-registration.contracts";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth, useUtm } from "@/providers";
import { completeRegistrationQuery } from "@/lib/navigation/post-auth-redirect";
import { ContinueWithGoogle } from "./continue-with-google";
import { NameFields, useNameSchemaFields } from "./name-fields";
import { ParentAccountFields, useParentAccountFields } from "./parent-account-fields";

const MIN_PASSWORD_LENGTH = 8;

/** The machine-readable half of a refusal; the route's `error` is for the log. */
const refusal = z.object({ error: z.string().optional(), code: z.string().optional() });

/**
 * Which `auth.register` sentence a refused registration shows.
 *
 * The route's `error` strings are raw English written for a log, so every
 * refusal is ours to word. A 409 is the address already having an account. A
 * `WEAK_PASSWORD` code is the password being the problem, and gets its own
 * answer: looking for a sign-in is precisely the wrong move when no account
 * exists and the fix is one field away. Anything else is the route's catch-all
 * for a failure it did not recognise — which can still be an address that
 * already has an account — so the generic line says the address could not be
 * registered and points an existing account holder at sign-in. That hint is
 * safe there only because the weak-password case never reaches it. The
 * route's own words go to the console.
 */
async function refusalKey(
  response: Response,
): Promise<"accountExists" | "weakPassword" | "failed"> {
  if (response.status === 409) return "accountExists";

  const parsed = refusal.safeParse(await response.json().catch(() => null));
  if (parsed.success && parsed.data.code === REGISTER_WEAK_PASSWORD) {
    return "weakPassword";
  }

  console.error(
    "[register-form] registration refused:",
    response.status,
    parsed.success ? parsed.data.error : undefined,
  );
  return "failed";
}

export function RegisterForm({ redirect: redirectParam }: { redirect: string | null }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const locale = useLocale();
  const { redirect, safeRedirect, status, navigateAfterAuth } =
    useAuthRedirect(redirectParam);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  // Where this visit came from, if a marketing link carried UTM params. Held in
  // memory by the root provider since the landing page, so it survives browsing
  // the whole site as client-side navigation.
  const utm = useUtm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const account = useParentAccountFields();
  const nameFields = useNameSchemaFields();
  // Every writer hands this an already-translated sentence: the schema below,
  // the account fields' refusal and the Google button's failure.
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const supabase = getClient();

  // Built here rather than at module level so its refusals are in the reader's
  // language. Compared via member expressions (d.password), not a bare
  // `password === confirmPassword`, which trips
  // security/detect-possible-timing-attacks for two client-side form fields.
  const registerSchema = z.object({
    email: z.string().email(t('validation.emailInvalid')),
    password: z.string().min(MIN_PASSWORD_LENGTH, c('passwordMinLength', { count: MIN_PASSWORD_LENGTH })),
    confirmPassword: z.string(),
    ...nameFields,
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('resetPassword.passwordsDoNotMatch'),
    path: ["confirmPassword"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Before `setIsLoading`, so a refused submit leaves the form exactly as
    // usable as it was.
    const accountError = account.validate();
    if (accountError) {
      setError(accountError);
      return;
    }

    setIsLoading(true);

    try {
      const validatedData = registerSchema.parse({
        email,
        password,
        confirmPassword,
        firstName,
        lastName,
      });

      // Registration happens server-side, on the route that can also send the
      // welcome mail: it needs a verification token, a trusted origin and a
      // translator, none of which a browser signUp() returns to. The optional
      // home location goes with it in the same request rather than becoming a
      // second, client-side write against a session that has not been
      // established yet.
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validatedData.email,
          password: validatedData.password,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          // Which language to write the welcome mail in. The profile has no
          // stored preference yet — it is created by this very request — so the
          // locale the form is being read in is the best answer anyone has.
          locale,
          // Marketing provenance, written by the handle_new_user trigger to the
          // three profiles.utm_* columns and never updatable afterwards. It
          // travels in the body (and from there into signup metadata) rather
          // than as a later profile write, because a client write would need
          // GRANT UPDATE on those columns TO authenticated, handing every user
          // the permanent ability to rewrite their own attribution; the grant is
          // the thing we are refusing, and the trigger is what lets us.
          utm: {
            source: utm.source ?? undefined,
            medium: utm.medium ?? undefined,
            campaign: utm.campaign ?? undefined,
          },
          // The product page this visit came from, so the account-creation
          // report can name it. The route re-checks it; nothing navigates on it.
          redirect: safeRedirect ?? undefined,
          ...account.requestBody,
        }),
      });

      if (!response.ok) {
        setError(t(`register.${await refusalKey(response)}`));
        setIsLoading(false);
        return;
      }

      // The account exists and nothing has been signed up *for* — which is
      // exactly what `sign_up` names, and why it carries nothing but the page
      // it happened on: nothing else is known at this moment.
      //
      // Pushed here rather than after the sign-in because here is where the
      // outcome is certain and the document is certainly still ours. The
      // navigation below unloads the page before Google's tag would send this
      // on its own schedule, and that is fine: the tag sends whatever it is
      // holding as the page unloads.
      //
      // No consent check belongs at this call site. `pushGtmEvent` decides for
      // itself whether the container was ever armed, and a second opinion here
      // could only disagree with it.
      pushGtmEvent({
        event: GTM_EVENTS.accountCreated,
        page_path: ROUTES.register,
      });

      // The account exists but this browser is not signed in — the route used
      // the admin client, so no session was ever issued here. Sign in now.
      // Freeze auth state *before* the call: Supabase fires SIGNED_IN
      // synchronously inside it, and freezing afterwards would be too late to
      // stop the Header flashing signed-in chrome. Same shape as the educator
      // registration form, and the matching comment in login-form.tsx.
      freezeUntilNavigation();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });
      if (signInError) {
        // The account exists; only this browser's session is missing. GoTrue's
        // reason is English for the log, and the parent's way on is to sign in.
        console.error("[register-form] sign-in after registration failed:", signInError);
        unfreezeAuthState();
        setError(t('signInAfterRegisterFailed'));
        setIsLoading(false);
        return;
      }

      // New parent accounts have no gamers yet, but we still send them
      // through /select-profile so the "Add Gamer" tile is the first thing
      // they see. A safe ?redirect= still wins via navigateAfterAuth, and the
      // navigation is a full page load — the browser client's session singleton
      // is seeded from cookies at construction, so only a document unload
      // rebuilds it. The document is unloading: leave isLoading set.
      navigateAfterAuth(ROUTES.selectProfile);
      return;
    } catch (err) {
      unfreezeAuthState();
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(c('unexpectedError'));
      }
      setIsLoading(false);
    }
  };

  return (
    // The same width as the educator registration card next door, and the pair
    // rows below are that card's too. One registration form, two audiences: a
    // parent arriving from a shop link and an educator arriving from a
    // recruitment one meet the same page at the same measure, which is what
    // stops the narrower of the two reading as an older screen.
    <Card className="w-full max-w-2xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t('register.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('register.description')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Alert variant="info">
            <div>
              <AlertTitle sentence>
                {t('register.parentAccountAlertTitle')}
              </AlertTitle>
              <AlertDescription>
                {t('register.parentAccountAlertDescription')}
              </AlertDescription>
            </div>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {/* A Google account arrives with no name, terms or consents, so it
              lands on the finish page, in the language this page is read in —
              the ticks below are this form's and do not travel with it. The
              visit's attribution does, on the address: the round trip through
              Google unloads the tab that holds it. So does the product page
              this visit came from, which the finish page lands on. */}
          <ContinueWithGoogle
            next={getPathname({
              href: {
                pathname: ROUTES.completeRegistration,
                query: completeRegistrationQuery({
                  asGedu: false,
                  utm,
                  redirect: safeRedirect,
                }),
              },
              locale,
            })}
            disabled={isLoading}
            onBegin={() => {
              setError(null);
              setGooglePending(true);
            }}
            onFailed={(message) => {
              setGooglePending(false);
              setError(message);
            }}
          />
          <NameFields
            firstLabel={t('register.parentFirstName')}
            lastLabel={t('register.parentLastName')}
            firstPlaceholder={t('register.firstNamePlaceholder')}
            lastPlaceholder={t('register.lastNamePlaceholder')}
            firstName={firstName}
            lastName={lastName}
            setFirstName={setFirstName}
            setLastName={setLastName}
            disabled={isLoading}
          />
          <Field label={c('email')} htmlFor="email">
            <Input
              id="email"
              type="email"
              placeholder={t('register.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="username"
            />
          </Field>
          {/* The password and its confirmation, paired at the same breakpoint
              as the names above and for the same reason: one answer, typed
              twice. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={c('password')}
              htmlFor="password"
              hint={c('passwordMinLength', { count: MIN_PASSWORD_LENGTH })}
            >
              <PasswordInput
                id="password"
                placeholder={t('register.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field label={c('confirmPassword')} htmlFor="confirmPassword">
              <PasswordInput
                id="confirmPassword"
                placeholder={t('register.confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>
          <ParentAccountFields fields={account} disabled={isLoading} />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading || googlePending}>
            {status ?? (isLoading ? t('register.creatingAccount') : c('createAccount'))}
          </Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div>
              {t.rich('register.alreadyHaveAccount', {
                link: (chunks) => (
                  <Link href={
                      redirect
                        ? { pathname: ROUTES.login, query: { redirect } }
                        : ROUTES.login
                    } className="text-act hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </div>
            <div>
              {t.rich('needHelp', {
                email: SUPPORT_EMAIL,
                link: (chunks) => (
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-act hover:underline">
                    {chunks}
                  </a>
                ),
              })}
            </div>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
