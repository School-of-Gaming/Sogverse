"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Loader2, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useTimezone } from "@/providers";
import { useGamerProfile, useUpdateGamerProfile } from "@/services/gamers";
import {
  assembleGamerDateOfBirth,
  gamerBirthMonthOptions,
  gamerBirthYearOptionsIncluding,
  splitGamerDateOfBirth,
} from "@/lib/gamer-birth";
import { computeAge } from "@/lib/utils";
import { Constants, type GamerProfile, type GenderType } from "@/types";

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
 * The "11 years old · Boy" line under a gamer's name on their admin detail
 * page, with a pencil beside it that opens the editor.
 *
 * **Why an admin can write these at all:** the pair is chosen once, by a parent
 * filling in the Add Gamer form, and never asked about again — so a mistyped
 * year is a mistake nobody in the family can undo, and it is not cosmetic: age
 * is what places a child in a product's band. The database has always allowed
 * the fix (`gamer_profiles` carries a `FOR ALL` admin policy over `is_admin()`);
 * this is the surface that uses it.
 *
 * **A dialog rather than a card, and the line stays where it was.** These two
 * values are corrected once in an account's life, and a permanently-open card
 * of three selects spends a whole band of a page on that. The Game accounts
 * card below had to take the summary's Minecraft row with it because a card is
 * a second home the summary would go stale against; a dialog is not — it is the
 * *same* line's editor, reading and writing the values the line renders, so
 * there is nothing for the two to disagree about.
 *
 * **The RSC/client seam.** The page already reads the row to decide what to
 * render, so it hands it down as `initialProfile` and the query is seeded with
 * it: the first frame is complete, nothing arrives late, nothing moves. A save
 * rewrites the line underneath the dialog, which is the direct result of the
 * admin confirming it — the one kind of change the layout rule permits.
 */
