"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { NameFields } from "@/components/auth/name-fields";
import { Alert, AlertDescription, AlertTitle, StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  LANDING_SUBSCRIBE_FIRST_NAME_MAX,
  LANDING_SUBSCRIBE_LAST_NAME_MAX,
  type LandingSubscribeBody,
} from "@/services/landing-pages/landing-subscribe.contracts";
import { cn } from "@/lib/cn";
import { LANDING_STICKY_ACTION } from "./landing-section-header";

/** Which refusal sentence a failed post reads. */
type Refusal = "invalid" | "error";

/**
 * **A landing page's email sign-up form**: an optional first and last name,
 * side by side as the registration forms set them (stacked in the sticky
 * card from `2xl`, whose column is too narrow for a pair, where the button
 * also fills the column), an email address and the
 * consent box, posted to the sign-up route, which puts the address on the
 * newsletter list at once (single opt-in). The button stays disabled until an
 * address is typed and the box is ticked — the names never hold it back;
 * whether the address is well-formed is left to the browser's email field and
 * the route's 400.
 *
 * Two states: the form, and "you are signed up" in its place once the route
 * has accepted it, which says the same for a new address and a known one. The
 * swap follows the reader's own submit, so nothing outlives it to move.
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
  buttonLabelLang,
  preview,
  sticky = false,
}: {
  pageId: string;
  sectionId: string;
  /** The page's locale: the language the reader signs up in. */
  locale: SupportedLocale;
  buttonLabel: string;
  /**
   * The language the button label is written in, where it is not the page's:
   * the label is the page version's words, and every other word here is ours.
   */
  buttonLabelLang?: SupportedLocale;
  /** The admin's preview: the form is drawn, but its button is disabled and nothing is posted. */
  preview: boolean;
  /**
   * In a sticky section, which from `2xl` is the sticky card, a 20rem column:
   * there the name fields stand one above the other and the button takes the
   * column's full width. Below `2xl`, and on a section that is not sticky, the
   * names pair up from `sm` and the button is centred under the centred
   * heading.
   */
  sticky?: boolean;
}) {
  const t = useTranslations("landingSubscribe");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [consent, setConsent] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  if (signedUp) {
    return (
      <Alert variant="success" role="status">
        <div>
          <AlertTitle>{t("successTitle")}</AlertTitle>
          <AlertDescription>{t("successBody")}</AlertDescription>
        </div>
      </Alert>
    );
  }

  const complete = email.trim() !== "" && consent;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button is disabled in both cases; this only stops a submit that
    // reaches the form some other way.
    if (preview || !complete) return;
    setRefusal(null);
    setCommitting(true);

    const body: LandingSubscribeBody = {
      pageId,
      sectionId,
      locale,
      email,
      firstName,
      lastName,
      consent: true,
    };
    try {
      const response = await fetch("/api/landing-pages/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setRefusal(response.status === 400 ? "invalid" : "error");
        setCommitting(false);
        return;
      }
      setSignedUp(true);
    } catch {
      setRefusal("error");
      setCommitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* In the sticky card the pair is stacked from `2xl`; below it the
          section is in the flow, where the fields' own pair is right. */}
      <NameFields
        firstLabel={t("firstName")}
        lastLabel={t("lastName")}
        firstName={firstName}
        lastName={lastName}
        setFirstName={setFirstName}
        setLastName={setLastName}
        disabled={committing}
        optional
        stackFrom={sticky ? "2xl" : undefined}
        idPrefix={`${sectionId}-`}
        firstMaxLength={LANDING_SUBSCRIBE_FIRST_NAME_MAX}
        lastMaxLength={LANDING_SUBSCRIBE_LAST_NAME_MAX}
      />
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
      <CheckboxRow
        checked={consent}
        onCheckedChange={setConsent}
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
      <div className="flex justify-center">
        <Button
          type="submit"
          size="lg"
          className={cn("w-full sm:w-auto", sticky && LANDING_STICKY_ACTION)}
          disabled={committing || preview || !complete}
        >
          <span lang={buttonLabelLang}>{buttonLabel}</span>
          <Send aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
