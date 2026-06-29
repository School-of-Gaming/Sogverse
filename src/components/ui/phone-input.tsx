"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { FLAGS } from "@/components/ui/flags";

/**
 * Pre-configured international phone input with Finnish default.
 * Restricts country dropdown to Finland, UK, Sweden, and US.
 * Outputs E.164 format (e.g. "+358401234567").
 */
export function InternationalPhoneInput({
  value,
  onChange,
  id,
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  className?: string;
}) {
  return (
    <PhoneInput
      id={id}
      international
      defaultCountry="FI"
      countries={["FI", "GB", "SE", "US"]}
      addInternationalOption={true}
      flags={FLAGS}
      value={value}
      onChange={onChange}
      className={
        className ??
        // text-base (16px): matches the shared Input — a sub-16px field makes
        // iOS Safari auto-zoom on focus and horizontal-scroll the page.
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      }
    />
  );
}
