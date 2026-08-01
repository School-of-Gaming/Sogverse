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
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { CoverageAreasField } from "@/components/gedu/coverage-areas-field";
import {
  codeRefsOf,
  matchResolvedRows,
  pendingTicksByCountry,
  toggleCoverageTick,
  type CoverageTick,
} from "@/components/gedu/coverage-ticks";
import { isValidPhoneNumber } from "react-phone-number-input";
import { getClient } from "@/lib/supabase/client";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, SUPPORT_EMAIL } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth } from "@/providers";
import { useSpokenLanguages } from "@/services/users";
import { useResolveLocationsByCodes } from "@/services/locations";
import { readErrorMessage } from "@/lib/api/json-response";
import type { SpokenLanguage } from "@/types";

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

export function RegisterGeduForm({
  initialSpokenLanguages,
  redirect,
}: {
  initialSpokenLanguages: SpokenLanguage[];
  redirect: string | null;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const coverageT = useTranslations("gedu.coverage");
  const locale = useLocale();
  const { navigateAfterAuth, status } = useAuthRedirect(redirect);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);
  /**
   * Coverage claims, keyed by catalog ref. The account does not exist yet, so
   * these stay as catalog codes until submit resolves them to row ids — which
   * anonymous callers may do, `locations` being anon-readable reference data.
   */
  const [coverage, setCoverage] = useState<ReadonlyMap<string, CoverageTick>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();
  const { data: availableLanguages } = useSpokenLanguages({ initialData: initialSpokenLanguages });
  const resolveByCodes = useResolveLocationsByCodes();

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

    // Resolve the ticked catalog codes to row ids *before* the account is
    // created. Resolution is a lookup, not an assertion — a code with no row
    // comes back absent — so a miss has to stop the submit here rather than
    // leave a brand-new gedu holding a coverage set missing what they ticked.
    let locationIds: string[];
    try {
      const resolvedIds: string[] = [];
      const unresolved: CoverageTick[] = [];
      for (const [country, pending] of pendingTicksByCountry(coverage)) {
        const rows = await resolveByCodes(country, codeRefsOf(pending));
        const matched = matchResolvedRows(pending, rows);
        resolvedIds.push(...matched.ids);
        unresolved.push(...matched.unresolved);
      }
      if (unresolved.length > 0) {
        setError(
          coverageT("unresolvedError", {
            names: unresolved.map((tick) => tick.label).join(", "),
          }),
        );
        setIsLoading(false);
        return;
      }
      locationIds = resolvedIds;
    } catch {
      setError(c("unexpectedError"));
      setIsLoading(false);
      return;
    }

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
          minecraftUsername: minecraftUsername.trim() || undefined,
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
              <AlertTitle>{t("registerGedu.verificationAlertTitle")}</AlertTitle>
              <AlertDescription>{t("registerGedu.verificationAlertDescription")}</AlertDescription>
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
          <MinecraftUsernameField
            value={minecraftUsername}
            onChange={setMinecraftUsername}
            disabled={isLoading}
            optional
          />
          <Field label={c("phoneNumber")} htmlFor="phone" optional>
            <InternationalPhoneInput
              id="phone"
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
            />
          </Field>
          <SpokenLanguageCheckboxes
            spokenLanguages={availableLanguages ?? []}
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
                setCoverage((current) => toggleCoverageTick(current, pick))
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
