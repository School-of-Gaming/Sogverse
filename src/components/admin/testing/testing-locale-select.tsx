"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";

/** The native select styling shared by every tool on the admin testing page. */
export const testingSelectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2";

/** The testing page's language picker, shared by the email and Discord tools. */
export function TestingLocaleSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  const t = useTranslations("admin.testing");
  const languageName = useLanguageNames();

  return (
    <Field label={t("language")} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (isSupportedLocale(e.target.value)) {
            onChange(e.target.value);
          }
        }}
        className={testingSelectClass}
      >
        {SUPPORTED_LOCALES.map((opt) => (
          <option key={opt} value={opt}>
            {LOCALE_CONFIG[opt].nativeLabel} ({languageName(opt, LOCALE_CONFIG[opt].label)})
          </option>
        ))}
      </select>
    </Field>
  );
}
