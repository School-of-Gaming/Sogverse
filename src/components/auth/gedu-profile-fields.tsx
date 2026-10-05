"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isValidPhoneNumber } from "react-phone-number-input";
import { Field } from "@/components/ui/field";
import { GAME_PLATFORMS, GameUsernameEditableRow } from "@/components/game-account";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { CoverageAreasField } from "@/components/gedu/coverage-areas-field";
import { toggleCoverageTick, type CoverageTick } from "@/components/gedu/coverage-ticks";
import type { SpokenLanguageCode } from "@/types";

/**
 * Literals rather than `useId()`s, because the other fields on the forms this
 * renders in name their inputs the same way — one page, one form, one of each.
 */
const MINECRAFT_USERNAME_INPUT_ID = "gedu-minecraft-username";
const ROBLOX_USERNAME_INPUT_ID = "gedu-roblox-username";

/**
 * The Gedu's profile answers a registration asks for beyond the name and the
 * sign-in: game handles, phone, spoken languages and the areas covered. Both
 * the password registration and the Google account's finish page ask them, so
 * the state, the check before posting and the request fields live here once.
 */
export function useGeduProfileFields() {
  const t = useTranslations("auth");
  const [minecraftUsername, setMinecraftUsername] = useState<string | null>(null);
  const [robloxUsername, setRobloxUsername] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenLanguageCode[]>([]);
  /**
   * Coverage claims, keyed by `locations.id`. The picker browses the table
   * itself — which anonymous callers may read, `locations` being public
   * reference data — so a claim is already a row id here and submit sends it
   * straight through.
   */
  const [coverage, setCoverage] = useState<ReadonlyMap<string, CoverageTick>>(
    new Map(),
  );

  return {
    minecraftUsername,
    setMinecraftUsername,
    robloxUsername,
    setRobloxUsername,
    phone,
    setPhone,
    spokenLanguages,
    setSpokenLanguages,
    coverage,
    setCoverage,
    /** The sentence refusing these answers, or null when they may be posted. */
    validate(): string | null {
      if (phone && !isValidPhoneNumber(phone)) return t("registerGedu.invalidPhone");
      return null;
    },
    /** These answers as the registration routes' request body takes them. */
    requestBody: {
      phone: phone || undefined,
      spokenLanguages,
      locationIds: [...coverage.keys()],
      minecraftUsername: minecraftUsername ?? undefined,
      robloxUsername: robloxUsername ?? undefined,
    },
  };
}

export type GeduProfileFieldsState = ReturnType<typeof useGeduProfileFields>;

export function GeduProfileFields({
  fields,
  disabled,
}: {
  fields: GeduProfileFieldsState;
  disabled: boolean;
}) {
  const t = useTranslations("auth");
  const g = useTranslations("gameAccount");
  const c = useTranslations("common");
  const locale = useLocale();

  return (
    <>
      {/* First capture on both platforms: nothing is saved yet, so each row
          opens straight into edit mode. The label belongs to the form, not
          the row — a roster renders the same row with no label at all — so
          the id is handed down and the row drops its own sr-only label
          rather than labelling the input twice.

          Side by side at the same breakpoint as the name and password
          pairs, because they are the same kind of pair: two independent
          optional answers, neither of which is more important than the
          other. Stacked below `sm`, like everything else on the form. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={g("label", { platform: GAME_PLATFORMS.minecraft.name })}
          htmlFor={MINECRAFT_USERNAME_INPUT_ID}
          optional
        >
          <GameUsernameEditableRow
            platform="minecraft"
            username={fields.minecraftUsername}
            autoEdit
            inputId={MINECRAFT_USERNAME_INPUT_ID}
            onCommit={({ username }) => fields.setMinecraftUsername(username)}
          />
        </Field>
        <Field
          label={g("label", { platform: GAME_PLATFORMS.roblox.name })}
          htmlFor={ROBLOX_USERNAME_INPUT_ID}
          optional
        >
          <GameUsernameEditableRow
            platform="roblox"
            username={fields.robloxUsername}
            autoEdit
            inputId={ROBLOX_USERNAME_INPUT_ID}
            onCommit={({ username }) => fields.setRobloxUsername(username)}
          />
        </Field>
      </div>
      <Field label={c("phoneNumber")} htmlFor="phone" optional>
        <InternationalPhoneInput
          id="phone"
          value={fields.phone || undefined}
          onChange={(value) => fields.setPhone(value ?? "")}
        />
      </Field>
      <SpokenLanguageCheckboxes
        selected={fields.spokenLanguages}
        onChange={fields.setSpokenLanguages}
        disabled={disabled}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("registerGedu.coverageHeading")}</p>
        <p className="text-sm text-muted-foreground">{t("registerGedu.coverageNote")}</p>
        <CoverageAreasField
          ticks={fields.coverage}
          onToggle={(pick) =>
            fields.setCoverage((current) => toggleCoverageTick(current, pick, locale))
          }
          onRemove={(locationId) =>
            fields.setCoverage((current) => {
              const next = new Map(current);
              next.delete(locationId);
              return next;
            })
          }
          onClear={() => fields.setCoverage(new Map())}
          disabled={disabled}
        />
      </div>
    </>
  );
}
