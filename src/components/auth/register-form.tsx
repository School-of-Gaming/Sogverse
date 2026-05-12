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
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, SUPPORT_EMAIL } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth } from "@/providers";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  firstName: z.string().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function RegisterForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const { redirect, status, navigateAfterAuth } = useAuthRedirect();
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
          <div className="space-y-2">
            <Label htmlFor="firstName">{t('register.parentFirstName')}</Label>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t('register.parentLastName')}</Label>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{c('email')}</Label>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{c('password')}</Label>
            <PasswordInput
              id="password"
              placeholder={t('register.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              {c('passwordMinLength', { count: 8 })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{c('confirmPassword')}</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
          </div>
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
