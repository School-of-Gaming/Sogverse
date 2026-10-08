"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pushGtmEvent } from "@/lib/gtm";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { ROUTES } from "@/lib/constants";
import type { UtmAttribution } from "@/lib/utm";
import {
  COMPLETE_REGISTRATION_PARENT_QUERY,
  completeRegistrationQuery,
} from "@/lib/navigation/post-auth-redirect";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { GeduProfileFields, useGeduProfileFields } from "./gedu-profile-fields";
import { NameFields, useNameSchemaFields } from "./name-fields";
import { ParentAccountFields, useParentAccountFields } from "./parent-account-fields";

/** The name rules the register forms hold a parent and a Gedu to. */
function useNamesSchema() {
  return z.object(useNameSchemaFields());
}

export interface CompleteRegistrationFormProps {
  /** Which registration this account is finishing — the register page it began on. */
  variant: "parent" | "gedu";
  /** The address the Google account signed in with, shown read-only. */
  email: string;
  /** Google's name for the account, split into its halves, or empty strings. */
  initialFirstName: string;
  initialLastName: string;
  /** The landing link's attribution, carried here on the address. */
  utm: UtmAttribution;
  /**
   * The product page the account set out from, to land on once registered in
   * place of the variant's own landing. It still passes the post-auth
   * allowlist before anything navigates to it.
   */
  redirect: string | null;
}

/**
 * Where an account created through Google finishes registering: the fields
 * its register page would have asked for, minus the address and password the
 * Google account already supplied.
 *
 * One component with two bodies rather than two pages, because the frame is
 * the same statement for both — this Google account signed you in, here is the
 * address it used and the way out if that is the wrong account, and below is
 * what finishes it.
 */
export function CompleteRegistrationForm(props: CompleteRegistrationFormProps) {
  return props.variant === "gedu" ? (
    <GeduCompletion {...props} />
  ) : (
    <ParentCompletion {...props} />
  );
}

/** The request body's `utm`, exactly as the register forms send it. */
function utmBody(utm: UtmAttribution) {
  return {
    source: utm.source ?? undefined,
    medium: utm.medium ?? undefined,
    campaign: utm.campaign ?? undefined,
  };
}

/**
 * Which `auth.completeRegistration` sentence a refused completion shows, and
 * whether the page has to move on. A 409 is an account that no longer owes
 * registration — finished in another tab, or never a fresh one — and signing in
 * again lands it wherever it now belongs. Anything else is a try-again: the
 * form has already checked every field the route would refuse, and the route's
 * own English goes to the console.
 */
async function refusal(
  response: Response,
): Promise<{ key: "alreadyComplete" | "failed"; leave: boolean }> {
  if (response.status === 409) {
    return { key: "alreadyComplete", leave: true };
  }
  console.error(
    "[complete-registration-form] completion refused:",
    response.status,
    await response.text().catch(() => ""),
  );
  return { key: "failed", leave: false };
}

/**
 * The Gedu form's line under the submit, back to the parent form, keeping the
 * attribution and the product page. It asks for the parent variant outright,
 * since an address that says nothing falls back to the intent cookie, which
 * says Gedu. The parent form has no line the other way: a Gedu is registered
 * from the Gedu registration page, and a parent form is where someone who
 * started anywhere else belongs.
 */
