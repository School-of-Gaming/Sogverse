"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GAME_PLATFORMS, GameUsernameEditableRow } from "@/components/game-account";
import {
  GAMER_EMAIL_TAKEN,
  GAMER_USERNAME_TAKEN,
  useCreateGamer,
} from "@/services/gamers";
import { usePinStatus, pinKeys } from "@/services/pin";
import { PinUnlockFlow } from "@/components/pin";
import { useRequiredAuth } from "@/providers/auth-provider";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { ApiError } from "@/lib/api/api-error";
import { normalizeGamerUsername } from "@/lib/gamer-sign-in";
import { cn } from "@/lib/utils";
import type { CreateGamerInput, GamerSignIn } from "@/types";
import { GamerSignInRadios } from "./gamer-sign-in-radios";
import {
  findGamerCredentialProblem,
  GamerCredentialFields,
  GAMER_PASSWORD_MIN_LENGTH,
  type GamerCredentialProblem,
} from "./gamer-credential-fields";
import {
  assembleGamerDateOfBirth,
  gamerBirthMonthOptions,
  gamerBirthYearOptions,
} from "@/lib/gamer-birth";

type Gender = "boy" | "girl" | "non_binary";

/**
 * Which page of the form is showing.
 *
 * Two pages, the same two for every parent: who the child is, then how they
 * sign in. The sign-in question used to ride along at the bottom of page one
 * and open a third page for the two modes that need a credential; it is a page
 * of its own now, so the footer's affirmative is always Next on page one and
 * always the create on page two — nothing about it is decided by a radio.
 */
type FormStep = "details" | "signIn";

/**
 * How the card can be seeded, which is the style guide's seam and nothing else.
 *
 * A union rather than three optional fields, because page two names the child:
 * production can only reach it through page one's validation, which guarantees
 * a first name, and this makes the same guarantee for a card that opens there.
 */
type InitialState =
  | { step?: "details"; firstName?: string; signIn?: GamerSignIn }
  | { step: "signIn"; firstName: string; signIn?: GamerSignIn };

/**
 * The stem every field id on the credential page is built from. A named constant
 * rather than a literal at the call site because the literal-string lint reads
 * JSX attributes and cannot tell a DOM id apart from copy — and the honest fix
 * for that is to stop spelling it in the markup, not to silence the rule.
 */
const CREDENTIAL_FIELD_ID_PREFIX = "add-gamer";

interface AddGamerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (gamerId: string) => void;
}

/**
 * Reusable dialog for creating a gamer linked to the current parent.
 *
 * The form asks for a first name, a birth month and year, an optional gender
 * and each platform's optional game handle on page one, then how the child will
 * sign in on page two. The default answer to the last one is the switch-only
 * account every gamer used to get, so a parent who wants exactly what this
 * dialog always produced reads page two and presses the button.
 *
 * Designed for reuse: family selector wires it now; product / club / camp /
 * event detail pages should pass `open` / `onOpenChange` to drop it in when a
 * parent without gamers tries to sign up.
 *
 * Adding a gamer requires an unlocked parent session, so this component is the
 * single chokepoint that enforces it: it never renders the form for a locked
 * session. Every call site gets the gate for free — see `AddGamerGate`.
 */
export function AddGamerDialog({ open, onOpenChange, onCreated }: AddGamerDialogProps) {
  if (!open) return null;
  return <AddGamerGate onOpenChange={onOpenChange} onCreated={onCreated} />;
}

/**
 * The PIN gate that fronts the form. Reaching the create-gamer API requires a
 * PIN-unlocked customer session (`requireRole("customer")`); discovering that
 * only on submit — after the parent fills the whole form — is the bad UX this
 * exists to prevent. So we resolve the session's PIN state up front and:
 *   - unlocked            → render the form.
 *   - locked, no PIN yet  → create-a-PIN pad, then the form.
 *   - locked, PIN set     → enter-PIN pad (+ forgot link), then the form.
 *
 * `unlocked` can't be read from the browser (HttpOnly cookie), so it comes from
 * `usePinStatus`. On a successful unlock the verify/setPin response has already
 * set the cookie, so the next create-gamer fetch carries it — no reload needed.
 * We seed the status cache so the view swaps to the form and a reopen stays
 * unlocked rather than re-prompting.
 */
