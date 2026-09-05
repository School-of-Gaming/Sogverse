"use client";

/**
 * The product form's region lock, as a grid of full radio cards.
 *
 * The heavy half of the mismatched pair described in
 * `spoken-language-radios.tsx`: bordered cards on a grid, in the same shape the
 * form's other one-of-many choices already use (start mode, registration mode),
 * against the compact wrapping pills the language row is built from. The flag
 * is deliberately at a different scale too — 28px wide here against the 18px
 * language chip — so the two rows never read as one vocabulary.
 *
 * The "not region locked" card leads, because it is the default and by far the
 * commonest answer, and it wears a `Globe` rather than a flag: it is the
 * absence of a country being chosen, so breaking the flag rhythm is the point.
 *
 * Every country in the config is offered, and that is the whole of the rule:
 * the config *is* the list of countries we operate in, rows and all, so every
 * option here is a country a family can already hold a location in.
 */

import { useMemo } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FLAGS, type FlagComponent } from "@/components/ui/flags";
import { countryDisplayName } from "@/components/public/products/region-lock/region-gate";
import { SUPPORTED_COUNTRIES } from "@/lib/constants/location-hierarchies";
import { resolveLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";

// The flag registry is keyed by the countries we have imported a flag for;
// a country config's `code` is a plain string. Widening the registry once, at
// module level, is what keeps the per-card lookup a *constant index expression*
// — `react-hooks/static-components` recognises that and flags any function call
// that hands back a component instead. The `| undefined` value side is required
// without `noUncheckedIndexedAccess`, which would otherwise type a miss as a
// hit; today every supported country has a flag, and this renders the card
// without one rather than crashing if that ever stops being true.
const FLAG_BY_COUNTRY: Record<string, FlagComponent | undefined> = FLAGS;

export function RegionLockRadios({
  value,
  onChange,
  labelId,
  hintId,
}: {
  /** The locked country's ISO 3166-1 alpha-2 code, or `null` for no lock. */
  value: string | null;
  onChange: (code: string | null) => void;
  labelId: string;
  hintId: string | undefined;
}) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());

  // Country names in the admin's own language, through the same helper the shop
  // panel and the product details row use — one fallback chain for the whole
  // app rather than a second copy of it here.
  const options = useMemo(
    () => [
      { code: null, name: null },
      ...SUPPORTED_COUNTRIES.map((country) => ({
        code: country.code,
        name: countryDisplayName(country.code, uiLocale),
      })),
    ],
    [uiLocale]
  );

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {options.map((option) => {
        const selected = value === option.code;
        const Flag = option.code === null ? undefined : FLAG_BY_COUNTRY[option.code];
        return (
          <label
            key={option.code ?? "none"}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-foreground/30"
            )}
          >
            <input
              type="radio"
              name="regionLock"
              className="h-4 w-4 shrink-0"
              checked={selected}
              onChange={() => onChange(option.code)}
            />
            {/* A fixed-size glyph slot so the names line up down the column
                whichever glyph lands in it — a 3:2 flag and a round icon have
                different intrinsic shapes. Decorative: every card's country is
                already written next to it in words. */}
            <span
              aria-hidden
              className="flex h-5 w-7 shrink-0 items-center justify-center"
            >
              {Flag ? (
                <span className="w-7 overflow-hidden rounded-[2px] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full">
                  <Flag />
                </span>
              ) : (
                <Globe
                  className={cn(
                    "h-5 w-5",
                    selected ? "text-primary" : "text-muted-foreground"
                  )}
                />
              )}
            </span>
            <span className="min-w-0 flex-1 font-medium">
              {option.name ?? t("regionLock.none")}
            </span>
          </label>
        );
      })}
    </div>
  );
}
