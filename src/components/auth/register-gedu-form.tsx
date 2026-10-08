"use client";

import { useState } from "react";
import { Link, getPathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useAuth, useUtm } from "@/providers";
import { readErrorMessage } from "@/lib/api/json-response";
import { completeRegistrationQuery } from "@/lib/navigation/post-auth-redirect";
import { ContinueWithGoogle } from "./continue-with-google";
import { GeduProfileFields, useGeduProfileFields } from "./gedu-profile-fields";
import { NameFields, useNameSchemaFields } from "./name-fields";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterGeduForm({ redirect }: { redirect: string | null }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const { navigateAfterAuth, status } = useAuthRedirect(redirect);
  const { freezeUntilNavigation, unfreezeAuthState } = useAuth();
  // Educator capture is not for the Roblox programme — it is for knowing where
  // educators come from when SOG runs a recruitment campaign.
  const utm = useUtm();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const profile = useGeduProfileFields();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const supabase = getClient();
  const nameFields = useNameSchemaFields();

  // Built here rather than at module level so its refusals are in the reader's
  // language; the same shape as the parent registration form's.
  const registerGeduSchema = z.object({
    ...nameFields,
    email: z.string().email(t("validation.emailInvalid")),
    password: z.string().min(MIN_PASSWORD_LENGTH, c("passwordMinLength", { count: MIN_PASSWORD_LENGTH })),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t("resetPassword.passwordsDoNotMatch"),
    path: ["confirmPassword"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let validated: z.infer<typeof registerGeduSchema>;
    try {
      validated = registerGeduSchema.parse({
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
      });
    } catch (err) {
      setError(err instanceof z.ZodError ? err.errors[0].message : c("unexpectedError"));
      return;
    }

    const profileError = profile.validate();
    if (profileError) {
      setError(profileError);
      return;
    }

    // Set the busy flag synchronously before any await so the button cannot
    // re-enable between the click and the navigation that follows success.
    setIsLoading(true);

    try {
      const response = await fetch("/api/gedu/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validated.email,
          password: validated.password,
          firstName: validated.firstName,
          lastName: validated.lastName,
          ...profile.requestBody,
          locale,
          // The route cannot read `x-utm` off its own request: the proxy derives
          // that header from the query string of the request it is handling, and
          // this POST carries no UTM params. So they travel in the body.
          utm: {
            source: utm.source ?? undefined,
            medium: utm.medium ?? undefined,
            campaign: utm.campaign ?? undefined,
          },
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
        // The account exists; only this browser's session is missing. GoTrue's
        // reason is English for the log, and the Gedu's way on is to sign in.
        console.error("[register-gedu-form] sign-in after registration failed:", signInError);
        unfreezeAuthState();
        setError(t("signInAfterRegisterFailed"));
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
        {/* The brand slogan for the people this page is addressed to, placed
            once and only here — lower and smaller than the title it sits
            under, which is the sanctioned shape for a slogan on a page. */}
        <p className="text-center text-sm font-medium text-act">
          {t("registerGedu.slogan")}
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Alert variant="info">
            <div>
              <AlertTitle sentence>
                {t("registerGedu.certificationAlertTitle")}
              </AlertTitle>
              <AlertDescription>{t("registerGedu.certificationAlertDescription")}</AlertDescription>
            </div>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {/* The finish page's Gedu variant, in this page's language: a
              Google account arrives with none of the fields below. The visit's
              attribution rides on the address, since the round trip through
              Google unloads the tab that holds it. */}
          <ContinueWithGoogle
            next={getPathname({
              href: {
                pathname: ROUTES.completeRegistration,
                query: completeRegistrationQuery({ asGedu: true, utm }),
              },
              locale,
            })}
            disabled={isLoading}
            onBegin={() => {
              setError(null);
              setGooglePending(true);
            }}
            onFailed={(message) => {
              setGooglePending(false);
              setError(message);
            }}
          />
          <NameFields
            firstLabel={c("firstName")}
            lastLabel={c("lastName")}
            firstName={firstName}
            lastName={lastName}
            setFirstName={setFirstName}
            setLastName={setLastName}
            disabled={isLoading}
          />
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
          <GeduProfileFields fields={profile} disabled={isLoading} />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading || googlePending}>
            {status ?? (isLoading ? t("registerGedu.creatingAccount") : c("createAccount"))}
          </Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div>
              {t.rich("registerGedu.alreadyHaveAccount", {
                link: (chunks) => (
                  <Link href={ROUTES.login} className="text-act hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </div>
            <div>
              {t.rich("needHelp", {
                email: SUPPORT_EMAIL,
                link: (chunks) => (
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-act hover:underline">
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
