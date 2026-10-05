"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { ADMIN_EMAIL_KINDS } from "@/services/admin-email-preferences";
import type { AdminEmailKind } from "@/types";

/**
 * **An admin's staff email preferences — a group of fields inside the Profile
 * card, saved by its button**, the same shape and for the same reason as the
 * parent's marketing preferences: every control on the settings page is
 * committed by that one Save button.
 *
 * Purely presentational and controlled; the card owns the seed, the edits and
 * the writes. One row per kind, each a sentence naming the mail and a muted
 * line under it saying what it is, because an admin deciding whether to
 * receive it needs to know what will arrive.
 */
export function AdminEmailPreferencesFields({
  enabled,
  onChange,
  disabled,
}: {
  /** Whether each kind is currently ticked, saved value plus any local edit. */
  enabled: (kind: AdminEmailKind) => boolean;
  onChange: (kind: AdminEmailKind, next: boolean) => void;
  /** True until the stored answers land, and again while a save is in flight. */
  disabled: boolean;
}) {
  const t = useTranslations("settings.adminEmails");

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("title")}</legend>
      <div className="flex flex-col gap-2">
        {ADMIN_EMAIL_KINDS.map((kind) => (
          <label key={kind} className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              className="mt-0.5"
              checked={enabled(kind)}
              onChange={(e) => onChange(kind, e.target.checked)}
              disabled={disabled}
            />
            <span className="space-y-0.5">
              <span className="block">{t(`${kind}.label`)}</span>
              <span className="block text-muted-foreground">{t(`${kind}.hint`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
