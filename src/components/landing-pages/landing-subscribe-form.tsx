"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle, StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedLocale } from "@/lib/constants/locales";
import { utmRegistrationBody } from "@/lib/utm";
import { useUtm } from "@/providers";
import {
  LANDING_SUBSCRIBE_FIRST_NAME_MAX,
  LANDING_SUBSCRIBE_HONEYPOT,
  type LandingSubscribeBody,
} from "@/services/landing-pages/landing-subscribe.contracts";

/** Which refusal sentence a failed post reads. */
type Refusal = "consentRequired" | "invalid" | "rateLimited" | "error";

function refusalFor(status: number): Refusal {
  if (status === 429) return "rateLimited";
  if (status === 400) return "invalid";
  return "error";
}

/**
 * **A landing page's email sign-up form**: an email address, an optional first
 * name, and the consent box, posted to the sign-up route, which asks Brevo to
 * confirm the address by double opt-in.
 *
 * Three states, each replacing the last in place: the form; "check your inbox"
 * once the route has accepted it, which says the same for a new address and a
 * known one; and, when the reader arrives back from the confirmation link,
 * "you are signed up" in place of the form. The two swaps follow the reader's
 * own action (a submit, a followed link), so nothing outlives them to move.
 *
 * The button holds its pending state from the click until the answer: a
 * success swaps the form away, so the flag is cleared only on a refusal the
 * reader has to retry.
 */
export function LandingSubscribeForm({
  pageId,
  sectionId,
  locale,
  buttonLabel,
  confirmed,
}: {
  pageId: string;
  sectionId: string;
  /** The page's locale: the language the confirmation mail and the way back are in. */
  locale: SupportedLocale;
  buttonLabel: string;
  /** The reader has just come back from confirming. */
  confirmed: boolean;
}) {
  const t = useTranslations("landingSubscribe");
  const utm = useUtm();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [consent, setConsent] = useState(false);
  // The honeypot's value. A person never sees the field, so it stays empty
  // for them; it is read from state so a bot's fill is posted like any field.
  const [trap, setTrap] = useState("");
  const [committing, setCommitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (confirmed) {
    return (
      <Alert variant="success">
        <div>
          <AlertTitle>{t("confirmedTitle")}</AlertTitle>
          <AlertDescription>{t("confirmedBody")}</AlertDescription>
        </div>
      </Alert>
    );
  }

  if (sentTo !== null) {
    return (
      <Alert variant="success" role="status">
        <div>
          <AlertTitle>{t("sentTitle")}</AlertTitle>
          <AlertDescription>{t("sentBody", { email: sentTo })}</AlertDescription>
        </div>
      </Alert>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Refused before the busy flag, so a refused submit leaves the form as
    // usable as it was.
    if (!consent) {
      setRefusal("consentRequired");
      return;
    }
    setRefusal(null);
    setCommitting(true);

    const body: LandingSubscribeBody = {
      pageId,
      sectionId,
      locale,
      email,
      firstName,
      consent: true,
      [LANDING_SUBSCRIBE_HONEYPOT]: trap,
      utm: utmRegistrationBody(utm),
    };
    try {
      const response = await fetch("/api/landing-pages/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setRefusal(refusalFor(response.status));
        setCommitting(false);
        return;
      }
      setSentTo(email.trim());
    } catch {
      setRefusal("error");
      setCommitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t("email")} htmlFor={`${sectionId}-email`}>
        <Input
          id={`${sectionId}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={committing}
          required
          autoComplete="email"
        />
      </Field>
      <Field label={t("firstName")} htmlFor={`${sectionId}-first-name`} optional>
        <Input
          id={`${sectionId}-first-name`}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          disabled={committing}
          maxLength={LANDING_SUBSCRIBE_FIRST_NAME_MAX}
          autoComplete="given-name"
        />
      </Field>
      {/* The honeypot: out of sight and out of the tab order and the
          accessibility tree, so only something filling every input it finds
          ever puts a value in it. */}
      <div aria-hidden="true" className="hidden">
        <input
          type="text"
          name={LANDING_SUBSCRIBE_HONEYPOT}
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(event) => setTrap(event.target.value)}
        />
      </div>
      <CheckboxRow
        checked={consent}
        onCheckedChange={(next) => {
          setConsent(next);
          if (next && refusal === "consentRequired") setRefusal(null);
        }}
        disabled={committing}
        label={t.rich("consent", {
          // A new tab: the reader is part-way through the form, and in this
          // tab the way back would be an empty one.
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
      {refusal !== null && (
        <StatusLine status="destructive" role="alert">
          {t(refusal)}
        </StatusLine>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={committing}>
        {buttonLabel}
      </Button>
    </form>
  );
}
