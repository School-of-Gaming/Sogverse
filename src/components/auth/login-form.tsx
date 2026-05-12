"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { generateGamerEmail } from "@/lib/utils";
import { ROLE_POST_LOGIN_PATHS, ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth } from "@/providers";

const PASSWORD_MIN_LENGTH = 6;

export function LoginForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const { redirect, status, navigateAfterAuth } = useAuthRedirect();
  const { freezeUntilNavigation } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();

  const translateSignInError = (code: string | undefined): string => {
    switch (code) {
      case "invalid_credentials":
        return t("login.errors.invalidCredentials");
      case "email_not_confirmed":
        return t("login.errors.emailNotConfirmed");
      case "over_request_rate_limit":
        return t("login.errors.tooManyAttempts");
      default:
        return c("unexpectedError");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError(t("login.errors.identifierRequired"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("login.errors.passwordTooShort", { count: PASSWORD_MIN_LENGTH }));
      return;
    }

    setIsLoading(true);

    try {
      // Gamer accounts use a synthetic `<username>@gamer.sogverse.internal`
      // email under the hood. If the user typed a bare username, map it to
      // that synthetic address before calling Supabase auth.
      const loginEmail = trimmedIdentifier.includes("@")
        ? trimmedIdentifier
        : generateGamerEmail(trimmedIdentifier);

      // Freeze auth state updates *before* signInWithPassword. Supabase fires
      // the SIGNED_IN event synchronously inside the call, before the promise
      // resolves — so anything we do "after success" is already too late to
      // stop the Header from flashing signed-in chrome during the subsequent
      // profile-query await. On sign-in failure the frozen state is harmless
      // (page is still showing signed-out chrome) and a full reload resets it.
      freezeUntilNavigation();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (signInError) {
        const code = (signInError as { code?: string }).code;
        setError(translateSignInError(code));
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      // Customer (parent) lands on /select-profile so they can pick which
      // family member is entering Sogverse; everyone else goes to their
      // dashboard. A safe ?redirect= still wins via navigateAfterAuth.
      const postLoginPath = profile?.role
        ? ROLE_POST_LOGIN_PATHS[profile.role]
        : ROUTES.selectProfile;

      // Full-page navigation so the root layout re-runs server-side and
      // hydrates AuthProvider with the correct initialProfile. Do not clear
      // isLoading — the document is unloading.
      navigateAfterAuth(postLoginPath);
    } catch {
      setError(c('unexpectedError'));
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">{t('login.welcomeTitle')}</CardTitle>
        <CardDescription>{t('login.description')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="identifier">{c('email')}</Label>
            <Input
              id="identifier"
              type="text"
              placeholder={t('login.emailPlaceholder')}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{c('password')}</Label>
              <Link
                href={ROUTES.forgotPassword}
                className="text-sm text-primary hover:underline"
              >
                {c('forgotPassword')}
              </Link>
            </div>
            <PasswordInput
              id="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {status ?? (isLoading ? t('login.signingIn') : c('signIn'))}
          </Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div>
              {t.rich('login.noAccountSignUp', {
                link: (chunks) => (
                  <Link
                    href={redirect ? `${ROUTES.register}?redirect=${encodeURIComponent(redirect)}` : ROUTES.register}
                    className="text-primary hover:underline"
                  >
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
