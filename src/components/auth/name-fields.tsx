"use client";

import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

/**
 * The name rules every registration form holds a parent or a Gedu to, as
 * fields to spread into the form's own schema.
 *
 * `.trim()` before the length checks, so they measure the name rather than
 * the whitespace around it — " A" is not a two-character first name. The
 * routes' own contracts trim again for the same reason: they are the ones
 * that have to hold, because the name goes from there into the profile. This
 * copy exists so the message a reader sees is the form's, before a round trip.
 */
export const nameSchemaFields = {
  firstName: z.string().trim().min(DISPLAY_NAME_MIN, `First name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `First name must be at most ${DISPLAY_NAME_MAX} characters`),
  lastName: z.string().trim().min(DISPLAY_NAME_MIN, `Last name must be at least ${DISPLAY_NAME_MIN} characters`).max(DISPLAY_NAME_MAX, `Last name must be at most ${DISPLAY_NAME_MAX} characters`),
};

/**
 * The two halves of one name, side by side from `sm` and stacked below it: a
 * first and last name are one answer split in two, and a wide card that runs
 * them down the middle wastes the width the card was widened for.
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
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={firstLabel} htmlFor="firstName">
        <Input
          id="firstName"
          type="text"
          placeholder={firstPlaceholder}
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
          placeholder={lastPlaceholder}
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
