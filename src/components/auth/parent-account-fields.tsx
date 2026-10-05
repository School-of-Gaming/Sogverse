"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field } from "@/components/ui/field";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { ROUTES } from "@/lib/constants";

/**
 * The parent account's answers a registration asks for beyond the name and
 * the sign-in: the home location, the terms and the marketing opt-in. Both the
 * password registration and the Google account's finish page ask them, so the
 * state, the refusal before posting and the request fields live here once.
 */
export function useParentAccountFields() {
  const t = useTranslations("auth");
  const [homeLocation, setHomeLocation] = useState<LocationPick | null>(null);
  // The required acknowledgement: agreement to the terms, having been given the
  // Privacy Policy to read. It used to carry a parent-or-guardian declaration
  // too; that moved to the add-gamer form, where the child is named and the
  // declaration can be about somebody in particular — see the consent-document
  // registry for why an account-level version answered the wrong question.
  // Unticked by default for the same reason the optional box below is: a
  // pre-ticked box is not an agreement.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Unticked by default, and it stays that way unless the parent ticks it: an
  // opt-in that arrives pre-ticked is not an opt-in.
  const [marketingConsent, setMarketingConsent] = useState(false);

  return {
    homeLocation,
    setHomeLocation,
    acceptedTerms,
    setAcceptedTerms,
    marketingConsent,
    setMarketingConsent,
    /**
     * The sentence refusing these answers, or null when they may be posted.
     *
     * Refused here rather than by the browser, and the reason is the shape of
     * the rest of the form: `CheckboxRow` takes no `required`, and the other
     * rules the forms enforce before posting are likewise local refusals with
     * a sentence in the parent's own language. A native validity bubble
     * beside a translated Alert would be two idioms for one job. A form calls
     * it before setting its busy flag, so a refused submit leaves the form
     * exactly as usable as it was.
     */
    validate(): string | null {
      return acceptedTerms ? null : t("register.termsRequired");
    },
    /** These answers as the registration routes' request body takes them. */
    requestBody: {
      homeLocationId: homeLocation?.location.id,
      // Always an explicit boolean, never omitted. The schema takes it as
      // optional so an older client that predates the box can still
      // register — but a form that *shows* the question has an answer
      // either way, and "unticked" is a decision the parent made rather
      // than a field they were never asked about.
      marketingConsent,
      // The required acknowledgement. Always `true` when it is sent at all:
      // `validate` refuses the submit unless the box is ticked, and the
      // routes' schemas take nothing else.
      acceptedTerms: true,
    },
  };
}

export type ParentAccountFieldsState = ReturnType<typeof useParentAccountFields>;

export function ParentAccountFields({
  fields,
  disabled,
}: {
  fields: ParentAccountFieldsState;
  disabled: boolean;
}) {
  const t = useTranslations("auth");

  return (
    <>
      <Field label={t("register.location")} htmlFor="homeLocation" optional>
        <HomeLocationField
          id="homeLocation"
          value={fields.homeLocation}
          onChange={fields.setHomeLocation}
          disabled={disabled}
        />
      </Field>
      {/* Both boxes are deliberately not `Field`s: that primitive puts a
          label above its control, and a checkbox is named by the sentence
          beside it — a label above one would be a second name for the same
          thing. The shared row is the composition instead: the sentence is
          the label, any hint sits under it in the same column, and
          `aria-describedby` is wired for us.

          The required acknowledgement sits directly above the optional box,
          so the two read as one pair and the one that gates the form is met
          first. It carries NO hint: per the `CheckboxRow` doc the absence
          of the optional marker IS the "required", and the row below is the
          exception that says so in words. The two documents are named
          inside the sentence and each name is its own link, which is what a
          parent has to be able to reach before agreeing; a click landing on
          a link reads instead of ticking, which the DOM gives for free. */}
      <CheckboxRow
        checked={fields.acceptedTerms}
        onCheckedChange={fields.setAcceptedTerms}
        disabled={disabled}
        label={t.rich("register.termsLabel", {
          // A new tab for both, as the signup panel opens its consent
          // documents: the parent is mid-way through a form, and the
          // document is the thing they have to read *before* submitting
          // it. In this tab, the way back would be an empty form.
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
      {/* The hint is info-toned, exactly as the signup panel's marketing
          row is — it is the same sentence, opening on the same word, doing
          the same job of saying this one may be skipped. Leaving one of the
          two muted and the other coloured would be drift a reader could
          actually notice, since a parent meets both within one signup. */}
      <CheckboxRow
        checked={fields.marketingConsent}
        onCheckedChange={fields.setMarketingConsent}
        disabled={disabled}
        label={t("register.marketingConsentLabel")}
        hint={t("register.marketingConsentHint")}
        hintTone="info"
      />
    </>
  );
}
