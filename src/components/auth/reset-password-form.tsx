"use client";

import { useState, useEffect, useRef } from "react";
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
  // Once verifyOtp() consumes the single-use token, the recovery session is live.
  // A retry (e.g. after the server rejects a weak password) must not re-verify
  // the now-spent token; this flag makes retries update off the session instead.
  const [verified, setVerified] = useState(false);
  // Hidden username field for password managers: the account email (from the
  // emailed link) so they save the new password against the right account.
  // Set via ref, NOT `readOnly` or `hidden`/display:none — password managers
  // skip both when choosing the username; sr-only keeps it rendered but unseen.
  // Not a credential — never passed to verifyOtp/updateUser; the token authorizes.
  const usernameRef = useRef<HTMLInputElement>(null);

  const supabase = getClient();

  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email");
    if (email && usernameRef.current) {
      usernameRef.current.value = email;
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Read the recovery token at submit, never on mount: consuming it on page
    // load would let a corporate email-link scanner (which fetches the page but
    // never submits) burn the single-use token before the real user acts. See
    // the emailed-link comment in src/app/api/auth/forgot-password/route.ts.
    //
    // Every route onto this page is the emailed link — whether the mail was
    // asked for from /forgot-password or from the settings page — and that link
    // always carries the token, so the real cases are "valid" and "expired",
    // both handled below. A tokenless arrival is a hand-typed or truncated URL.
    // (It was briefly reachable from a button: settings used to *navigate* here
    // instead of sending the mail, which made a page that cannot work without a
    // token the destination of a click that never had one. That button now sends
    // the mail and stays put.) We deliberately don't pre-check presence on
    // mount; if the token is absent we fall through to the same dead-link view
    // here, which is the right answer for a URL that cannot be completed.
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

    // Consume the single-use token exactly once. On a retry after a failed
    // updateUser the session is already established, so we skip straight to the
    // update below rather than re-verifying an already-burned token.
    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (verifyError) {
        // Token expired / already used (e.g. double-click, a genuinely stale
        // link) — or a transient verify failure. We don't distinguish them: the
        // only reasonable recovery for any of these is requesting a fresh link,
        // which the dead-link view offers. Swap to it; leave `committing` set —
        // the unmount handles the rest.
        setLinkFailed(true);
        return;
      }

      setVerified(true);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // Session is valid but the update failed — let the user retry. Supabase
      // rejects a password identical to the current one (code "same_password");
      // that case gets its own copy because "try again" misdirects there — the
      // fix is picking a different password (or realising you've remembered
      // your current one and can just sign in). Everything else stays generic
      // rather than surfacing updateError.message: the realistic remaining
      // cause is Supabase's password policy rejecting a weak password, whose
      // messages are English-only and would break i18n if surfaced raw. The
      // tradeoff: if Supabase's policy ever drifts stricter than the client's
      // MIN_PASSWORD_LENGTH check, the user sees an unactionable message and
      // can loop. Keep the two in sync so that stays a non-case; revisit (map
      // "weak_password" to translated copy) if it ever bites.
      setError(
        updateError.code === "same_password"
          ? t('resetPassword.samePassword')
          : t('resetPassword.updateFailed')
      );
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
          {/* Hidden username field — see usernameRef above. */}
          <input
            ref={usernameRef}
            type="email"
            autoComplete="username"
            tabIndex={-1}
            className="sr-only"
          />
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
