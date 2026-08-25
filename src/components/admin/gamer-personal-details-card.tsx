"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useTimezone } from "@/providers";
import { useGamerProfile, useUpdateGamerProfile } from "@/services/gamers";
import {
  assembleGamerDateOfBirth,
  gamerBirthYearOptionsIncluding,
  splitGamerDateOfBirth,
} from "@/lib/gamer-birth";
import { computeAge } from "@/lib/utils";
import { Constants, type GamerProfile, type GenderType } from "@/types";

/**
 * The three values the card edits, in the shape a `<select>` reads and writes.
 * `""` is the gender's "not specified" — a real answer, stored as NULL.
 */
interface BirthDetails {
  /** 1–12, as a string. */
  month: string;
  year: string;
  gender: GenderType | "";
}

/**
 * Narrows a select's raw value against codegen rather than asserting it. The
 * options are generated from the same tuple, so nothing else can arrive — but a
 * `<select>`'s value is a `string` to the compiler, and an assertion here would
 * be a claim rather than a check.
 */
function toGender(value: string): GenderType | "" {
  return Constants.public.Enums.gender_type.find((g) => g === value) ?? "";
}

/**
 * A gamer's birth month/year and gender on their admin detail page, editable in
 * place.
 *
 * **Why an admin can write these at all:** the pair is chosen once, by a parent
 * filling in the Add Gamer form, and never asked about again — so a mistyped
 * year is a mistake nobody in the family can undo, and it is not cosmetic: age
 * is what places a child in a product's band. The database has always allowed
 * the fix (`gamer_profiles` carries a `FOR ALL` admin policy over `is_admin()`);
 * this is the surface that uses it, on the same footing as the game-accounts
 * card below it.
 *
 * **It is the only home for these facts, deliberately.** The summary at the top
 * of the page used to render "11 years old · Boy" as a read-only line; that line
 * is gone, for exactly the reason the Minecraft row above it went — a summary
 * that goes stale the moment the card underneath is used is the wrong second
 * home, and two places showing one value is worse than either alone.
 *
 * **The RSC/client seam.** The page already reads the row to decide what to
 * render, so it hands it down as `initialProfile` and the query is seeded with
 * it: the first frame is complete, nothing arrives late, nothing moves.
 *
 * **Month granularity, not a date input.** The column is a full `date` but no
 * form in the product ever asks for the day — a parent picks a month and a year,
 * and the stored value is anchored to the 1st. An admin editing it picks the
 * same two, through the same enrollment year band, so a correction cannot
 * introduce a shape the create path could not have produced.
 */