function VariantSwitch({
  utm,
  redirect,
}: {
  utm: UtmAttribution;
  redirect: string | null;
}) {
  const t = useTranslations("auth.completeRegistration");
  const query = {
    ...COMPLETE_REGISTRATION_PARENT_QUERY,
    ...completeRegistrationQuery({ asGedu: false, utm, redirect }),
  };

  return (
    <p className="text-center text-sm text-muted-foreground">
      {t.rich("switchToParent", {
        link: (chunks) => (
          <Link
            href={{ pathname: ROUTES.completeRegistration, query }}
            className="text-act hover:underline"
          >
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

function CompletionShell({
  title,
  email,
  alert,
  error,
  submitLabel,
  isLoading,
  onSubmit,
  variantSwitch,
  children,
}: {
  title: string;
  email: string;
  alert: React.ReactNode;
  error: string | null;
  submitLabel: string;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  /** The Gedu form's way back to the parent one, a muted line under the submit. */
  variantSwitch?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth.completeRegistration");
  const c = useTranslations("common");

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{title}</CardTitle>
        <CardDescription className="text-center">{t("description")}</CardDescription>
      </CardHeader>
      {/* The address, and the way out, sit outside the form: the sign-out is a
          form of its own (a POST the server answers with a redirect), and
          forms do not nest. It is the only escape from this page for someone
          who picked the wrong Google account, since every other page sends
          them back here. */}
      <div className="px-6 pb-4">
        <Field
          label={c("email")}
          htmlFor="email"
          labelAction={
            <form method="post" action="/api/auth/signout" className="text-sm">
              <span className="text-muted-foreground">{t("notYou")} </span>
              <Button
                type="submit"
                variant="link"
                className="h-auto p-0 text-sm"
                disabled={isLoading}
              >
                {t("signOut")}
              </Button>
            </form>
          }
        >
          {/* Drawn exactly as the settings page draws a parent's address:
              disabled, on the lifted background. Nothing on this page changes
              the address; the sign-out beside it is how a different one is
              chosen. */}
          <Input
            id="email"
            type="email"
            value={email}
            disabled
            className="bg-lifted"
          />
        </Field>
      </div>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {alert}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {children}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t("finishing") : submitLabel}
          </Button>
          {variantSwitch}
        </CardFooter>
      </form>
    </Card>
  );
}

function ParentCompletion({
  email,
  initialFirstName,
  initialLastName,
  utm,
  redirect,
}: CompleteRegistrationFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const { navigateAfterAuth } = useAuthRedirect(redirect);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const account = useParentAccountFields();
  const namesSchema = useNamesSchema();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Before the busy flag, so a refused submit leaves the form as usable as
    // it was.
    const accountError = account.validate();
    if (accountError) {
      setError(accountError);
      return;
    }

    const names = namesSchema.safeParse({ firstName, lastName });
    if (!names.success) {
      setError(names.error.errors[0].message);
      return;
    }

    // Synchronously, before any await: the button must not re-enable between
    // the click and the navigation that follows success.
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: names.data.firstName,
          lastName: names.data.lastName,
          ...account.requestBody,
          locale,
          utm: utmBody(utm),
          // The product page the sign-up started from, so the account-creation
          // report can name it. The route re-checks it.
          redirect: redirect ?? undefined,
        }),
      });

      if (!response.ok) {
        const { key, leave } = await refusal(response);
        setError(t(`completeRegistration.${key}`));
        if (leave) {
          // Still busy: the document is about to unload.
          window.location.href = ROUTES.login;
          return;
        }
        setIsLoading(false);
        return;
      }

      // The register form's event, from the register form's page: this is the
      // same account creation, finished on a second page.
      pushGtmEvent({
        event: GTM_EVENTS.accountCreated,
        page_path: ROUTES.register,
      });

      // Full-page: the server changed what this account is, and the proxy's
      // decision about where it may go changes with it. The document is
      // unloading — leave isLoading set.
      navigateAfterAuth(ROUTES.selectProfile);
    } catch {
      setError(c("unexpectedError"));
      setIsLoading(false);
    }
  };

  return (
    <CompletionShell
      title={t("completeRegistration.title")}
      email={email}
      error={error}
      isLoading={isLoading}
      submitLabel={t("completeRegistration.submit")}
      onSubmit={handleSubmit}
      alert={
        <Alert variant="info">
          <div>
            <AlertTitle sentence>{t("register.parentAccountAlertTitle")}</AlertTitle>
            <AlertDescription>{t("register.parentAccountAlertDescription")}</AlertDescription>
          </div>
        </Alert>
      }
    >
      <NameFields
        firstLabel={t("register.parentFirstName")}
        lastLabel={t("register.parentLastName")}
        firstName={firstName}
        lastName={lastName}
        setFirstName={setFirstName}
        setLastName={setLastName}
        disabled={isLoading}
      />
      <ParentAccountFields fields={account} disabled={isLoading} />
    </CompletionShell>
  );
}

function GeduCompletion({
  email,
  initialFirstName,
  initialLastName,
  utm,
  redirect,
}: CompleteRegistrationFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const { navigateAfterAuth } = useAuthRedirect(redirect);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const profile = useGeduProfileFields();
  const namesSchema = useNamesSchema();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const names = namesSchema.safeParse({ firstName, lastName });
    if (!names.success) {
      setError(names.error.errors[0].message);
      return;
    }

    const profileError = profile.validate();
    if (profileError) {
      setError(profileError);
      return;
    }

    // Synchronously, before any await: the button must not re-enable between
    // the click and the navigation that follows success.
    setIsLoading(true);

    try {
      const response = await fetch("/api/gedu/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: names.data.firstName,
          lastName: names.data.lastName,
          ...profile.requestBody,
          locale,
          utm: utmBody(utm),
        }),
      });

      if (!response.ok) {
        const { key, leave } = await refusal(response);
        setError(t(`completeRegistration.${key}`));
        if (leave) {
          // Still busy: the document is about to unload.
          window.location.href = ROUTES.login;
          return;
        }
        setIsLoading(false);
        return;
      }

      // Full-page: the account is a Gedu's now, and the root layout has to
      // re-run to know it. The document is unloading — leave isLoading set.
      navigateAfterAuth(ROUTES.gedu.dashboard);
    } catch {
      setError(c("unexpectedError"));
      setIsLoading(false);
    }
  };

  return (
    <CompletionShell
      title={t("completeRegistration.geduTitle")}
      email={email}
      error={error}
      isLoading={isLoading}
      submitLabel={t("completeRegistration.submit")}
      onSubmit={handleSubmit}
      variantSwitch={<VariantSwitch utm={utm} redirect={redirect} />}
      alert={
        <Alert variant="info">
          <div>
            <AlertTitle sentence>{t("registerGedu.certificationAlertTitle")}</AlertTitle>
            <AlertDescription>{t("registerGedu.certificationAlertDescription")}</AlertDescription>
          </div>
        </Alert>
      }
    >
      <NameFields
        firstLabel={c("firstName")}
        lastLabel={c("lastName")}
        firstName={firstName}
        lastName={lastName}
        setFirstName={setFirstName}
        setLastName={setLastName}
        disabled={isLoading}
      />
      <GeduProfileFields fields={profile} disabled={isLoading} />
    </CompletionShell>
  );
}
