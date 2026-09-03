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
  // Live before any render after the click, and cleared on every outcome: the
  // parent stays on this page whatever happens, and a second attempt after a
  // taken username is exactly what they will want to do.
  const [savingMode, setSavingMode] = useState(false);

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

  const handleSaveMode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingMode || !modeChanged) return;

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
                disabled={savingMode}
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
              disabled={savingMode}
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

          {modeOutcome === "saved" && (
            <p className="text-sm text-success">{t("saved")}</p>
          )}
          {modeOutcome === "failed" && (
            <p className="text-sm text-destructive">{t("saveFailed")}</p>
          )}

          <Button type="submit" disabled={!modeChanged || savingMode}>
            {savingMode ? c("saving") : c("saveChanges")}
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
      </CardContent>
    </Card>
  );
}
