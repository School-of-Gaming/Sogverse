"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const supabase = getClient();

  // generateLink() uses implicit flow (tokens in URL hash) because there's
  // no PKCE challenge. The @supabase/ssr client is configured for PKCE mode
  // so it won't detect hash tokens automatically — parse them manually.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL hash parse; see TODO.md "Audit setState-in-effect violations from eslint-plugin-react-hooks@7"
      setSessionReady(true);
      return;
    }

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setError(t('resetPassword.linkExpired'));
          } else {
            // Clear hash from URL without triggering navigation
            window.history.replaceState(null, "", window.location.pathname);
          }
          setSessionReady(true);
        });
    } else {
      setSessionReady(true);
    }
  }, [supabase.auth, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const validatedData = resetPasswordSchema.parse({ password, confirmPassword });

      const { error: updateError } = await supabase.auth.updateUser({
        password: validatedData.password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(c('unexpectedError'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{t('resetPassword.successTitle')}</CardTitle>
          <CardDescription>
            {t('resetPassword.successDescription')}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            className="w-full"
            onClick={() => { window.location.href = ROUTES.login; }}
          >
            {c('continue')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t('resetPassword.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('resetPassword.description')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{c('newPassword')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('resetPassword.newPasswordPlaceholder')}
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
            <Input
              id="confirmPassword"
              type="password"
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading || !sessionReady}>
            {!sessionReady ? c('loading') : isLoading ? t('resetPassword.updating') : t('resetPassword.resetButton')}
          </Button>
          <Link
            href="/login"
            className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {c('backToLogin')}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
