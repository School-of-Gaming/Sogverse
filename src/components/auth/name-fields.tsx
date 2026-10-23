"use client";

import { useTranslations } from "next-intl";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants/account-limits";

/**
 * The name rules every registration form holds a parent or a Gedu to, as
 * fields to spread into the form's own schema, with their refusals in the
 * reader's language.
 *
 * `.trim()` before the length checks, so they measure the name rather than
 * the whitespace around it — " A" is not a two-character first name. The
 * routes' own contracts trim again for the same reason: they are the ones
 * that have to hold, because the name goes from there into the profile. This
 * copy exists so the message a reader sees is the form's, before a round trip.
 */
export function useNameSchemaFields() {
  const t = useTranslations("auth.validation");
  return {
    firstName: z
      .string()
      .trim()
      .min(DISPLAY_NAME_MIN, t("firstNameTooShort", { min: DISPLAY_NAME_MIN }))
      .max(DISPLAY_NAME_MAX, t("firstNameTooLong", { max: DISPLAY_NAME_MAX })),
    lastName: z
      .string()
      .trim()
      .min(DISPLAY_NAME_MIN, t("lastNameTooShort", { min: DISPLAY_NAME_MIN }))
      .max(DISPLAY_NAME_MAX, t("lastNameTooLong", { max: DISPLAY_NAME_MAX })),
  };
}

/**
 * The two halves of one name, side by side from `sm` and stacked below it: a
 * first and last name are one answer split in two, and a wide card that runs
 * them down the middle wastes the width the card was widened for.
 * `stackFrom` stacks them again from that breakpoint up, for a form that from
 * there is set in a column narrower than the viewport says.
 *
 * Required by default, as every registration form asks; `optional` marks both
 * halves optional for a form that only invites a name. `idPrefix` keeps the
 * inputs' ids unique on a page that can draw the fields more than once, and
 * the length caps default to an account's display-name limit.
 */
export function NameFields({
  firstLabel,
  lastLabel,
  firstPlaceholder,
  lastPlaceholder,
  firstName,
  lastName,
  setFirstName,
  setLastName,
  disabled,
  optional = false,
  stackFrom,
  idPrefix = "",
  firstMaxLength = DISPLAY_NAME_MAX,
  lastMaxLength = DISPLAY_NAME_MAX,
}: {
  firstLabel: string;
  lastLabel: string;
  firstPlaceholder?: string;
  lastPlaceholder?: string;
  firstName: string;
  lastName: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  disabled: boolean;
  optional?: boolean;
  stackFrom?: "2xl";
  idPrefix?: string;
  firstMaxLength?: number;
  lastMaxLength?: number;
}) {
  const firstId = `${idPrefix}firstName`;
  const lastId = `${idPrefix}lastName`;
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", stackFrom === "2xl" && "2xl:grid-cols-1")}>
      <Field label={firstLabel} htmlFor={firstId} optional={optional}>
        <Input
          id={firstId}
          type="text"
          placeholder={firstPlaceholder}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={disabled}
          required={!optional}
          maxLength={firstMaxLength}
          autoComplete="given-name"
        />
      </Field>
      <Field label={lastLabel} htmlFor={lastId} optional={optional}>
        <Input
          id={lastId}
          type="text"
          placeholder={lastPlaceholder}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={disabled}
          required={!optional}
          maxLength={lastMaxLength}
          autoComplete="family-name"
        />
      </Field>
    </div>
  );
}
