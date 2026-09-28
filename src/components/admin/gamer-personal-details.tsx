"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EditPencilButton } from "@/components/admin/edit-pencil-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTimezone } from "@/providers";
import { useGamerProfile, useUpdateGamerProfile } from "@/services/gamers";
import {
  adminUserEmailBody,
  adminUserUsernameBody,
  useProfile,
  useUpdateUserSignInAddress,
  USER_EMAIL_TAKEN,
  USER_USERNAME_TAKEN,
  type AdminUserSignInAddressBody,
} from "@/services/users";
import { ApiError } from "@/lib/api/api-error";
import {
  assembleGamerDateOfBirth,
  gamerBirthMonthOptions,
  gamerBirthYearOptionsIncluding,
  splitGamerDateOfBirth,
} from "@/lib/gamer-birth";
import {
  GAMER_USERNAME_MAX_LENGTH,
  gamerUsernameFromEmail,
} from "@/lib/gamer-sign-in";
import { computeAge } from "@/lib/utils";
import {
  Constants,
  type GamerProfile,
  type GenderType,
  type Profile,
} from "@/types";

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
 * page, with a pencil beside it that opens the editor — the one editor a
 * gamer's page has.
 *
 * **Why an admin can write these at all:** the pair is chosen once, by a parent
 * filling in the Add Gamer form, and never asked about again — so a mistyped
 * year is a mistake nobody in the family can undo, and it is not cosmetic: age
 * is what places a child in a product's band. The database has always allowed
 * the fix (`gamer_profiles` carries a `FOR ALL` admin policy over `is_admin()`);
 * this is the surface that uses it.
 *
 * **The dialog also edits what the child signs in with, where their mode has
 * one to edit**: the address of a child in `email` mode, the username of one in
 * `username` mode, and nothing for one in `parent` mode, whose address is a
 * handle nobody types. The mode itself is never changed here — that is the
 * parent's, where the mode and the credentials move together — and the route
 * behind the identifier refuses any pairing this dialog would not offer.
 *
 * **A dialog rather than a card, and the line stays where it was.** These
 * values are corrected once in an account's life, and a permanently-open card
 * of four controls spends a whole band of a page on that. The Game accounts
 * card below had to take the summary's Minecraft row with it because a card is
 * a second home the summary would go stale against; a dialog is not — it is the
 * *same* lines' editor, reading and writing the values they render, so there is
 * nothing for them to disagree about.
 *
 * **The RSC/client seam.** The page already reads both rows to decide what to
 * render, so it hands them down and the two queries are seeded with them: the
 * first frame is complete, nothing arrives late, nothing moves. A save rewrites
 * the lines underneath the dialog, which is the direct result of the admin
 * confirming it — the one kind of change the layout rule permits.
 */
export function GamerPersonalDetails({
  gamerId,
  initialProfile,
  initialAccount,
}: {
  gamerId: string;
  initialProfile: GamerProfile;
  /** The gamer's `profiles` row, whose address holds the sign-in identifier. */
  initialAccount: Profile;
}) {
  const t = useTranslations("admin.users.gamerDetails");
  const timeZone = useTimezone();

  const { data } = useGamerProfile(gamerId, { initialData: initialProfile });
  const { data: accountData } = useProfile(gamerId, {
    initialData: initialAccount,
  });
  // The seeds make these unconditional in practice; the fallbacks are what tell
  // the compiler so, without an assertion.
  const profile = data ?? initialProfile;
  const account = accountData ?? initialAccount;

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
        <EditPencilButton label={t("edit")} onClick={() => setEditing(true)} />
      </div>

      {/* `Dialog` renders nothing while closed, so the form below only mounts
          when it opens — which is what seeds its controls from the rows as they
          stand right now, every time, with no effect syncing them. */}
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
          account={account}
          busyRef={busyRef}
          onClose={close}
        />
      </Dialog>
    </>
  );
}

/** Which sign-in identifier the child's mode gives the dialog, if any. */
type IdentifierKind = "email" | "username";

function identifierKindOf(profile: GamerProfile): IdentifierKind | null {
  if (profile.sign_in === "email") return "email";
  if (profile.sign_in === "username") return "username";
  return null;
}

/** The identifier as it stands, in the form the field shows it. */
function currentIdentifier(kind: IdentifierKind, account: Profile): string {
  return kind === "email"
    ? account.email
    : (gamerUsernameFromEmail(account.email) ?? "");
}