function AddGamerGate({ onOpenChange, onCreated }: Omit<AddGamerDialogProps, "open">) {
  const queryClient = useQueryClient();
  const { data: status, isError } = usePinStatus();

  // Status in flight (or failed): show the dialog shell with a no-interaction
  // skeleton, so the form/pad simply appears in its final place when it lands
  // (no-layout-shift rule — a skeleton with nothing clickable constrains nothing).
  if (!status) {
    return (
      <GateShell onOpenChange={onOpenChange}>
        <GatePlaceholder error={isError} onClose={() => onOpenChange(false)} />
      </GateShell>
    );
  }

  if (status.unlocked) {
    return <AddGamerForm onOpenChange={onOpenChange} onCreated={onCreated} />;
  }

  return (
    <GateShell onOpenChange={onOpenChange}>
      <PinUnlockFlow
        pinIsSet={status.isSet}
        onUnlocked={() => {
          // Swap to the form now AND keep a reopen unlocked. setQueryData
          // re-renders this gate (status.unlocked → true), unmounting the pad —
          // which is what holds its disabled state through the swap.
          queryClient.setQueryData(pinKeys.status(), { isSet: true, unlocked: true });
        }}
      />
    </GateShell>
  );
}

/** Dialog shell for the pre-form states (loading + PIN pad), sized to the pad. */
function GateShell({
  onOpenChange,
  children,
}: {
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex justify-center px-2 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Loading spinner, or an error + close button if the status fetch failed. */
function GatePlaceholder({ error, onClose }: { error: boolean; onClose: () => void }) {
  const t = useTranslations("family.addGamerForm");
  const c = useTranslations("common");
  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-destructive">{t("genericError")}</p>
        <Button variant="outline" onClick={onClose}>
          {c("cancel")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[16rem] items-center justify-center" aria-hidden="true">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Resolves the two side effects from hooks and puts the card in a dialog. */
function AddGamerForm({
  onOpenChange,
  onCreated,
}: Omit<AddGamerDialogProps, "open">) {
  const { user } = useRequiredAuth();
  const createGamer = useCreateGamer();

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AddGamerFormCard
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        onCreate={(input) => createGamer.mutateAsync({ parentId: user.id, input })}
      />
    </Dialog>
  );
}

/**
 * The dialog's card — everything from the title to the footer — with its one
 * side effect as a prop rather than a hook.
 *
 * Split out for a single reason: the style guide has to be able to render this
 * exact card without a PIN-unlocked session and without a submit that really
 * creates a child. `onCreate` is the whole seam; production passes the mutation
 * and gets precisely what it had before, and a fixture surface passes something
 * inert. **The `<Dialog>` portal deliberately stays outside it**, because a
 * portal escapes to `document.body` — a demo that wants this card inside a
 * simulated phone viewport cannot use one, and the card is the part worth
 * looking at anyway.
 *
 * `className` merges into the card, so a caller measuring it inside a frame can
 * scope the height cap to that frame instead of the real viewport. Production
 * passes nothing and keeps the `90vh` cap.
 *
 * `initial` is the third seam of the same kind: the style guide shows the
 * sign-in page beside the details page, and driving a card there by simulating
 * a parent filling the first page in would make the demo a script rather than a
 * picture. Production passes nothing.
 */
export function AddGamerFormCard({
  onCreate,
  onOpenChange,
  onCreated,
  className,
  initial,
}: {
  onCreate: (input: CreateGamerInput) => Promise<{ gamerId: string }>;
  onOpenChange: (open: boolean) => void;
  onCreated?: (gamerId: string) => void;
  className?: string;
  initial?: InitialState;
}) {
  const t = useTranslations("family.addGamerForm");
  const s = useTranslations("gamerSignIn");
  const c = useTranslations("common");
  const g = useTranslations("gameAccount");
  const locale = useLocale();

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [gender, setGender] = useState<Gender | null>(null);
  // How the child will reach their own account, and which of the form's two
  // pages is showing. `parent` is the answer a parent keeps by reading page two
  // and pressing the button: the switch-only account every gamer used to get.
  const [signIn, setSignIn] = useState<GamerSignIn>(initial?.signIn ?? "parent");
  const [step, setStep] = useState<FormStep>(initial?.step ?? "details");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  // At most one credential field is wrong at a time — the validator stops at
  // the first, and a 409 names exactly one — so this is a single slot rather
  // than a map. Cleared on every edit of the field it belongs to would be
  // churn; it is cleared on the next submit, which is when it is re-decided.
  const [credentialProblem, setCredentialProblem] =
    useState<GamerCredentialProblem | null>(null);
  // Both game handles are optional and independent. Held as `string | null`
  // because that is what a commit reports — `null` is "cleared", not "untouched"
  // — and neither is ever sent as an empty string.
  const [minecraftUsername, setMinecraftUsername] = useState<string | null>(null);
  const [robloxUsername, setRobloxUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per CLAUDE.md "Loading & Disabled State": a local flag set BEFORE
  // mutate runs, only cleared on outcomes that need the user to retry.
  // On success we close the dialog so the unmount handles cleanup.
  const [committing, setCommitting] = useState(false);

  const years = useMemo(() => gamerBirthYearOptions(), []);

  // Unclamped: the year select here offers only the rolling enrollment band,
  // whose youngest year is six back, so no month it can be paired with is in
  // the future.
  const months = useMemo(() => gamerBirthMonthOptions(locale), [locale]);

  const trimmedName = firstName.trim();

  /**
   * Page one's rules. Unchanged from when they were the whole form, and they
   * run before the step to page two, so a parent never answers a question about
   * a child the first page was going to refuse anyway.
   */
  function findDetailsError(): string | null {
    if (trimmedName.length < DISPLAY_NAME_MIN) return t("firstNameTooShort");
    if (trimmedName.length > DISPLAY_NAME_MAX) return t("firstNameTooLong");
    if (!month) return t("birthMonthRequired");
    if (!year) return t("birthYearRequired");
    return null;
  }

  async function create() {
    setError(null);
    setCommitting(true);

    const dateOfBirth = assembleGamerDateOfBirth(Number(year), Number(month));

    try {
      const result = await onCreate({
        firstName: trimmedName,
        dateOfBirth,
        gender,
        // Omitted rather than sent as null: the create contract treats an absent
        // key as "no account given", and there is nothing to unlink on a child
        // who does not exist yet.
        minecraftUsername: minecraftUsername ?? undefined,
        robloxUsername: robloxUsername ?? undefined,
        signIn,
        // Each mode carries exactly its own fields and no others — the contract
        // refuses a password on an email-mode child and an address on a
        // username-mode one, and sending a stale value from a mode the parent
        // switched away from is the way that refusal would be hit.
        username: signIn === "username" ? normalizeGamerUsername(username) : undefined,
        password: signIn === "username" ? password : undefined,
        email: signIn === "email" ? email.trim() : undefined,
      });
      onCreated?.(result.gamerId);
      onOpenChange(false);
      // Intentionally not clearing `committing` — the dialog unmounts.
    } catch (caught) {
      setCommitting(false);
      // Two refusals a parent can actually fix, and both are about a value they
      // typed on this page: the address is spoken for, or the username is. They
      // land on the field rather than in the banner, because "try again" over a
      // form the parent cannot see the fault in is the unhelpful version of the
      // same message.
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code === GAMER_USERNAME_TAKEN) {
        setCredentialProblem({ field: "username", key: "usernameTaken" });
        return;
      }
      if (code === GAMER_EMAIL_TAKEN) {
        setCredentialProblem({ field: "email", key: "emailTaken" });
        return;
      }
      // The route's own `message` is raw English (for logs); never show it. No
      // other failure here is something the parent can act on, so they all get
      // the one localized generic.
      setError(t("genericError"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (committing) return;

    if (step === "details") {
      const detailsError = findDetailsError();
      if (detailsError) {
        setError(detailsError);
        return;
      }
      setError(null);
      setCredentialProblem(null);
      setStep("signIn");
      return;
    }

    const problem = findGamerCredentialProblem({ signIn, username, password, email });
    setCredentialProblem(problem);
    if (problem) return;

    await create();
  }

  // Matches the styling used by other selects in the codebase
  // (see admin/location-form-dialog.tsx). Aligned with Input's height/border
  // so the form reads as a single coherent column.
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <DialogContent
      className={cn("max-h-[90vh] overflow-y-auto sm:max-w-lg", className)}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        {/* **The two pages swap; nothing crosses between them.** The title
            above and the footer below are the only things that survive the
            swap, and the title does not move — the footer does, because the two
            pages are not the same height. That is a panel replaced by a
            different panel on the parent's own click (root `CLAUDE.md`,
            "Layout & Scrolling"): nothing a reader was pointing at is still on
            screen somewhere else, so there is nothing to hold still, and
            reserving page one's height behind page two would leave a hole
            rather than prevent a shift. Inside page two the answer is the
            opposite one, for the opposite reason — see the box below the
            radios. */}
        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === "signIn" ? (
            <>
              {/* The question names the child rather than "your gamer": page
                  one has already refused an empty first name, so by the time
                  this renders there is always a name to use. */}
              <Field label={s("question", { name: trimmedName })}>
                {({ labelId }) => (
                  <GamerSignInRadios
                    value={signIn}
                    onChange={setSignIn}
                    disabled={committing}
                    labelId={labelId}
                    name="add-gamer-sign-in"
                  />
                )}
              </Field>

              {/* **One height for all three answers, declared here.** Clicking
                  a radio swaps what is in this box while the radios above it
                  and the footer below it both survive the change — the case the
                  layout rule forbids moving — and it is also the case where
                  reserving is right rather than a hole: the slot is used by
                  whichever answer is selected, never held open beside content
                  it cannot coexist with. Without it, the footer jumps under the
                  thumb that just picked the radio.

                  The number is the tallest of the three: username, measured in
                  French — the widest hints — at 360px, where the dialog's
                  padding leaves the box 278px wide and both field hints wrap to
                  two lines. That comes to 244px, and the reservation is 248px:
                  four pixels of slack, which cannot buy a line either way and
                  only exists so a rounding difference cannot make the box
                  *short*. The same box in French on a desktop dialog is 212px,
                  so the widest layout carries ~36px of the reserve as slack; a
                  second value behind a breakpoint would buy that back and cost
                  a second number to keep true. Parent is 60px and email 122px,
                  and both leave their slack at the bottom, against the footer.

                  `min-h`, not `h`: a validation line arriving on the parent's
                  own submit may grow the box rather than be clipped by it. */}
              <div className="min-h-[15.5rem] space-y-4">
                {signIn === "parent" ? (
                  <p className="text-sm text-muted-foreground">
                    {s("parentModeNote", { name: trimmedName })}
                  </p>
                ) : (
                  <GamerCredentialFields
                    signIn={signIn}
                    username={username}
                    onUsernameChange={setUsername}
                    password={password}
                    onPasswordChange={setPassword}
                    email={email}
                    onEmailChange={setEmail}
                    disabled={committing}
                    problem={
                      credentialProblem
                        ? {
                            field: credentialProblem.field,
                            message: s(credentialProblem.key, {
                              count: GAMER_PASSWORD_MIN_LENGTH,
                            }),
                          }
                        : null
                    }
                    idPrefix={CREDENTIAL_FIELD_ID_PREFIX}
                    // The child does not exist yet and this dialog can be
                    // opened from anywhere, so "change it here later" would
                    // name a box that is about to close.
                    passwordChangeableFrom="gamerPage"
                  />
                )}
              </div>
            </>
          ) : (
            <>
            <Field label={t("firstNameLabel")} htmlFor="add-gamer-first-name">
              <Input
                id="add-gamer-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("firstNamePlaceholder")}
                disabled={committing}
                autoFocus
                autoComplete="off"
                required
                minLength={DISPLAY_NAME_MIN}
                maxLength={DISPLAY_NAME_MAX}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("birthMonthLabel")} htmlFor="add-gamer-month">
                <select
                  id="add-gamer-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  disabled={committing}
                  className={selectClassName}
                  required
                >
                  <option value="">{t("birthMonthPlaceholder")}</option>
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("birthYearLabel")} htmlFor="add-gamer-year">
                <select
                  id="add-gamer-year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={committing}
                  className={selectClassName}
                  required
                >
                  <option value="">{t("birthYearPlaceholder")}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Three across at every width, not stacked below `sm`. The stack
                cost 96px of a dialog that now also has to fit two game rows on a
                phone — the single biggest lever available, and this is what it is
                spent on.

                A third of a 360px phone is 88px, which no locale's "non-binary"
                fits on one line at `text-sm`, so the buttons below wrap instead of
                overflowing and grow past 40px when they do. That is the price, and
                it is roughly 4px against the 96px saved. */}
            <Field label={t("genderLabel")} optional>
              <div className="grid grid-cols-3 gap-2">
                <GenderButton
                  selected={gender === "boy"}
                  disabled={committing}
                  onClick={() => setGender(gender === "boy" ? null : "boy")}
                  label={t("genderBoy")}
                />
                <GenderButton
                  selected={gender === "girl"}
                  disabled={committing}
                  onClick={() => setGender(gender === "girl" ? null : "girl")}
                  label={t("genderGirl")}
                />
                <GenderButton
                  selected={gender === "non_binary"}
                  disabled={committing}
                  onClick={() => setGender(gender === "non_binary" ? null : "non_binary")}
                  label={t("genderNonBinary")}
                />
              </div>
            </Field>

            {/* The two game identities, last because they are the two a parent is
                most likely to skip — and because a child who has neither yet is
                the ordinary case.

                **Closed, not `autoEdit`.** A register page opens its row because
                typing a name is the only thing there is to do there; here the row
                sits among four fields the parent must fill in, and two more open
                text inputs would read as two more things being asked of them. A
                closed row costs exactly the same height — both modes declare the
                game-account height at the same node — so this is a reading
                decision, not a fitting one, and the pencil is the invitation.

                Full width rather than paired, because the editor has to hold a
                60px figure, an input and two buttons; half a dialog leaves the
                input too narrow to read a 20-character handle back in. */}
            <Field label={g("label", { platform: GAME_PLATFORMS.minecraft.name })} optional>
              <GameUsernameEditableRow
                platform="minecraft"
                username={minecraftUsername}
                onCommit={({ username }) => setMinecraftUsername(username)}
              />
            </Field>

            <Field label={g("label", { platform: GAME_PLATFORMS.roblox.name })} optional>
              <GameUsernameEditableRow
                platform="roblox"
                username={robloxUsername}
                // Nothing to draw and nothing to go and find: a Roblox render is
                // not addressable by username, so the row shows its silhouette
                // until a commit resolves one.
                avatarUrl={null}
                onCommit={({ username }) => setRobloxUsername(username)}
              />
            </Field>

            </>
          )}
        </div>

        {/* Two fixed labels, one per page, decided by the page alone: page one
            always advances and page two always creates, so the affirmative says
            what pressing it will do without any radio having to change it. */}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              step === "signIn" ? setStep("details") : onOpenChange(false)
            }
            disabled={committing}
          >
            {step === "signIn" ? c("back") : c("cancel")}
          </Button>
          <Button type="submit" disabled={committing}>
            {committing && <Loader2 className="animate-spin" />}
            {committing
              ? t("submitting")
              : step === "details"
                ? c("next")
                : t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function GenderButton({
  selected,
  disabled,
  onClick,
  label,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        // `min-h-10`, not `h-10`: three across on a 360px phone leaves ~72px of
        // text width per button, and every locale's "non-binary" is wider than
        // that. A fixed height would push the second line straight out of the
        // button; this lets the row grow the few pixels it needs instead.
        // Hyphenation first (the document carries the locale's `lang`, so a
        // browser that can hyphenate does it properly), a hard word break only
        // as the fallback.
        "flex min-h-10 items-center justify-center rounded-md border px-2 py-1.5 text-center text-xs font-medium leading-tight transition-colors hyphens-auto break-words sm:px-3 sm:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
  );
}