export function GamerPersonalDetailsCard({
  gamerId,
  initialProfile,
}: {
  gamerId: string;
  initialProfile: GamerProfile;
}) {
  const t = useTranslations("admin.users.gamerDetails");
  const c = useTranslations("common");
  const locale = useLocale();
  const timeZone = useTimezone();

  const { data } = useGamerProfile(gamerId, { initialData: initialProfile });
  // The seed makes this unconditional in practice; the fallback is what tells
  // the compiler so, without an assertion.
  const profile = data ?? initialProfile;
  const updateProfile = useUpdateGamerProfile();

  // Per CLAUDE.md "Loading & Disabled State": live before any render after the
  // click. This card stays mounted through both outcomes — there is no
  // navigation or view swap to hand the flag off to — so it is cleared once the
  // write settles, and the button stays disabled anyway because a successful
  // save leaves nothing changed to save.
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * The stored row, in the shape the three controls edit. Strings throughout
   * because that is what a `<select>` reads and writes; `""` is the gender's
   * "not specified", which is a real answer and stores as NULL.
   *
   * The date is split textually rather than parsed — a bare calendar date has no
   * instant to convert, and `new Date("2017-01-01")` read back through the
   * runtime's zone lands in December for any viewer west of UTC.
   */
  const stored = useMemo<BirthDetails>(() => {
    const { year, month } = splitGamerDateOfBirth(profile.date_of_birth);
    return {
      month: String(month),
      year: String(year),
      gender: profile.gender ?? "",
    };
  }, [profile.date_of_birth, profile.gender]);

  /**
   * The pending edit, or `null` while the controls simply mirror what is
   * stored. Holding "no edit" rather than a copy of the row is what makes a
   * successful save re-sync by itself: the mutation seeds the profile cache with
   * the row it wrote, `stored` follows, and clearing the draft leaves the
   * controls showing exactly what the database now holds.
   */
  const [draft, setDraft] = useState<BirthDetails | null>(null);
  const value = draft ?? stored;

  const dirty =
    value.month !== stored.month ||
    value.year !== stored.year ||
    value.gender !== stored.gender;

  const months = useMemo(() => {
    // Never a translated string: the locale's own month names, from Intl.
    const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: fmt.format(new Date(2000, i, 1)),
    }));
  }, [locale]);

  // The enrollment band, plus whatever year is actually stored — see
  // `gamerBirthYearOptionsIncluding`. A stored year the rolling window no longer
  // offers would otherwise render as an empty select and be saved as something
  // else the moment the gender beside it was touched.
  const years = useMemo(
    () => gamerBirthYearOptionsIncluding(Number(stored.year)),
    [stored.year],
  );

  // Read off the selection rather than the stored row, so the number an admin is
  // about to commit is the number they can see. It occupies its line in both
  // states, so nothing moves as it changes.
  const age = computeAge(
    assembleGamerDateOfBirth(Number(value.year), Number(value.month)),
    timeZone,
  );

  function handleSave() {
    if (!dirty || committing) return;
    setFailed(false);
    setCommitting(true);
    void updateProfile
      .mutateAsync({
        gamerId,
        edit: {
          dateOfBirth: assembleGamerDateOfBirth(
            Number(value.year),
            Number(value.month),
          ),
          gender: value.gender === "" ? null : value.gender,
        },
      })
      .then(() => {
        // The write landed and the cache already holds the row it returned, so
        // the controls can go back to mirroring the stored values.
        setDraft(null);
      })
      // Whatever the rejection carries says the same thing to the person in
      // front of it — the change did not take — and reading its `message` would
      // only put server-authored English on screen in every locale.
      .catch(() => setFailed(true))
      .finally(() => setCommitting(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Three across from `sm`: an admin surface is desktop-default, and
            three selects stacked down the middle of a wide page is the layout
            that rule exists to prevent. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("birthMonthLabel")} htmlFor="gamer-birth-month">
            <select
              id="gamer-birth-month"
              value={value.month}
              onChange={(e) => setDraft({ ...value, month: e.target.value })}
              disabled={committing}
              className={SELECT_CLASS}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("birthYearLabel")} htmlFor="gamer-birth-year">
            <select
              id="gamer-birth-year"
              value={value.year}
              onChange={(e) => setDraft({ ...value, year: e.target.value })}
              disabled={committing}
              className={SELECT_CLASS}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("genderLabel")} htmlFor="gamer-gender" optional>
            <select
              id="gamer-gender"
              value={value.gender}
              onChange={(e) =>
                setDraft({ ...value, gender: toGender(e.target.value) })
              }
              disabled={committing}
              className={SELECT_CLASS}
            >
              {/* "Not specified" is an answer the column holds as NULL, so it is
                  a listed option rather than an empty first slot standing for a
                  question nobody answered. */}
              <option value="">{t("genderUnset")}</option>
              {/* Straight off codegen, so a value added to the enum shows up
                  here without anybody remembering this list exists. */}
              {Constants.public.Enums.gender_type.map((g) => (
                <option key={g} value={g}>
                  {t(`gender.${g}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{t("ageYears", { age })}</p>
          {/* No success sentence: a save that lands leaves nothing left to save,
              and the button greying out under the cursor says so. Only a failure
              gets words, because it is the one outcome the controls cannot show
              on their own. */}
          <Button onClick={handleSave} disabled={!dirty || committing}>
            {committing ? c("saving") : c("save")}
          </Button>
        </div>

        {/* Below the row rather than above it: a sentence above would push the
            controls the admin just used down the page as it lands. What it does
            push is whatever sits below the card, and only ever because they just
            committed something here and it did not take. */}
        {failed && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {t("saveError")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Matches the styling of the other native selects in the codebase (the Add
 * Gamer form, the admin location dialog), aligned with `Input`'s height and
 * border so a row of them reads as one set of controls.
 */
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
