"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeLocationField } from "@/components/locations/home-location-field";
import { getClient } from "@/lib/supabase/client";
import { readErrorMessage } from "@/lib/api/json-response";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, SUPPORT_EMAIL } from "@/lib/constants";
import { REGISTER_WEAK_PASSWORD } from "@/services/users/parent-registration.contracts";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth, useReferralCode } from "@/providers";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  // `.trim()` before the length checks, so they measure the name rather than
  // the whitespace around it — " A" is not a two-character first name. The
  // route's own contract (`registerParentBody`) trims again for the same
  // reason: it is the one that has to hold, because the name goes from there
  // into the auth user's metadata and the handle_new_user trigger copies it
  // verbatim into the profile. This copy exists so the message a parent reads
  // is this form's, in their language, before a round trip.
  firstName: z.string().trim().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().trim().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

/** Just the machine-readable half of a refusal; the message is read separately. */
const refusalCode = z.object({ code: z.string().optional() });

/**
 * Which sentence a refused registration shows.
 *
 * Two refusals are ours to word, because the parent can act on both and the
 * route's `error` strings are raw English written for a log. A 409 is the
 * address already having an account. A `WEAK_PASSWORD` code is the password
 * being the problem — the case that most needs its own answer, because the
 * generic one ends "if you already have an account, sign in instead", and going
 * to look for a sign-in is precisely the wrong move when no account exists and
 * the fix is one field away. Everything else keeps the route's own message,
 * which is the honest thing to show for a refusal nobody predicted.
 *
 * The code is read off a clone so `readErrorMessage` can still read the
 * original: a Response body is consumed once, and both readers want it.
 */
async function refusalMessage(
  response: Response,
  messages: { accountExists: string; weakPassword: string; unexpected: string },
): Promise<string> {
  if (response.status === 409) return messages.accountExists;

  const parsed = refusalCode.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null),
  );
  if (parsed.success && parsed.data.code === REGISTER_WEAK_PASSWORD) {
    return messages.weakPassword;
  }

  return readErrorMessage(response, messages.unexpected);
}

export function RegisterForm({ redirect: redirectParam }: { redirect: string | null }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const locale = useLocale();
  const { redirect, status, navigateAfterAuth } = useAuthRedirect(redirectParam);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  // Where this visit came from, if a marketing link carried `?ref=`. Held in
  // memory by the root provider since the landing page; never on this device.
  const referralCode = useReferralCode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [homeLocation, setHomeLocation] = useState<LocationPick | null>(null);
  // Unticked by default, and it stays that way unless the parent ticks it: an
  // opt-in that arrives pre-ticked is not an opt-in.
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
          homeLocationId: homeLocation?.location.id,
          // Which language to write the welcome mail in. The profile has no
          // stored preference yet — it is created by this very request — so the
          // locale the form is being read in is the best answer anyone has.
          locale,
          // Marketing provenance, written by the handle_new_user trigger to
          // profiles.referral_code and never updatable afterwards. It travels
          // in the body (and from there into signup metadata) rather than as a
          // later profile write, because a client write would need
          // GRANT UPDATE(referral_code) TO authenticated, handing every user the
          // permanent ability to rewrite their own attribution; the grant is the
          // thing we are refusing, and the trigger is what lets us.
          referralCode: referralCode ?? undefined,
          // Always an explicit boolean, never omitted. The schema takes it as
          // optional so an older client that predates the box can still
          // register — but a form that *shows* the question has an answer
          // either way, and "unticked" is a decision the parent made rather
          // than a field they were never asked about.
          marketingConsent,
        }),
      });

      if (!response.ok) {
        setError(
          await refusalMessage(response, {
            accountExists: t('register.accountExists'),
            weakPassword: t('register.weakPassword'),
            unexpected: c('unexpectedError'),
          }),
        );
        setIsLoading(false);
        return;
      }

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
        unfreezeAuthState();
        setError(signInError.message);
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
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t('register.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('register.description')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Alert variant="info">
            <Info className="h-4 w-4 shrink-0" />
            <div>
              <AlertTitle>{t('register.parentAccountAlertTitle')}</AlertTitle>
              <AlertDescription>
                {t('register.parentAccountAlertDescription')}
              </AlertDescription>
            </div>
          </Alert>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Field label={t('register.parentFirstName')} htmlFor="firstName">
            <Input
              id="firstName"
              type="text"
              placeholder={t('register.firstNamePlaceholder')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isLoading}
              required
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="given-name"
            />
          </Field>
          <Field label={t('register.parentLastName')} htmlFor="lastName">
            <Input
              id="lastName"
              type="text"
              placeholder={t('register.lastNamePlaceholder')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isLoading}
              required
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="family-name"
            />
          </Field>
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
          <Field
            label={c('password')}
            htmlFor="password"
            hint={c('passwordMinLength', { count: 8 })}
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
          <Field
            label={t('register.location')}
            htmlFor="homeLocation"
            optional
          >
            <HomeLocationField
              id="homeLocation"
              value={homeLocation}
              onChange={setHomeLocation}
              disabled={isLoading}
            />
          </Field>
          {/* Deliberately not a `Field`: that primitive puts a label above its
              control, and a checkbox is named by the sentence beside it — a
              label above one would be a second name for the same thing. The
              shared row is the composition instead: the sentence is the label,
              the hint sits under it in the same column, and `aria-describedby`
              is wired for us.

              No `tag`. The chip exists to tell a required row from an optional
              one, and this is the only consent on the page — a lone "Optional"
              would be answering a contrast the reader has no other half of. */}
          <CheckboxRow
            checked={marketingConsent}
            onCheckedChange={setMarketingConsent}
            disabled={isLoading}
            label={t('register.marketingConsentLabel')}
            hint={t('register.marketingConsentHint')}
          />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {status ?? (isLoading ? t('register.creatingAccount') : c('createAccount'))}
          </Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div>
              {t.rich('register.alreadyHaveAccount', {
                link: (chunks) => (
                  <Link href={redirect ? `${ROUTES.login}?redirect=${encodeURIComponent(redirect)}` : ROUTES.login} className="text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </div>
            <div>
              {t.rich('needHelp', {
                email: SUPPORT_EMAIL,
                link: (chunks) => (
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
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
