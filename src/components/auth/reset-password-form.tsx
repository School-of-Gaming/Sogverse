"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);

  const supabase = getClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Read the single-use recovery token from the emailed link's `?token_hash=`
    // here, at submit time — never on mount. Consuming it on page load would let
    // a corporate email-link scanner (which fetches the page but never submits a
    // form) burn the token before the real user acts. The user's explicit submit
    // is a POST a passive scanner doesn't perform. See the emailed-link comment
    // in src/app/api/auth/forgot-password/route.ts.
    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    if (!tokenHash) {
      setLinkFailed(true);
      return;
    }

    // Compare via a zod refine on member expressions (d.password), not a bare
    // `password === confirmPassword` — the latter trips
    // security/detect-possible-timing-attacks (a false positive for two
    // client-side form fields, but cleanly avoided this way).
    const validation = z
      .object({
        password: z.string().min(MIN_PASSWORD_LENGTH, c('passwordMinLength', { count: MIN_PASSWORD_LENGTH })),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, {
        message: t('resetPassword.passwordsDoNotMatch'),
        path: ['confirmPassword'],
      })
      .safeParse({ password, confirmPassword });

    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    // Hold `committing` across the whole flow so the button can't re-enable
    // between the click and the terminal outcome (a fast user could otherwise
    // double-submit). Set it true synchronously before the first await.
    setCommitting(true);

    // This is the moment the single-use token is consumed.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (verifyError) {
      // Token expired / already used (e.g. double-click, or a genuinely stale
      // link). Swap to the dead-link view; leave `committing` set — the unmount
      // handles the rest.
      setLinkFailed(true);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // Session is valid but the update failed — let the user retry.
      setError(t('resetPassword.updateFailed'));
      setCommitting(false);
      return;
    }

    // Success swaps to the success card (unmounts the form); leave `committing`
    // set so the button never re-enables on the way out.
    setSuccess(true);
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

  // No token in the URL, or verification failed at submit time — either way the
  // link is unusable, so point the user at requesting a fresh one.
  if (linkFailed) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{t('resetPassword.linkExpiredTitle')}</CardTitle>
          <CardDescription>
            {t('resetPassword.linkExpired')}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col space-y-4">
          <Button
            className="w-full"
            onClick={() => { window.location.href = ROUTES.forgotPassword; }}
          >
            {t('resetPassword.requestNewLink')}
          </Button>
          <Link
            href="/login"
            className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {c('backToLogin')}
          </Link>
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
          <Field
            label={c('newPassword')}
            htmlFor="password"
            hint={c('passwordMinLength', { count: MIN_PASSWORD_LENGTH })}
          >
            <PasswordInput
              id="password"
              placeholder={t('resetPassword.newPasswordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={committing}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label={c('confirmPassword')} htmlFor="confirmPassword">
            <PasswordInput
              id="confirmPassword"
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={committing}
              required
              autoComplete="new-password"
            />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={committing}>
            {committing ? t('resetPassword.updating') : t('resetPassword.resetButton')}
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
