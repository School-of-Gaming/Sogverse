"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { isValidPhoneNumber } from "react-phone-number-input";
import { getClient } from "@/lib/supabase/client";
import { toE164Digits } from "@/lib/utils";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { useSpokenLanguages } from "@/services/users";

const setupAccountSchema = z.object({
  displayName: z.string().min(DISPLAY_NAME_MIN, `Display name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Display name must be at most ${DISPLAY_NAME_MAX} characters`),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function SetupAccountForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");

  const supabase = getClient();
  const { data: availableLanguages } = useSpokenLanguages();

  // generateLink() uses implicit flow (tokens in URL hash) because there's
  // no PKCE challenge. The @supabase/ssr client is configured for PKCE mode
  // so it won't detect hash tokens automatically — parse them manually.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      setSessionReady(true);
      return;
    }

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: sessionData, error }) => {
          if (error) {
            setError(t('setupAccount.inviteLinkExpired'));
          } else {
            setSessionEmail(sessionData.user?.email ?? "");
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
      const validatedData = setupAccountSchema.parse({ displayName, password, confirmPassword });

      // Save minecraft FIRST — the UNIQUE constraint on minecraft_uuid can
      // reject this call, and password/profile updates are irreversible
      // (no "undo"). By doing the fallible step first, a retry after fixing
      // the username just re-runs the whole form without double-setting anything.
      if (minecraftUsername.trim()) {
        const mcResponse = await fetch("/api/minecraft/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minecraftUsername: minecraftUsername.trim() }),
        });
        if (!mcResponse.ok) {
          const mcData = await mcResponse.json();
          setError(mcData.error || t('setupAccount.minecraftSaveFailed'));
          return;
        }
      }

      // Set the password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: validatedData.password,
      });

      if (passwordError) {
        setError(passwordError.message);
        return;
      }

      // Update display name on the profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (phone && !isValidPhoneNumber(phone)) {
          setError(t('setupAccount.invalidPhone'));
          return;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            display_name: validatedData.displayName,
            phone: toE164Digits(phone),
            spoken_languages: spokenLanguages,
          })
          .eq("id", user.id);

        if (profileError) {
          setError(profileError.message);
          return;
        }

        // Sync display_name to auth.users metadata so it shows in Supabase dashboard
        await supabase.auth.updateUser({
          data: { display_name: validatedData.displayName },
        });
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
          <CardTitle className="text-2xl">{t('setupAccount.successTitle')}</CardTitle>
          <CardDescription>
            {t('setupAccount.successDescription')}
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
        <CardTitle className="text-2xl text-center">{t('setupAccount.title')}</CardTitle>
        <CardDescription className="text-center">
          {t('setupAccount.description')}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {/* Hidden email field so Chrome saves the password against the correct email */}
          <input type="email" autoComplete="username" value={sessionEmail} readOnly hidden />
          <div className="space-y-2">
            <Label htmlFor="displayName">{c('displayName')}</Label>
            <Input
              id="displayName"
              type="text"
              placeholder={t('setupAccount.namePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading}
              required
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{c('password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('setupAccount.passwordPlaceholder')}
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
              placeholder={t('setupAccount.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
          </div>
          <MinecraftUsernameField
            value={minecraftUsername}
            onChange={setMinecraftUsername}
            disabled={isLoading}
            optional
          />
          <div className="space-y-2">
            <Label htmlFor="phone">{c('phoneNumber')}</Label>
            <InternationalPhoneInput
              id="phone"
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
            />
          </div>
          <SpokenLanguageCheckboxes
            languages={availableLanguages ?? []}
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
            disabled={isLoading}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading || !sessionReady}>
            {!sessionReady ? c('loading') : isLoading ? t('setupAccount.settingUp') : t('setupAccount.submitButton')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
