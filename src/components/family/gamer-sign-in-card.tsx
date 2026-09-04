"use client";

import { useState } from "react";
import { KeyRound, MailCheck, MailX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api/api-error";
import { gamerUsernameFromEmail, normalizeGamerUsername } from "@/lib/gamer-sign-in";
import {
  GAMER_EMAIL_TAKEN,
  GAMER_USERNAME_TAKEN,
  useSendGamerVerificationEmail,
  useUpdateGamer,
} from "@/services/gamers";
import type { GamerSignIn } from "@/types";
import { GamerSignInRadios } from "./gamer-sign-in-radios";
import {
  findGamerCredentialProblem,
  findGamerEmailProblem,
  findGamerUsernameProblem,
  GamerCredentialFields,
  GAMER_PASSWORD_MIN_LENGTH,
  type GamerCredentialProblem,
} from "./gamer-credential-fields";

/**
 * The stem the credential fields' ids are built from. A constant rather than a
 * literal in the markup: the literal-string lint reads JSX attributes and cannot
 * tell a DOM id from copy, and moving the string out is the honest answer.
 */
const CREDENTIAL_FIELD_ID_PREFIX = "gamer-mode";

/**
 * A parent changing how one of their children signs in.
 *
 * **Three writes live here and each is its own submit**, because they are three
 * different decisions and only one of them is reversible by doing it again: the
 * mode change (which mints or destroys a credential), a new password for a
 * username-mode child, and a re-send of the verification mail. A card that saved
 * on every radio click would move a child between account shapes as the parent
 * read the options.
 *
 * **What the card can *show* is decided before it renders.** Its heading line,
 * which rows exist and which affordance sits under them all follow from the
 * mode, which the page has in hand before it paints — so nothing here arrives
 * late and nothing under it moves. What the parent's own clicks reveal (the new
 * mode's fields, an outcome sentence) is theirs to have caused.
 */
export function GamerSignInCard({
  gamerId,
  firstName,
  signIn,
  email,
  emailVerifiedAt,
}: {
  gamerId: string;
  firstName: string;
  /** The stored mode — what this child's account is, right now. */
  signIn: GamerSignIn;
  /** The account's stored address: a mailbox in `email` mode, a handle otherwise. */
  email: string | null;
  /** When the child confirmed the address from their own inbox, or null. */
  emailVerifiedAt: string | null;
}) {
  const t = useTranslations("parent.gamerDetail.signIn");
  const s = useTranslations("gamerSignIn");
  const c = useTranslations("common");
  const updateGamer = useUpdateGamer();
  const sendVerification = useSendGamerVerificationEmail();

  // The mode the parent is *considering*. It starts as the stored one, so the
  // card opens saying what is true rather than proposing anything.
  const [draft, setDraft] = useState<GamerSignIn>(signIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [problem, setProblem] = useState<GamerCredentialProblem | null>(null);
  const [modeOutcome, setModeOutcome] = useState<"saved" | "failed" | null>(null);
  // Live before any render after the click, and cleared on every *failure*: the
  // parent stays on this page whatever happens, and a second attempt after a
  // taken username is exactly what they will want to do.
  const [savingMode, setSavingMode] = useState(false);
  /**
   * The mode a save has already written, held until the prop says so.
   *
   * The request resolving is not the end of the click. `signIn` is a prop off a
   * query the mutation invalidated, so for one round trip after a successful
   * save the card is still drawn around the *old* mode: the fields are on
   * screen, cleared, and the button would be live again — a second click would
   * validate three empty strings and tell the parent their own username is
   * required. Holding this until `signIn` catches up is what carries the
   * disabled state through to the redraw the click actually caused (root
   * `CLAUDE.md`, "Loading & Disabled State").
   */
  const [committedMode, setCommittedMode] = useState<GamerSignIn | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [passwordOutcome, setPasswordOutcome] = useState<
    "saved" | "tooShort" | "failed" | null
  >(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [resendOutcome, setResendOutcome] = useState<
    "sent" | "rateLimited" | "failed" | null
  >(null);
  const [resending, setResending] = useState(false);

  const currentUsername =
    signIn === "username" ? gamerUsernameFromEmail(email) : null;
  const modeChanged = draft !== signIn;
  /** Written, not yet redrawn — see `committedMode`. */
  const awaitingModeRefetch = committedMode !== null && committedMode !== signIn;
  /** One flag for the whole click, from the submit to the prop that answers it. */
  const modeBusy = savingMode || awaitingModeRefetch;

  const handleSaveMode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modeBusy || !modeChanged) return;

    const found = findGamerCredentialProblem({
      signIn: draft,
      username,
      password,
      email: newEmail,
    });
    setProblem(found);
    if (found) return;

    setModeOutcome(null);
    setSavingMode(true);
    try {
      await updateGamer.mutateAsync({
        gamerId,
        updates: {
          signIn: draft,
          // Exactly the fields the target mode takes, and never a leftover from
          // a mode the parent passed through on the way here — the route
          // refuses the mismatched pair, and this is what keeps it from ever
          // seeing one.
          username: draft === "username" ? normalizeGamerUsername(username) : undefined,
          password: draft === "username" ? password : undefined,
          email: draft === "email" ? newEmail.trim() : undefined,
        },
      });
      // The mutation invalidates the reads this page renders from, so the mode
      // that arrives back is what the card redraws around; the fields the parent
      // typed into are cleared with it because they belong to a change that has
      // now happened.
      setUsername("");
      setPassword("");
      setNewEmail("");
      setModeOutcome("saved");
      setCommittedMode(draft);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code === GAMER_USERNAME_TAKEN) {
        setProblem({ field: "username", key: "usernameTaken" });
      } else if (code === GAMER_EMAIL_TAKEN) {
        setProblem({ field: "email", key: "emailTaken" });
      } else {
        setModeOutcome("failed");
      }
    } finally {
      setSavingMode(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPassword) return;
    if (newPassword.length < GAMER_PASSWORD_MIN_LENGTH) {
      setPasswordOutcome("tooShort");
      return;
    }
    setPasswordOutcome(null);
    setSavingPassword(true);
    try {
      await updateGamer.mutateAsync({ gamerId, updates: { password: newPassword } });
      setNewPassword("");
      setPasswordOutcome("saved");
    } catch {
      setPasswordOutcome("failed");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResend = () => {
    setResending(true);
    setResendOutcome(null);
    sendVerification.mutate(gamerId, {
      onSuccess: () => {
        setResendOutcome("sent");
        setResending(false);
      },
      onError: (caught) => {
        // The per-gamer allowance, spent. It gets its own sentence because "try
        // again" is the wrong advice for somebody who has already tried six
        // times — the same three-outcome shape the settings page uses.
        setResendOutcome(
          caught instanceof ApiError && caught.status === 429
            ? "rateLimited"
            : "failed",
        );
        setResending(false);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        {/* The heading line states what is true today, in the same words the
            options below use, so a parent can tell at a glance which row they
            are already on. */}
        <CardDescription>
          {signIn === "username" && currentUsername
            ? t("currentUsername", { name: firstName, username: currentUsername })
            : t(`current.${signIn}`, { name: firstName })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={handleSaveMode} className="space-y-4">
          <Field label={s("question", { name: firstName })}>
            {({ labelId }) => (
              <GamerSignInRadios
                value={draft}
                onChange={(mode) => {
                  setDraft(mode);
                  setProblem(null);
                  setModeOutcome(null);
                }}
                disabled={modeBusy}
                labelId={labelId}
                name="gamer-sign-in-mode"
              />
            )}
          </Field>

          {/* Only for a mode the parent is moving *to*. Staying put asks for
              nothing, and the two standing affordances below — a new password,
              a re-sent verification mail — are what the current mode offers. */}
          {modeChanged && (
            <GamerCredentialFields
              signIn={draft}
              username={username}
              onUsernameChange={setUsername}
              password={password}
              onPasswordChange={setPassword}
              email={newEmail}
              onEmailChange={setNewEmail}
              disabled={modeBusy}
              problem={
                problem
                  ? {
                      field: problem.field,
                      message: s(problem.key, { count: GAMER_PASSWORD_MIN_LENGTH }),
                    }
                  : null
              }
              idPrefix={CREDENTIAL_FIELD_ID_PREFIX}
            />
          )}

          {/* Not while the write is still settling: the card is drawn around
              the old mode until the prop lands, so a "Saved" line beside a
              button that still says "Saving…" would be two answers to one
              click. It appears with the redraw that makes it true. */}
          {modeOutcome === "saved" && !awaitingModeRefetch && (
            <p className="text-sm text-success">{t("saved")}</p>
          )}
          {modeOutcome === "failed" && (
            <p className="text-sm text-destructive">{t("saveFailed")}</p>
          )}

          <Button type="submit" disabled={!modeChanged || modeBusy}>
            {modeBusy ? c("saving") : c("saveChanges")}
          </Button>
        </form>

        {/* A parent resetting a password their child has forgotten. It is a
            standing affordance rather than something revealed by a mode change:
            the mode is not changing, and this is the only way that password can
            be replaced — the child has no mailbox to send a reset link to. */}
        {signIn === "username" && !modeChanged && (
          <form onSubmit={handleSetPassword} className="space-y-4 border-t pt-6">
            <div className="space-y-1">
              <h2 className="font-medium">{t("newPasswordTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("newPasswordDescription", { name: firstName })}
              </p>
            </div>
            <Field
              label={c("newPassword")}
              htmlFor="gamer-new-password"
              hint={s("passwordHint", { count: GAMER_PASSWORD_MIN_LENGTH })}
            >
              {({ hintId }) => (
                <PasswordInput
                  id="gamer-new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPassword}
                  defaultVisible
                  autoComplete="new-password"
                  aria-describedby={hintId}
                />
              )}
            </Field>
            {passwordOutcome === "tooShort" && (
              <p className="text-sm text-destructive">
                {s("passwordTooShort", { count: GAMER_PASSWORD_MIN_LENGTH })}
              </p>
            )}
            {passwordOutcome === "saved" && (
              <p className="text-sm text-success">{t("newPasswordSaved")}</p>
            )}
            {passwordOutcome === "failed" && (
              <p className="text-sm text-destructive">{t("saveFailed")}</p>
            )}
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? c("saving") : t("newPasswordSubmit")}
            </Button>
          </form>
        )}

        {signIn === "username" && !modeChanged && (
          <ChangeIdentifierForm
            field="username"
            gamerId={gamerId}
            firstName={firstName}
            currentValue={currentUsername ?? ""}
          />
        )}

        {/* The address, its state, and the one action either state allows. The
            state is a fact about a mailbox the parent does not read, so it is
            stated in words rather than left to be inferred from the presence of
            a button. */}
        {signIn === "email" && !modeChanged && (
          <div className="space-y-4 border-t pt-6">
            <Field label={c("email")}>
              <Input value={email ?? ""} disabled className="bg-muted" />
            </Field>
            {emailVerifiedAt ? (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <MailCheck className="h-4 w-4 shrink-0" aria-hidden />
                {t("verified")}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-warning">
                <MailX className="h-4 w-4 shrink-0" aria-hidden />
                {t("notVerified", { name: firstName })}
              </p>
            )}
            <Button variant="outline" onClick={handleResend} disabled={resending}>
              {resending ? c("sending") : t("resend")}
            </Button>
            {resendOutcome === "sent" && (
              <p className="text-sm text-success">
                {t("resendSent", { name: firstName })}
              </p>
            )}
            {/* Warning rather than destructive: nothing broke and the wait is
                short, but no mail went out, so it cannot read as success. */}
            {resendOutcome === "rateLimited" && (
              <p className="text-sm text-warning">{t("resendRateLimited")}</p>
            )}
            {resendOutcome === "failed" && (
              <p className="text-sm text-destructive">{t("resendFailed")}</p>
            )}
          </div>
        )}

        {signIn === "email" && !modeChanged && (
          <ChangeIdentifierForm
            field="email"
            gamerId={gamerId}
            firstName={firstName}
            currentValue={email ?? ""}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Replacing the one value a child's current mode is addressed by: their username
 * or their mailbox.
 *
 * **One component for both, because they are one thing.** Each is a single text
 * field carrying the account's whole identity in its mode, each is written by
 * sending that field alone (the route reads the stored mode and takes it), each
 * has exactly one refusal the parent can act on — the value is already spoken
 * for — and each is the only way out of a mistyped one. Two copies of that would
 * be two places for the 409 mapping to drift.
 *
 * **Standing and open, not behind a disclosure**, matching the new-password form
 * above it: these are the affordances a parent comes to this card *for*, and a
 * value that cannot be corrected without first finding a button to press is the
 * gap this closed.
 *
 * **The field starts empty with the current value as its placeholder.** Prefilled
 * text would have the parent editing a string in place, which is how a one-
 * character slip becomes a silent overwrite; empty means every save is a value
 * somebody typed on purpose, and the placeholder still says what is there now.
 */
function ChangeIdentifierForm({
  field,
  gamerId,
  firstName,
  currentValue,
}: {
  field: "username" | "email";
  gamerId: string;
  firstName: string;
  /** What the account holds today — shown as the placeholder, never as a value. */
  currentValue: string;
}) {
  const t = useTranslations("parent.gamerDetail.signIn");
  const s = useTranslations("gamerSignIn");
  const c = useTranslations("common");
  const updateGamer = useUpdateGamer();

  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<GamerCredentialProblem | null>(null);
  const [outcome, setOutcome] = useState<"saved" | "failed" | null>(null);
  // Live before any render after the click, cleared on every *failure*: the
  // parent stays on this card whatever happens, and a second attempt after a
  // taken value is exactly what they will want to do.
  const [saving, setSaving] = useState(false);
  /**
   * The value a save has already written, held until `currentValue` says so.
   *
   * Same window the mode form has: the request resolving leaves the field
   * cleared and the placeholder still showing the *old* value, for as long as
   * the invalidated read takes to come back. A button live in that window
   * validates an empty string and tells the parent a username is required.
   */
  const [committedValue, setCommittedValue] = useState<string | null>(null);

  const isUsername = field === "username";
  const inputId = isUsername ? "gamer-change-username" : "gamer-change-email";
  /**
   * Written, not yet redrawn — see `committedValue`. Compared case-insensitively
   * because the address that comes back is the one GoTrue stored, which is
   * folded; a case-sensitive test would leave the form disabled forever the
   * first time a parent typed a capital letter.
   */
  const awaitingRefetch =
    committedValue !== null &&
    committedValue.toLowerCase() !== currentValue.toLowerCase();
  /** One flag for the whole click, from the submit to the prop that answers it. */
  const busy = saving || awaitingRefetch;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const found = isUsername
      ? findGamerUsernameProblem(value)
      : findGamerEmailProblem(value);
    setProblem(found);
    if (found) return;

    setOutcome(null);
    setSaving(true);
    try {
      // One key, and only the one this mode is addressed by. The route reads the
      // account's stored mode and refuses the other, so sending both would be
      // sending one it is going to reject.
      const written = isUsername
        ? normalizeGamerUsername(value)
        : value.trim();
      await updateGamer.mutateAsync({
        gamerId,
        updates: isUsername ? { username: written } : { email: written },
      });
      // The mutation invalidates the reads the card is drawn from, so the new
      // value — and, for an address, the verification state the write cleared —
      // arrive as a redraw rather than as something this form has to restate.
      setValue("");
      setOutcome("saved");
      setCommittedValue(written);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code === GAMER_USERNAME_TAKEN) {
        setProblem({ field: "username", key: "usernameTaken" });
      } else if (code === GAMER_EMAIL_TAKEN) {
        setProblem({ field: "email", key: "emailTaken" });
      } else {
        setOutcome("failed");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        <h2 className="font-medium">{t(`change.${field}.title`)}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`change.${field}.description`, { name: firstName })}
        </p>
      </div>
      <Field
        label={isUsername ? s("usernameLabel") : c("email")}
        htmlFor={inputId}
        hint={isUsername ? s("usernameHint") : s("emailHint")}
      >
        {({ hintId }) => (
          <Input
            id={inputId}
            type={isUsername ? "text" : "email"}
            value={value}
            // Folded on the way in for a username, so what the parent reads back
            // to their child is the string the account will actually hold.
            onChange={(event) =>
              setValue(
                isUsername
                  ? normalizeGamerUsername(event.target.value)
                  : event.target.value,
              )
            }
            placeholder={currentValue}
            disabled={busy}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={isUsername ? 20 : undefined}
            aria-describedby={hintId}
            aria-invalid={problem !== null || undefined}
          />
        )}
      </Field>
      {problem && (
        <p className="text-sm text-destructive">
          {s(problem.key, { count: GAMER_PASSWORD_MIN_LENGTH })}
        </p>
      )}
      {/* Held back until the new value is the one the placeholder shows — the
          same reasoning as the mode form's line above. */}
      {outcome === "saved" && !awaitingRefetch && (
        <p className="text-sm text-success">{t(`change.${field}.saved`)}</p>
      )}
      {outcome === "failed" && (
        <p className="text-sm text-destructive">{t("saveFailed")}</p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? c("saving") : t(`change.${field}.submit`)}
      </Button>
    </form>
  );
}
