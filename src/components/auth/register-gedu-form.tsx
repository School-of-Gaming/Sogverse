"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GAME_PLATFORMS, GameUsernameEditableRow } from "@/components/game-account";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { CoverageAreasField } from "@/components/gedu/coverage-areas-field";
import {
  toggleCoverageTick,
  type CoverageTick,
} from "@/components/gedu/coverage-ticks";
import { isValidPhoneNumber } from "react-phone-number-input";
import { getClient } from "@/lib/supabase/client";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, SUPPORT_EMAIL } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth, useReferralCode } from "@/providers";
import { readErrorMessage } from "@/lib/api/json-response";
import type { SpokenLanguageCode } from "@/types";

/**
 * Literals rather than `useId()`s, because the other fields on this form name
 * their inputs the same way — one page, one form, one of each.
 */
const MINECRAFT_USERNAME_INPUT_ID = "register-gedu-minecraft-username";
const ROBLOX_USERNAME_INPUT_ID = "register-gedu-roblox-username";

const registerGeduSchema = z.object({
  firstName: z.string().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function RegisterGeduForm({ redirect }: { redirect: string | null }) {
  const t = useTranslations("auth");
  const g = useTranslations("gameAccount");
  const c = useTranslations("common");
  const locale = useLocale();
  const { navigateAfterAuth, status } = useAuthRedirect(redirect);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  // Educator capture is not for the Roblox programme — it is for knowing where
  // educators come from when SOG runs a recruitment campaign.
  const referralCode = useReferralCode();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [minecraftUsername, setMinecraftUsername] = useState<string | null>(null);
  const [robloxUsername, setRobloxUsername] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenLanguageCode[]>([]);
  /**
   * Coverage claims, keyed by `locations.id`. The picker browses the table
   * itself — which anonymous callers may read, `locations` being public
   * reference data — so a claim is already a row id here and submit sends it
   * straight through.
   */
  const [coverage, setCoverage] = useState<ReadonlyMap<string, CoverageTick>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let validated: z.infer<typeof registerGeduSchema>;
    try {
      validated = registerGeduSchema.parse({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password,
        confirmPassword,
      });
    } catch (err) {
      setError(err instanceof z.ZodError ? err.errors[0].message : c("unexpectedError"));
      return;
    }

    if (phone && !isValidPhoneNumber(phone)) {
      setError(t("registerGedu.invalidPhone"));
      return;
    }

    // Set the busy flag synchronously before any await so the button cannot
    // re-enable between the click and the navigation that follows success.
    setIsLoading(true);

    const locationIds = [...coverage.keys()];

    try {
      const response = await fetch("/api/gedu/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validated.email,
          password: validated.password,
          firstName: validated.firstName,
          lastName: validated.lastName,
          phone: phone || undefined,
          spokenLanguages,
          locale,
          locationIds,
          minecraftUsername: minecraftUsername ?? undefined,
          robloxUsername: robloxUsername ?? undefined,
          // The route cannot read `x-referral-code` off its own request: the
          // proxy derives that header from the query string of the request it is
          // handling, and this POST carries no `?ref=`. So it travels in the
          // body.
          referralCode: referralCode ?? undefined,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, c("unexpectedError")));
        setIsLoading(false);
        return;
      }

      // The account exists but the browser isn't signed in (the route used the
      // admin client). Sign in now, then full-page navigate so the root layout
      // re-runs and hydrates AuthProvider. Freeze auth state before signIn —
      // Supabase fires SIGNED_IN synchronously inside the call.
      freezeUntilNavigation();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });
      if (signInError) {
        unfreezeAuthState();
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      // Document is unloading — leave isLoading set.
      navigateAfterAuth(ROUTES.gedu.dashboard);
    } catch {
      unfreezeAuthState();
      setError(c("unexpectedError"));
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl text-center">{t("registerGedu.title")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Alert variant="info">
            <Info className="h-4 w-4 shrink-0" />
            <div>
              <AlertTitle>{t("registerGedu.certificationAlertTitle")}</AlertTitle>
              <AlertDescription>{t("registerGedu.certificationAlertDescription")}</AlertDescription>
            </div>
          </Alert>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={c("firstName")} htmlFor="firstName">
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isLoading}
                required
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="given-name"
              />
            </Field>
            <Field label={c("lastName")} htmlFor="lastName">
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isLoading}
                required
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="family-name"
              />
            </Field>
          </div>
          <Field label={c("email")} htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="username"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={c("password")} htmlFor="password" hint={c("passwordMinLength", { count: 8 })}>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field label={c("confirmPassword")} htmlFor="confirmPassword">
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>
          {/* First capture on both platforms: nothing is saved yet, so each row
              opens straight into edit mode. The label belongs to the form, not
              the row — a roster renders the same row with no label at all — so
              the id is handed down and the row drops its own sr-only label
              rather than labelling the input twice.

              Side by side at the same breakpoint as the name and password
              pairs, because they are the same kind of pair: two independent
              optional answers, neither of which is more important than the
              other. Stacked below `sm`, like everything else on this form. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={g("label", { platform: GAME_PLATFORMS.minecraft.name })}
              htmlFor={MINECRAFT_USERNAME_INPUT_ID}
              optional
            >
              <GameUsernameEditableRow
                platform="minecraft"
                username={minecraftUsername}
                autoEdit
                inputId={MINECRAFT_USERNAME_INPUT_ID}
                onCommit={({ username }) => setMinecraftUsername(username)}
              />
            </Field>
            <Field
              label={g("label", { platform: GAME_PLATFORMS.roblox.name })}
              htmlFor={ROBLOX_USERNAME_INPUT_ID}
              optional
            >
              <GameUsernameEditableRow
                platform="roblox"
                username={robloxUsername}
                autoEdit
                inputId={ROBLOX_USERNAME_INPUT_ID}
                onCommit={({ username }) => setRobloxUsername(username)}
              />
            </Field>
          </div>
          <Field label={c("phoneNumber")} htmlFor="phone" optional>
            <InternationalPhoneInput
              id="phone"
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
            />
          </Field>
          <SpokenLanguageCheckboxes
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
            disabled={isLoading}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("registerGedu.coverageHeading")}</p>
            <p className="text-sm text-muted-foreground">{t("registerGedu.coverageNote")}</p>
            <CoverageAreasField
              ticks={coverage}
              onToggle={(pick) =>
                setCoverage((current) =>
                  toggleCoverageTick(current, pick, locale),
                )
              }
              onRemove={(locationId) =>
                setCoverage((current) => {
                  const next = new Map(current);
                  next.delete(locationId);
                  return next;
                })
              }
              onClear={() => setCoverage(new Map())}
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {status ?? (isLoading ? t("registerGedu.creatingAccount") : c("createAccount"))}
          </Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div>
              {t.rich("registerGedu.alreadyHaveAccount", {
                link: (chunks) => (
                  <Link href={ROUTES.login} className="text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </div>
            <div>
              {t.rich("needHelp", {
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