/**
 * Which sentence the form is showing under its controls, if any. Each tells
 * the admin something different about what was and was not saved, so they are
 * distinct keys rather than one error with its detail filled in.
 *
 * - `invalid` / `taken` — the identifier was refused; nothing was saved.
 * - `identifierFailed` — its write failed for any other reason; nothing was saved.
 * - `detailsFailedAfterIdentifier` — the identifier landed, the birth date and
 *   gender did not.
 * - `detailsFailed` — only the birth date and gender were being saved, and did
 *   not take.
 */
type Problem =
  | "invalid"
  | "taken"
  | "identifierFailed"
  | "detailsFailedAfterIdentifier"
  | "detailsFailed";

/** Keys under `admin.users` for the problems that name the identifier. */
const IDENTIFIER_PROBLEM_KEYS = {
  email: {
    invalid: "emailEdit.invalid",
    taken: "emailEdit.taken",
    identifierFailed: "gamerDetails.emailSaveError",
    detailsFailedAfterIdentifier: "gamerDetails.emailSavedDetailsFailed",
  },
  username: {
    invalid: "gamerDetails.usernameInvalid",
    taken: "gamerDetails.usernameTaken",
    identifierFailed: "gamerDetails.usernameSaveError",
    detailsFailedAfterIdentifier: "gamerDetails.usernameSavedDetailsFailed",
  },
} as const satisfies Record<
  IdentifierKind,
  Record<Exclude<Problem, "detailsFailed">, string>
>;

function problemKey(problem: Problem, kind: IdentifierKind | null) {
  // Only `detailsFailed` can arise without an identifier on the form.
  if (problem === "detailsFailed" || kind === null) {
    return "gamerDetails.saveError";
  }
  return IDENTIFIER_PROBLEM_KEYS[kind][problem];
}

/** The refusals that mean the identifier already signs somebody else in. */
const TAKEN_CODES: ReadonlySet<string> = new Set([
  USER_EMAIL_TAKEN,
  USER_USERNAME_TAKEN,
]);

/**
 * The identifier edit to send: `null` when the value is unchanged, `"invalid"`
 * when it would not pass the route's schema.
 *
 * Unchanged is decided before anything is parsed — trimmed and folded to
 * lowercase, as both schemas normalise — so a value the admin never touched is
 * never judged, and never sent.
 */
function identifierEdit(
  kind: IdentifierKind,
  value: string,
  current: string,
): AdminUserSignInAddressBody | "invalid" | null {
  if (value.trim().toLowerCase() === current.toLowerCase()) return null;
  const parsed =
    kind === "email"
      ? adminUserEmailBody.safeParse({ email: value })
      : adminUserUsernameBody.safeParse({ username: value });
  return parsed.success ? parsed.data : "invalid";
}

/**
 * The dialog's body: the sign-in identifier where the child's mode has one,
 * birth month, birth year, gender, and one save.
 *
 * **Month granularity, not a date input.** The column is a full `date` but no
 * form in the product ever asks for the day — a parent picks a month and a year,
 * and the stored value is anchored to the 1st. An admin editing it picks the
 * same two, through the same enrollment year band, so a correction cannot
 * introduce a shape the create path could not have produced.
 *
 * **Two writes behind one Save, each sent only when its values changed, the
 * identifier first.** The identifier goes through the admin sign-in-address
 * route and the rest straight to `gamer_profiles`, so they cannot be one
 * transaction. The identifier leads because it is the one write that can be
 * refused for a reason the admin has to act on — a taken username — and a
 * refusal there leaves nothing saved, which is the easy thing to say. When it
 * lands and the second write fails, the dialog says exactly that and keeps
 * every field as typed; a retry resends only the details, because the
 * identifier's field now matches what is stored.
 */
