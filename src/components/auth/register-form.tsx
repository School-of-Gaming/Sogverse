"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeLocationField } from "@/components/locations/home-location-field";
import { getClient } from "@/lib/supabase/client";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, SUPPORT_EMAIL } from "@/lib/constants";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useUpdateProfile } from "@/services/users";
import { useAuth, useReferralCode } from "@/providers";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  // `.trim()` before the length checks, so they measure the name rather than
  // the whitespace around it — " A" is not a two-character first name. This is
  // also the only thing standing between a stray trailing space and the
  // profiles row: sign-up writes the name into the auth user's metadata, which
  // the handle_new_user trigger copies verbatim, so there is no route or
  // contract further down the path positioned to clean it up.
  firstName: z.string().trim().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().trim().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function RegisterForm({ redirect: redirectParam }: { redirect: string | null }) {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const { redirect, status, navigateAfterAuth } = useAuthRedirect(redirectParam);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  // Where this visit came from, if a marketing link carried `?ref=`. Held in
  // memory by the root provider since the landing page; never on this device.
  const referralCode = useReferralCode();
  const updateProfile = useUpdateProfile();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [homeLocation, setHomeLocation] = useState<LocationPick | null>(null);
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

      const composedDisplayName = `${validatedData.firstName} ${validatedData.lastName}`;

      // Freeze auth state updates *before* signUp — Supabase fires SIGNED_IN
      // synchronously inside the call when auto-confirm is on, so freezing
      // afterward would be too late to stop the Header from flashing
      // signed-in chrome. See the matching comment in login-form.tsx.
      freezeUntilNavigation();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          data: {
            first_name: validatedData.firstName,
            last_name: validatedData.lastName,
            // Composed for the Supabase Auth dashboard's display label.
            display_name: composedDisplayName,
            role: "customer",
            // Marketing provenance, written by the handle_new_user trigger to
            // profiles.referral_code and never updatable afterwards — which is
            // why it travels in metadata rather than as a second client write
            // like home_location_id below. A client write would need
            // GRANT UPDATE(referral_code) TO authenticated, handing every user
            // the permanent ability to rewrite their own attribution; the grant
            // is the thing we are refusing, and the trigger is what lets us.
            // The trigger re-sanitises whatever arrives, so a junk value costs
            // this registration nothing. Omitted entirely when there is no code,
            // so the column simply stays null.
            ...(referralCode !== null ? { referral_code: referralCode } : {}),
          },
        },
      });

      if (signUpError) {
        unfreezeAuthState();
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Check if email confirmation is required
        if (data.user.identities?.length === 0) {
          unfreezeAuthState();
          setError(t('register.accountExists'));
          setIsLoading(false);
          return;
        }

        // The optional home location, persisted as a second write rather than
        // through sign-up metadata.
        //
        // WHY NOT METADATA. The profile row is created by the handle_new_user
        // trigger from raw_user_meta_data, so the alternative was to pass the
        // id there and have the trigger resolve it. That trigger is the one
        // function in the schema that assigns roles, it runs SECURITY DEFINER
        // (so it writes past RLS entirely), and it has a test suite whose whole
        // subject is that client-supplied metadata cannot influence what it
        // grants. Teaching it to read one more caller-supplied key — a foreign
        // key, which it would then have to resolve-not-assert so a stale id
        // degraded to null instead of aborting the account — is real surface
        // added to the most sensitive object here, to save one request.
        //
        // Writing it from the client instead reuses the authorization path the
        // settings page already uses and the DB suite already covers: a
        // column-level UPDATE grant on profiles.home_location_id, plus an RLS
        // policy where actor and target are the same row. Nothing new is
        // trusted.
        //
        // WHAT IT COSTS. This needs a session the moment signUp returns, which
        // is true under auto-confirm and false if email confirmation is ever
        // switched on. Both Supabase projects run mailer_autoconfirm today, and
        // the flow below already depends on that far harder than this does —
        // navigateAfterAuth sends a brand-new parent to an authenticated route.
        // So the session check is explicit rather than assumed: no session
        // means the location is skipped, not lost to a request that 401s.
        if (homeLocation && data.session) {
          try {
            await updateProfile.mutateAsync({
              userId: data.user.id,
              updates: { home_location_id: homeLocation.location.id },
            });
          } catch (locationError) {
            // Never fatal. The account exists, the field is optional, and it is
            // re-pickable from settings — stranding someone on the registration
            // form over it would be strictly worse than losing it.
            console.error(
              "[register] could not save the home location",
              locationError,
            );
          }
        }

        // New parent accounts have no gamers yet, but we still send them
        // through /select-profile so the "Add Gamer" tile is the first thing
        // they see. A safe ?redirect= still wins via navigateAfterAuth.
        navigateAfterAuth(ROUTES.selectProfile);
        return;
      }
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