export function GamerPersonalDetails({
  gamerId,
  initialProfile,
}: {
  gamerId: string;
  initialProfile: GamerProfile;
}) {
  const t = useTranslations("admin.users.gamerDetails");
  const timeZone = useTimezone();

  const { data } = useGamerProfile(gamerId, { initialData: initialProfile });
  // The seed makes this unconditional in practice; the fallback is what tells
  // the compiler so, without an assertion.
  const profile = data ?? initialProfile;

  const [editing, setEditing] = useState(false);
  // The form below owns the save, but the dialog's dismissal lives up here — so
  // the in-flight flag is a ref the form sets synchronously beside its own
  // `committing` state, rather than state lifted out of the form and threaded
  // back down. A ref is also what this reader needs: `onOpenChange` fires from
  // an Escape keypress or a backdrop click, outside React's render, and must
  // read the value as it is at that instant.
  const busyRef = useRef(false);

  // Every close the form itself asks for — a save that landed, or Cancel —
  // comes through here, which is also where the flag is put back so the next
  // opening starts dismissible.
  function close() {
    busyRef.current = false;
    setEditing(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          <span>
            {t("ageYears", { age: computeAge(profile.date_of_birth, timeZone) })}
          </span>
          {profile.gender && (
            <>
              {/* eslint-disable-next-line i18next/no-literal-string -- visual separator between two i18n strings, not user-facing copy */}
              <span aria-hidden="true"> · </span>
              <span>{t(`gender.${profile.gender}`)}</span>
            </>
          )}
        </p>
        {/* The row is left-packed, so a save that adds or clears the gender half
            does move this pencil. That is the permitted kind of shift: it is the
            direct result of the admin confirming the dialog they opened from
            here, not something arriving on data's own schedule. Nothing moves
            while they are merely reading the line. */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t("edit")}
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {/* `Dialog` renders nothing while closed, so the form below only mounts
          when it opens — which is what seeds its three controls from the row as
          it stands right now, every time, with no effect syncing them. */}
      <Dialog
        open={editing}
        // A save in flight owns the dialog until it resolves. Escape and a
        // backdrop click arrive here as `false` and would otherwise unmount the
        // form mid-write — with Cancel disabled, that is the one dismissal left
        // open, and it would leave a failure with nowhere to be reported and an
        // admin believing the correction landed.
        onOpenChange={(open) => {
          if (!open && busyRef.current) return;
          setEditing(open);
        }}
      >
        <GamerPersonalDetailsForm
          gamerId={gamerId}
          profile={profile}
          busyRef={busyRef}
          onClose={close}
        />
      </Dialog>
    </>
  );
}

/**
 * The dialog's body: birth month, birth year, gender, and a save.
 *
 * **Month granularity, not a date input.** The column is a full `date` but no
 * form in the product ever asks for the day — a parent picks a month and a year,
 * and the stored value is anchored to the 1st. An admin editing it picks the
 * same two, through the same enrollment year band, so a correction cannot
 * introduce a shape the create path could not have produced.
 */
function GamerPersonalDetailsForm({
  gamerId,
  profile,
  busyRef,
  onClose,
}: {
  gamerId: string;
  profile: GamerProfile;
  /** Set true for as long as a save is in flight; see the parent. */
  busyRef: RefObject<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("admin.users.gamerDetails");
  const c = useTranslations("common");
  const locale = useLocale();
  const timeZone = useTimezone();
  const updateProfile = useUpdateGamerProfile();

  /**
   * The stored date is split textually rather than parsed — a bare calendar
   * date has no instant to convert, and `new Date("2017-01-01")` read back
   * through the runtime's zone lands in December for any viewer west of UTC.
   */
  const stored = useMemo(
    () => splitGamerDateOfBirth(profile.date_of_birth),
    [profile.date_of_birth],
  );

  // Seeded once, because this component exists only while the dialog is open:
  // reopening it mounts a fresh form over whatever the row now holds.
  const [month, setMonth] = useState(String(stored.month));
  const [year, setYear] = useState(String(stored.year));
  // `""` is the gender's "not specified" — a real answer, stored as NULL.
  const [gender, setGender] = useState<GenderType | "">(profile.gender ?? "");

  // Per CLAUDE.md "Loading & Disabled State": live before any render after the
  // click. A save that lands closes the dialog, so the flag is deliberately
  // left set on that path and the unmount disposes of it; only a failure, which
  // leaves the admin standing in front of the form to retry, clears it.
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Today as the *viewer* reads it, which is the calendar the CHECK behind this
  // write is compared against from their side. The dialog is short-lived and
  // mounts only on the admin's click, so reading the clock here is a client-only
  // render with nothing to disagree with — the same shape `computeAge` uses for
  // the line this form edits.
  const today = useMemo(() => {
    const [todayYear, todayMonth] = formatInTimeZone(
      new Date(),
      timeZone,
      "yyyy-MM",
    )
      .split("-")
      .map(Number);
    return { year: todayYear, month: todayMonth };
  }, [timeZone]);

  // Clamped against the year beside it: with the current year selected, a month
  // after this one would assemble a future date the `date_of_birth <=
  // CURRENT_DATE` CHECK rejects, and the admin would get only the generic save
  // error back. Recomputed as the year changes, which is what the `year` dep is
  // for — the list is a function of both selects, not of the locale alone.
  const months = useMemo(
    () =>
      gamerBirthMonthOptions(locale, {
        selectedYear: Number(year),
        currentYear: today.year,
        currentMonth: today.month,
        stored,
      }),
    [locale, year, today, stored],
  );

  // The enrollment band, plus whatever year is actually stored — see
  // `gamerBirthYearOptionsIncluding`. A stored year the rolling window no longer
  // offers would otherwise render as an empty select and be saved as something
  // else the moment the gender beside it was touched.
  const years = useMemo(
    () => gamerBirthYearOptionsIncluding(stored.year),
    [stored.year],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (committing) return;
    setFailed(false);
    setCommitting(true);
    // Beside the state, not after it: the parent reads this from an Escape or a
    // backdrop click that can arrive before React has rendered anything.
    busyRef.current = true;
    void updateProfile
      .mutateAsync({
        gamerId,
        edit: {
          dateOfBirth: assembleGamerDateOfBirth(Number(year), Number(month)),
          gender: gender === "" ? null : gender,
        },
      })
      // No success sentence: the mutation seeds the profile cache with the row
      // it wrote, so closing reveals the line already restating the new values.
      .then(onClose)
      // Whatever the rejection carries says the same thing to the person in
      // front of it — the change did not take — and reading its `message` would
      // only put server-authored English on screen in every locale.
      .catch(() => {
        setFailed(true);
        setCommitting(false);
        busyRef.current = false;
      });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 py-4">
          {/* Paired across, matching the Add Gamer form these two values are
              first entered in, so a correction reads like the original. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("birthMonthLabel")} htmlFor="gamer-birth-month">
              <select
                id="gamer-birth-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
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
                value={year}
                onChange={(e) => setYear(e.target.value)}
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
          </div>

          <Field label={t("genderLabel")} htmlFor="gamer-gender" optional>
            <select
              id="gamer-gender"
              value={gender}
              onChange={(e) => setGender(toGender(e.target.value))}
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

          {/* Below the controls rather than above them: a sentence above would
              push the very selects the admin just used. It only ever appears
              after they pressed Save and it did not take. */}
          {failed && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {t("saveError")}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={committing}
          >
            {c("cancel")}
          </Button>
          <Button type="submit" disabled={committing}>
            {committing && <Loader2 className="animate-spin" />}
            {committing ? c("saving") : c("save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/**
 * Matches the styling of the other native selects in the codebase (the Add
 * Gamer form, the admin location dialog), aligned with `Input`'s height and
 * border so a row of them reads as one set of controls.
 */
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