function GamerPersonalDetailsForm({
  gamerId,
  profile,
  account,
  busyRef,
  onClose,
}: {
  gamerId: string;
  profile: GamerProfile;
  account: Profile;
  /** Set true for as long as a save is in flight; see the parent. */
  busyRef: RefObject<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("admin.users.gamerDetails");
  const u = useTranslations("admin.users");
  const c = useTranslations("common");
  const locale = useLocale();
  const timeZone = useTimezone();
  const updateProfile = useUpdateGamerProfile();
  const updateAddress = useUpdateUserSignInAddress();

  const kind = identifierKindOf(profile);
  // Read on every render rather than seeded: once an identifier write lands,
  // the refetched row is the new baseline, so a retry after a later failure
  // does not send it again.
  const storedIdentifier = kind ? currentIdentifier(kind, account) : "";

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
  // reopening it mounts a fresh form over whatever the rows now hold.
  const [identifier, setIdentifier] = useState(storedIdentifier);
  const [month, setMonth] = useState(String(stored.month));
  const [year, setYear] = useState(String(stored.year));
  // `""` is the gender's "not specified" — a real answer, stored as NULL.
  const [gender, setGender] = useState<GenderType | "">(profile.gender ?? "");

  // Per CLAUDE.md "Loading & Disabled State": live before any render after the
  // click. A save that lands closes the dialog, so the flag is deliberately
  // left set on that path and the unmount disposes of it; only a failure, which
  // leaves the admin standing in front of the form to retry, clears it.
  const [committing, setCommitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

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

  function fail(next: Problem) {
    setProblem(next);
    setCommitting(false);
    busyRef.current = false;
  }

  async function save(
    addressEdit: AdminUserSignInAddressBody | null,
    detailsChanged: boolean,
  ) {
    if (addressEdit) {
      try {
        // Resolves only once the refetched profile has landed, so the lines
        // under the dialog already read the new value when it closes.
        await updateAddress.mutateAsync({ userId: gamerId, edit: addressEdit });
      } catch (caught: unknown) {
        // The route's message is English for the log; only its code is read,
        // to tell the one refusal the admin can act on from everything else.
        fail(
          caught instanceof ApiError &&
            caught.code !== undefined &&
            TAKEN_CODES.has(caught.code)
            ? "taken"
            : "identifierFailed",
        );
        return;
      }
    }

    if (detailsChanged) {
      try {
        await updateProfile.mutateAsync({
          gamerId,
          edit: {
            dateOfBirth: assembleGamerDateOfBirth(Number(year), Number(month)),
            gender: gender === "" ? null : gender,
          },
        });
      } catch {
        // Whatever the rejection carries says the same thing to the person in
        // front of it — the change did not take — and reading its `message`
        // would only put server-authored English on screen in every locale.
        fail(addressEdit ? "detailsFailedAfterIdentifier" : "detailsFailed");
        return;
      }
    }

    // No success sentence: both writes refresh the queries the lines read, so
    // closing reveals them already restating the new values.
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (committing) return;

    const addressEdit = kind
      ? identifierEdit(kind, identifier, storedIdentifier)
      : null;
    if (addressEdit === "invalid") {
      setProblem("invalid");
      return;
    }
    const detailsChanged =
      Number(month) !== stored.month ||
      Number(year) !== stored.year ||
      gender !== (profile.gender ?? "");

    if (!addressEdit && !detailsChanged) {
      onClose();
      return;
    }

    setProblem(null);
    setCommitting(true);
    // Beside the state, not after it: the parent reads this from an Escape or a
    // backdrop click that can arrive before React has rendered anything.
    busyRef.current = true;
    void save(addressEdit, detailsChanged);
  }

  const identifierProblem = problem === "invalid" || problem === "taken";

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4 py-4">
          {kind === "email" && (
            <Field
              label={u("emailEdit.label")}
              htmlFor="gamer-email"
              hint={t("emailHint")}
            >
              {({ hintId }) => (
                <Input
                  id="gamer-email"
                  type="email"
                  autoComplete="off"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={committing}
                  aria-describedby={hintId}
                  aria-invalid={identifierProblem || undefined}
                />
              )}
            </Field>
          )}

          {kind === "username" && (
            <Field
              label={t("usernameLabel")}
              htmlFor="gamer-username"
              hint={t("usernameHint")}
            >
              {({ hintId }) => (
                <Input
                  id="gamer-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  // The bound belongs to the pattern that judges the value.
                  maxLength={GAMER_USERNAME_MAX_LENGTH}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={committing}
                  aria-describedby={hintId}
                  aria-invalid={identifierProblem || undefined}
                />
              )}
            </Field>
          )}

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
              push the very controls the admin just used. It only ever appears
              after they pressed Save and something did not take. */}
          {problem && (
            <Alert variant="destructive">
              <AlertDescription>
                {u(problemKey(problem, kind))}
              </AlertDescription>
            </Alert>
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
