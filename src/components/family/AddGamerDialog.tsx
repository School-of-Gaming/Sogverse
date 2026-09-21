"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
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
import { ROUTES, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
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
 * Three pages, the same three for every parent: who the child is, then how they
 * sign in, then the optional game handles. The sign-in question used to ride
 * along at the bottom of page one and open a third page for the two modes that
 * need a credential; it is a page of its own now, so the footer's affirmative is
 * Next, then Next, then the create — nothing about it is decided by a radio.
 *
 * The game handles moved onto a page of their own when page one gained the
 * guardian declaration. Page one is where the child is named, and the
 * declaration is a sentence about a named child, so that is the only page it can
 * sit on — and page one could not carry a required box AND two optional rows
 * inside the dialog's height cap at 360px. The two rows are what gave way: both
 * are optional, a child who has neither is the ordinary case, and last is where
 * they already sat.
 */
type FormStep = "details" | "signIn" | "accounts";

/**
 * How the card can be seeded, which is the style guide's seam and nothing else.
 *
 * A union rather than three optional fields, because page two names the child:
 * production can only reach it through page one's validation, which guarantees
 * a first name, and this makes the same guarantee for a card that opens there.
 * Page three sits after page two and inherits the same guarantee, which is why
 * it asks for a name too even though nothing painted on it says one.
 */
type InitialState =
  | { step?: "details"; firstName?: string; signIn?: GamerSignIn }
  | { step: "signIn"; firstName: string; signIn?: GamerSignIn }
  | { step: "accounts"; firstName: string; signIn?: GamerSignIn };

/**
 * The stem every field id on this card is built from — both pages of it, and the
 * radio group's `name` with them. A named constant rather than a literal at the
 * call site because the literal-string lint reads JSX attributes and cannot tell
 * a DOM id apart from copy — and the honest fix for that is to stop spelling it
 * in the markup, not to silence the rule.
 *
 * It is the *default*, because the style guide renders four of these cards at
 * once: one stem for all four would mint four `add-gamer-first-name` labels
 * pointing at one input, and four radio groups sharing a `name`, which is a
 * browser-level fight over which of them may hold a selection.
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
 * The form asks for a first name, a birth month and year, an optional gender and
 * the parent's guardian declaration on page one, then how the child will sign in
 * on page two, then each platform's optional game handle on page three. The
 * default answer to the sign-in question is the switch-only account every gamer
 * used to get, so a parent who wants exactly what this dialog always produced
 * reads page two and presses Next.
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
        <StatusLine status="destructive">{t("genericError")}</StatusLine>
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
  idPrefix = CREDENTIAL_FIELD_ID_PREFIX,
}: {
  onCreate: (input: CreateGamerInput) => Promise<{ gamerId: string }>;
  onOpenChange: (open: boolean) => void;
  onCreated?: (gamerId: string) => void;
  className?: string;
  initial?: InitialState;
  /**
   * The stem for every field id and the radio group's `name`. The fourth seam of
   * the same kind as `className` and `initial`: production passes nothing and
   * keeps the ids it has always had, and a surface rendering more than one card
   * at once gives each its own stem so the labels and the radio group belong to
   * exactly one of them.
   */
  idPrefix?: string;
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
  // The parent's declaration about THIS child. Unticked to begin with for the
  // reason every consent box is: a box we ticked for them is a declaration
  // nobody made. It gates page one's Next rather than being checked on a press,
  // so the parent never submits a form the answer was going to refuse.
  const [guardianAttested, setGuardianAttested] = useState(false);
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
   * The card's title, which is the page's own question.
   *
   * Page two's title IS the question the radios answer, so it is also what
   * labels them: the `id` below is what the radio group points its
   * `aria-labelledby` at, and it is built off `idPrefix` for the same reason
   * every other id on this card is — the style guide paints five of these at
   * once, and five `add-gamer-title` nodes would leave four radio groups
   * labelled by a heading belonging to another card.
   */
  const titleId = `${idPrefix}-title`;

  /**
   * Page two's rule, as a gate on its Next rather than a refusal after it.
   *
   * Only *presence* is judged here — a username and a password, or an address —
   * because those are the answers the page is visibly asking for and a parent
   * can see for themselves whether they have given them. Whether what they
   * typed is long enough or shaped like an address is a different kind of
   * question: the parent has answered, and the answer is wrong in a way only a
   * sentence can explain. So the format checks stay on submit, where
   * `credentialProblem` can say which field is wrong and why, and a disabled
   * button never stands in for an explanation nobody can read.
   *
   * `parent` asks for nothing, so there is nothing to be missing.
   */
  const signInIncomplete =
    signIn === "username"
      ? username.trim() === "" || password.trim() === ""
      : signIn === "email"
        ? email.trim() === ""
        : false;

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
    // The declaration is the reason this call is allowed to be made, so it is
    // checked here and not only where the button is drawn. Page one's Next is
    // disabled until the box is ticked, which is what a parent meets; this is
    // what makes the state load-bearing rather than decorative, so no path that
    // reaches `create()` — a seam that opens the card on a later page, a future
    // caller — can send an attestation nobody made.
    if (!guardianAttested) return;

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
        // Narrowed to the literal the input type demands. `create()` returns
        // early unless the box is ticked, so by here the value is true as a
        // fact about the parent's answer rather than as a constant — and the
        // route's schema refuses anything else regardless.
        guardianAttested: true,
      });
      onCreated?.(result.gamerId);
      onOpenChange(false);
      // Intentionally not clearing `committing` — the dialog unmounts.
    } catch (caught) {
      setCommitting(false);
      // Two refusals a parent can actually fix, and both are about a value they
      // typed on the sign-in page: the address is spoken for, or the username
      // is. They land on the field rather than in the banner, because "try
      // again" over a form the parent cannot see the fault in is the unhelpful
      // version of the same message — which is why each of these also walks the
      // form back to the page the field is on. The create is pressed a page
      // later now, and a message pointing at an input that is not on screen
      // would be exactly the banner it exists to avoid being.
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code === GAMER_USERNAME_TAKEN) {
        setCredentialProblem({ field: "username", key: "usernameTaken" });
        setStep("signIn");
        return;
      }
      if (code === GAMER_EMAIL_TAKEN) {
        setCredentialProblem({ field: "email", key: "emailTaken" });
        setStep("signIn");
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

    if (step === "signIn") {
      const problem = findGamerCredentialProblem({ signIn, username, password, email });
      setCredentialProblem(problem);
      if (problem) return;
      setStep("accounts");
      return;
    }

    // Page three has nothing left to refuse: both game rows are optional and
    // commit themselves, and the box that gated page one's Next was ticked two
    // pages ago.
    await create();
  }

  // Matches the styling used by other selects in the codebase
  // (see admin/location-form-dialog.tsx). Aligned with Input's height/border
  // so the form reads as a single coherent column.
  /**
   * The two game identities, which are the whole of page three.
   *
   * Held as a node rather than written inline because they are rendered from
   * exactly one place and read better named: the page they are on carries
   * nothing else at all, so a `step === "accounts"` arm holding a hundred lines
   * of markup would bury the fact that the page IS these two rows.
   *
   * **Closed, not `autoEdit`.** A register page opens its row because typing a
   * name is the only thing there is to do there; here the pencil is the
   * invitation, and two open text inputs on a page whose whole message is "these
   * are optional" would read as two more things being asked. A closed row costs
   * exactly the same height — both modes declare the game-account height at the
   * same node — so this is a reading decision, not a fitting one.
   *
   * Full width rather than paired, because the editor has to hold a 60px figure,
   * an input and two buttons; half a dialog leaves the input too narrow to read
   * a 20-character handle back in.
   */
  const gameRows = (
    <>
      <Field label={g("label", { platform: GAME_PLATFORMS.minecraft.name })} optional>
        <GameUsernameEditableRow
          platform="minecraft"
          username={minecraftUsername}
          onCommit={({ username: committed }) => setMinecraftUsername(committed)}
        />
      </Field>

      <Field label={g("label", { platform: GAME_PLATFORMS.roblox.name })} optional>
        <GameUsernameEditableRow
          platform="roblox"
          username={robloxUsername}
          // Nothing to draw and nothing to go and find: a Roblox render is not
          // addressable by username, so the row shows its silhouette until a
          // commit resolves one.
          avatarUrl={null}
          onCommit={({ username: committed }) => setRobloxUsername(committed)}
        />
      </Field>
    </>
  );

  const selectClassName =
    "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <DialogContent
      className={cn("max-h-[90vh] overflow-y-auto sm:max-w-lg", className)}
    >
      {/* One title per page, each of them that page's own question: who this
          child is, then how they will sign in, then the game handles. The
          sign-in page used to repeat its question as a label over the radios
          while the title said "Add a gamer" a line above it — two headings for
          one page, and the lower of them the only one saying anything. */}
      {/* Left-aligned at every width, not the primitive's centred-on-phone
          default: on page two the title IS the radiogroup's label, and a
          centred two-line question above left-aligned radios reads as a page
          title rather than as the thing labelling them. */}
      <DialogHeader className="text-left">
        {/* `leading-snug` over the primitive's `leading-none`: a one-word title
            never wraps, and a question naming a child does — at 360px its
            wrapped lines collide on the tighter leading. */}
        <DialogTitle id={titleId} className="leading-snug">
          {step === "signIn"
            ? s("question", { name: trimmedName })
            : step === "accounts"
              ? t("accountsTitle", { name: trimmedName })
              : t("title")}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        {/* **The three pages swap; nothing crosses between them.** The title
            above and the footer below are the only nodes that survive a swap,
            and neither survives it unchanged: the title says something else,
            because it is the page's own question, and the footer moves, because
            no two of the pages are the same height. Both are the parent's own
            click swapping one panel for another (`src/CLAUDE.md`, "Layout &
            Scrolling") — a change they asked for and are braced for, not one on
            data's schedule — so the title rewriting itself in place is the same
            permitted move as the page beneath it being replaced, and reserving
            the tallest page's height behind the others would leave a hole
            rather than prevent a shift. Inside page two the answer is the
            opposite one, for the opposite reason — see the box below the
            radios. */}
        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "accounts" ? (
            gameRows
          ) : step === "signIn" ? (
            <>
              {/* **No label over the radios: the title is the label.** The
                  question is asked once, by the heading, and the group points
                  its `aria-labelledby` straight at it — so a screen reader
                  entering the group still hears the question, and the page
                  spends one line on it rather than two. The question names the
                  child rather than "your gamer": page one has already refused
                  an empty first name, so by the time this renders there is
                  always a name to use. */}
              <GamerSignInRadios
                value={signIn}
                onChange={setSignIn}
                disabled={committing}
                labelId={titleId}
                name={`${idPrefix}-sign-in`}
              />

              {/* **One height for all three answers, declared here.** Clicking
                  a radio swaps what is in this box while the radios above it
                  and the footer below it both survive the change — the case the
                  layout rule forbids moving — and it is also the case where
                  reserving is right rather than a hole: the slot is used by
                  whichever answer is selected, never held open beside content
                  it cannot coexist with. Without it, the footer jumps under the
                  thumb that just picked the radio.

                  The number is the tallest of the three: username, which is a
                  label, an input, a gap and the same again — 144px, measured at
                  360px where the dialog's padding leaves the box 278px wide.
                  The reservation is 148px: four pixels of slack, which cannot
                  buy a line either way and only exists so a rounding difference
                  cannot make the box *short*. Parent is 60px in the longest
                  locale and email 64px; both leave their slack at the bottom,
                  against the footer.

                  With the hints under these fields gone, nothing in the box
                  wraps any more, so the number is the same in all five locales
                  and at every width — it used to be French at 360px that set
                  it, and a wide dialog then carried ~36px of dead reserve.
                  Re-measure if a field is ever added back with a hint.

                  `min-h`, not `h`: a validation line arriving on the parent's
                  own submit may grow the box rather than be clipped by it. */}
              <div className="min-h-[9.25rem] space-y-4">
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
                    idPrefix={idPrefix}
                  />
                )}
              </div>
            </>
          ) : (
            <>
            <Field label={t("firstNameLabel")} htmlFor={`${idPrefix}-first-name`}>
              <Input
                id={`${idPrefix}-first-name`}
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
              <Field label={t("birthMonthLabel")} htmlFor={`${idPrefix}-month`}>
                <select
                  id={`${idPrefix}-month`}
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
              <Field label={t("birthYearLabel")} htmlFor={`${idPrefix}-year`}>
                <select
                  id={`${idPrefix}-year`}
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
                cost 96px of a dialog that has to fit a required consent row on a
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

            {/* **The guardian declaration**, last on the page and with no
                divider and no label above it: it is the final row of the same
                basic information the parent is already giving, and a rule would
                announce a second section that does not exist.

                One sentence and nothing else. No restating of the fields just
                filled in, because a list of what we store is a list that drifts
                the moment a column is added, and the Privacy Policy is where
                that list is kept current.

                It names the child, so it has to read as English before there is
                a name to use — the box renders while the first-name input is
                still empty. "This gamer" rather than a possessive dodge, because
                the row is pointing at the child described directly above it, and
                the word swaps to the real name on the first keystroke.

                No hint: per the `CheckboxRow` doc the absence of the optional
                marker IS the "required". The policy opens in a NEW TAB, as the
                register form's does — the parent is mid-way through a form, and
                in this tab the way back would be an empty one. A click landing
                on the link reads instead of ticking, which the DOM gives for
                free. */}
            <CheckboxRow
              checked={guardianAttested}
              onCheckedChange={setGuardianAttested}
              label={t.rich(
                trimmedName === ""
                  ? "guardianAttestationUnnamed"
                  : "guardianAttestation",
                {
                  name: trimmedName,
                  privacy: (chunks) => (
                    <Link
                      href={ROUTES.privacy}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-act hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                },
              )}
            />

            </>
          )}
        </div>

        {/* Two fixed labels over three pages, each decided by the page alone:
            the first two always advance and the last always creates, so the
            affirmative says what pressing it will do without any radio having to
            change it. Each of the first two pages additionally gates its own
            Next on what it asks for — page one on the declaration, page two on
            the credential its mode needs — and in both cases the button goes
            from disabled to enabled under the parent's own typing or tick while
            the label never changes, so nothing in the footer resizes. */}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (step === "accounts") {
                setStep("signIn");
              } else if (step === "signIn") {
                setStep("details");
              } else {
                onOpenChange(false);
              }
            }}
            disabled={committing}
          >
            {step === "details" ? c("cancel") : c("back")}
          </Button>
          <Button
            type="submit"
            disabled={
              committing ||
              (step === "details" && !guardianAttested) ||
              (step === "signIn" && signInIncomplete)
            }
          >
            {committing && <Loader2 className="animate-spin" />}
            {committing
              ? t("submitting")
              : step === "accounts"
                ? t("submit")
                : c("next")}
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
        "flex min-h-10 items-center justify-center rounded-md border border-border px-2 py-1.5 text-center text-xs font-medium leading-tight transition-colors hyphens-auto break-words sm:px-3 sm:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "bg-act text-act-foreground"
          : "bg-background hover:bg-hover hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
