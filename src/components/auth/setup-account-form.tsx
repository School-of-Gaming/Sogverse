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
  firstName: z.string().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function SetupAccountForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteInvalid, setInviteInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");

  const supabase = getClient();
  const { data: availableLanguages } = useSpokenLanguages();

  // generateLink() uses implicit flow (tokens in URL hash) because there's
  // no PKCE challenge. The @supabase/ssr client is configured for PKCE mode
  // so it won't detect hash tokens automatically — parse them manually.
  //
  // Supabase's /verify endpoint can also redirect here with an error hash
  // (e.g. #error=access_denied&error_code=otp_expired&...) when the invite
  // link has expired or been consumed. Treat those as a dead end: show the
  // "ask admin for a new link" message and don't let the user submit a
  // form that would 401 on the first API call.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL hash parse; see TODO.md "Audit setState-in-effect violations from eslint-plugin-react-hooks@7"
      setSessionReady(true);
      return;
    }

    const params = new URLSearchParams(hash.substring(1));

    if (params.get("error") || params.get("error_code")) {
      setError(t('setupAccount.inviteLinkExpired'));
      setInviteInvalid(true);
      setSessionReady(true);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: sessionData, error }) => {
          if (error) {
            setError(t('setupAccount.inviteLinkExpired'));
            setInviteInvalid(true);
          } else {
            setSessionEmail(sessionData.user?.email ?? "");
            // Pre-fill the name from the admin-supplied values in
            // raw_user_meta_data (set via generateLink's options.data). The
            // gedu can still edit before submitting.
            const meta = sessionData.user?.user_metadata ?? {};
            if (typeof meta.first_name === "string" && meta.first_name.length > 0) {
              setFirstName(meta.first_name);
            }
            if (typeof meta.last_name === "string" && meta.last_name.length > 0) {
              setLastName(meta.last_name);
            }
            // Clear hash from URL without triggering navigation
            window.history.replaceState(null, "", window.location.pathname);
          }
          setSessionReady(true);
        });
    } else {
      setSessionReady(true);
    }
  }, [supabase.auth, t]);

  const markInviteExpired = () => {
    setError(t('setupAccount.inviteLinkExpired'));
    setInviteInvalid(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const validatedData = setupAccountSchema.parse({
        firstName,
        lastName: lastName.trim() || undefined,
        password,
        confirmPassword,
      });

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
          // 401 means the invite session was never set or has expired since
          // page load — surface the friendly expired-link message instead of
          // the bare "Unauthorized" string from requireRole.
          if (mcResponse.status === 401) {
            markInviteExpired();
            return;
          }
          const mcData = await mcResponse.json();
          setError(mcData.error || t('setupAccount.minecraftSaveFailed'));
          return;
        }
      }

      // Set the password. If the client session is gone or expired,
      // updateUser returns an AuthSessionMissingError — treat the same as
      // the API 401 above.
      const { error: passwordError } = await supabase.auth.updateUser({
        password: validatedData.password,
      });

      if (passwordError) {
        if (passwordError.name === "AuthSessionMissingError" || passwordError.status === 401) {
          markInviteExpired();
          return;
        }
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
            first_name: validatedData.firstName,
            last_name: validatedData.lastName ?? "",
            phone: toE164Digits(phone),
            spoken_languages: spokenLanguages,
          })
          .eq("id", user.id);

        if (profileError) {
          setError(profileError.message);
          return;
        }

        // Sync to auth.users metadata so the Supabase dashboard label stays
        // current. display_name is composed for the dashboard; first/last
        // are written separately for tooling.
        const composedDisplayName = [validatedData.firstName, validatedData.lastName ?? ""]
          .filter(Boolean)
          .join(" ");
        await supabase.auth.updateUser({
          data: {
            first_name: validatedData.firstName,
            last_name: validatedData.lastName ?? "",
            display_name: composedDisplayName,
          },
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
            <Label htmlFor="firstName">{c('firstName')}</Label>
            <Input
              id="firstName"
              type="text"
              placeholder={t('setupAccount.firstNamePlaceholder')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isLoading}
              required
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{c('lastName')}</Label>
            <Input
              id="lastName"
              type="text"
              placeholder={t('setupAccount.lastNamePlaceholder')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isLoading}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="family-name"
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
            spokenLanguages={availableLanguages ?? []}
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
            disabled={isLoading}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading || !sessionReady || inviteInvalid}>
            {!sessionReady ? c('loading') : isLoading ? t('setupAccount.settingUp') : t('setupAccount.submitButton')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
