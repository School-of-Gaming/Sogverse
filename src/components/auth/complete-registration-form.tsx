"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { isValidPhoneNumber } from "react-phone-number-input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { GAME_PLATFORMS, GameUsernameEditableRow } from "@/components/game-account";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { CoverageAreasField } from "@/components/gedu/coverage-areas-field";
import { toggleCoverageTick, type CoverageTick } from "@/components/gedu/coverage-ticks";
import { readErrorMessage } from "@/lib/api/json-response";
import { pushGtmEvent } from "@/lib/gtm";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import type { UtmAttribution } from "@/lib/utm";
import {
  COMPLETE_REGISTRATION_PARENT_QUERY,
  completeRegistrationQuery,
} from "@/lib/navigation/post-auth-redirect";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import type { SpokenLanguageCode } from "@/types";

/**
 * The same name rules the register forms hold a parent and a Gedu to, stated
 * for this form's own sentence before the round trip. The routes' contracts
 * are the ones that have to hold.
 */
const namesSchema = z.object({
  firstName: z.string().trim().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().trim().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
});

const MINECRAFT_USERNAME_INPUT_ID = "complete-registration-minecraft-username";
const ROBLOX_USERNAME_INPUT_ID = "complete-registration-roblox-username";

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
 * What a refused completion shows, and whether the page has to move on. A 409
 * is an account that no longer owes registration — finished in another tab, or
 * never a fresh one — and signing in again lands it wherever it now belongs.
 */
async function refusal(
  response: Response,
  messages: { alreadyComplete: string; unexpected: string },
): Promise<{ message: string; leave: boolean }> {
  if (response.status === 409) {
    return { message: messages.alreadyComplete, leave: true };
  }
  return {
    message: await readErrorMessage(response, messages.unexpected),
    leave: false,
  };
}

/**
 * The line under the submit that swaps variants, keeping the attribution and
 * the product page. The parent form's link asks for the Gedu form; the Gedu
 * form's asks for the parent one outright, since an address that says nothing
 * falls back to the intent cookie, which says Gedu.
 */
function VariantSwitch({
  to,
  utm,
  redirect,
}: {
  to: CompleteRegistrationFormProps["variant"];
  utm: UtmAttribution;
  redirect: string | null;
}) {
  const t = useTranslations("auth.completeRegistration");
  const query =
    to === "gedu"
      ? completeRegistrationQuery({ asGedu: true, utm, redirect })
      : {
          ...COMPLETE_REGISTRATION_PARENT_QUERY,
          ...completeRegistrationQuery({ asGedu: false, utm, redirect }),
        };

  return (
    <p className="text-center text-sm text-muted-foreground">
      {t.rich(to === "gedu" ? "switchToGedu" : "switchToParent", {
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
  /** The way to the other variant, a muted line under the submit. */
  variantSwitch: React.ReactNode;
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
          {/* `readOnly`, not `disabled`, so the address can be tabbed to and
              copied; `bg-lifted` is how every read-back field in the app says
              it is not for editing. */}
          <Input
            id="email"
            type="email"
            value={email}
            readOnly
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

function NameFields({
  firstLabel,
  lastLabel,
  firstName,
  lastName,
  setFirstName,
  setLastName,
  disabled,
}: {
  firstLabel: string;
  lastLabel: string;
  firstName: string;
  lastName: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={firstLabel} htmlFor="firstName">
        <Input
          id="firstName"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={disabled}
          required
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="given-name"
        />
      </Field>
      <Field label={lastLabel} htmlFor="lastName">
        <Input
          id="lastName"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={disabled}
          required
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="family-name"
        />
      </Field>
    </div>
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
  const [homeLocation, setHomeLocation] = useState<LocationPick | null>(null);
  // Unticked by default, both of them, exactly as on the register form: a
  // pre-ticked box is not an agreement, and not an opt-in either.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // The register form's refusal, word for word, and before the busy flag so
    // a refused submit leaves the form as usable as it was.
    if (!acceptedTerms) {
      setError(t("register.termsRequired"));
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
          homeLocationId: homeLocation?.location.id,
          locale,
          utm: utmBody(utm),
          marketingConsent,
          acceptedTerms: true,
        }),
      });

      if (!response.ok) {
        const { message, leave } = await refusal(response, {
          alreadyComplete: t("completeRegistration.alreadyComplete"),
          unexpected: c("unexpectedError"),
        });
        setError(message);
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
      variantSwitch={<VariantSwitch to="gedu" utm={utm} redirect={redirect} />}
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
      <Field label={t("register.location")} htmlFor="homeLocation" optional>
        <HomeLocationField
          id="homeLocation"
          value={homeLocation}
          onChange={setHomeLocation}
          disabled={isLoading}
        />
      </Field>
      {/* The register form's two rows, in the register form's order: the
          required acknowledgement first, the optional box under it. */}
      <CheckboxRow
        checked={acceptedTerms}
        onCheckedChange={setAcceptedTerms}
        disabled={isLoading}
        label={t.rich("register.termsLabel", {
          terms: (chunks) => (
            <Link
              href={ROUTES.termsAndConditions}
              target="_blank"
              rel="noopener noreferrer"
              className="text-act hover:underline"
            >
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link
              href={ROUTES.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="text-act hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      />
      <CheckboxRow
        checked={marketingConsent}
        onCheckedChange={setMarketingConsent}
        disabled={isLoading}
        label={t("register.marketingConsentLabel")}
        hint={t("register.marketingConsentHint")}
        hintTone="info"
      />
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
  const g = useTranslations("gameAccount");
  const c = useTranslations("common");
  const locale = useLocale();
  const { navigateAfterAuth } = useAuthRedirect(redirect);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [minecraftUsername, setMinecraftUsername] = useState<string | null>(null);
  const [robloxUsername, setRobloxUsername] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenLanguageCode[]>([]);
  const [coverage, setCoverage] = useState<ReadonlyMap<string, CoverageTick>>(
    new Map(),
  );
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

    if (phone && !isValidPhoneNumber(phone)) {
      setError(t("registerGedu.invalidPhone"));
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
          phone: phone || undefined,
          spokenLanguages,
          locale,
          locationIds: [...coverage.keys()],
          minecraftUsername: minecraftUsername ?? undefined,
          robloxUsername: robloxUsername ?? undefined,
          utm: utmBody(utm),
        }),
      });

      if (!response.ok) {
        const { message, leave } = await refusal(response, {
          alreadyComplete: t("completeRegistration.alreadyComplete"),
          unexpected: c("unexpectedError"),
        });
        setError(message);
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
      variantSwitch={<VariantSwitch to="parent" utm={utm} redirect={redirect} />}
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
      {/* The register-gedu form's game-handle pair, for the same reasons it
          has it: first capture, so each row opens straight into edit mode, and
          two independent optional answers side by side. */}
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
            setCoverage((current) => toggleCoverageTick(current, pick, locale))
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
    </CompletionShell>
  );
}
