"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { generateGamerEmail } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS, ROUTES } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

const loginSchema = z.object({
  identifier: z.string().min(1, "Please enter your email or username"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function LoginForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const { redirect, status, navigateAfterAuth } = useAuthRedirect();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const validated = loginSchema.parse({ identifier, password });
      // Gamer accounts use a synthetic `<username>@gamer.sogverse.internal`
      // email under the hood. If the user typed a bare username, map it to
      // that synthetic address before calling Supabase auth.
      const loginEmail = validated.identifier.includes("@")
        ? validated.identifier
        : generateGamerEmail(validated.identifier);

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: validated.password,
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const dashboardPath = profile?.role
        ? ROLE_DASHBOARD_PATHS[profile.role]
        : ROUTES.customer.dashboard;

      // Full-page navigation so the root layout re-runs server-side and
      // hydrates AuthProvider with the correct initialProfile. Do not clear
      // isLoading — the document is unloading.
      navigateAfterAuth(dashboardPath);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(c('unexpectedError'));
      }
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
            <Input
              id="password"
              type="password"
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
          <div className="text-center text-sm text-muted-foreground">
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
        </CardFooter>
      </form>
    </Card>
  );
}
