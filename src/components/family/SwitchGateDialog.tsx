"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { PinPad, usePinField } from "@/components/pin";
import {
  SwitchAccountError,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_REQUIRED,
  SWITCH_PASSWORD_INVALID,
  SWITCH_PASSWORD_REQUIRED,
  type FamilyMember,
  type SwitchAccountCredentials,
} from "@/services/family";

/** Which credential this gate collects. Chosen by `switchGateFor`, never here. */
export type SwitchGateMode = "pin" | "password";

interface SwitchGateBodyProps {
  /** The account being switched into — named in the copy, never a source of truth. */
  target: FamilyMember;
  mode: SwitchGateMode;
  /**
   * Set synchronously before the commit and cleared only on a failure the
   * reader has to retry. Controlled by the host so the host can refuse to close
   * mid-flight; the body would otherwise be the only thing that knows.
   */
  committing: boolean;
  onCommittingChange: (committing: boolean) => void;
  /**
   * Hands the collected credential to `commitAccountSwitch`. Returns its
   * promise: success never resolves into a rendered frame (the document is
   * already navigating), and failure arrives as a `SwitchAccountError` whose
   * code decides what this body does next.
   */
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
  /** Cancel / Close. Never called while committing — the buttons are disabled. */
  onClose: () => void;
  /**
   * Opens straight on the no-PIN message instead of the pad.
   *
   * The one seam this body has, and it exists for the style guide: that state is
   * otherwise reachable only by typing four digits into a box, so a reader
   * comparing the gate's states would have to be *told* what the fourth box
   * becomes rather than shown it. Production passes nothing — the state is the
   * route's answer to a commit, never a caller's opinion.
   */
  initialPinNotSet?: boolean;
}

/**
 * The credential a child pays to leave their own account, collected in the
 * shape the route will accept.
 *
 * Which credential is not this component's decision — `switchGateFor` makes it
 * from the viewer's role and their session's provenance, and hands the answer
 * down as `mode`. What lives here is the collection and the three ways it can
 * end: the switch lands (and the page unloads underneath us), the value was
 * wrong (retry, in place), or the family holds no PIN at all — which no amount
 * of careful typing fixes, so the body stops being a prompt and becomes a
 * message.
 *
 * **A failure never navigates.** The route guarantees a refused gate leaves the
 * caller's session untouched, and the UI has to match that promise: a wrong PIN
 * shakes and clears, a wrong password says so, and the child stays exactly where
 * they were.
 *
 * **There is no "forgot PIN" escape here.** That route is customer-gated, so a
 * child could not complete it; the way out of a family with a forgotten PIN is
 * to sign out and sign in as the parent.
 *
 * Rendered inside a `DialogContent` the caller owns — as its whole content
 * (`SwitchGateDialog`) or as the second step of a confirm dialog that decided a
 * gate applies. Sharing the body rather than opening a second dialog is what
 * keeps the confirm→gate transition from flashing a backdrop.
 */
export function SwitchGateBody({
  target,
  mode,
  committing,
  onCommittingChange,
  onCommit,
  onClose,
  initialPinNotSet = false,
}: SwitchGateBodyProps) {
  const t = useTranslations("family");
  const c = useTranslations("common");
  const pin = usePinField();
  const passwordId = useId();
  const [password, setPassword] = useState("");
  /**
   * The one terminal state: nobody in this family holds a PIN. Reached only
   * from the route's own answer, because a gamer session cannot ask the
   * question — `pin_is_set()` is `auth.uid()`-scoped and would answer about the
   * child (see `src/services/pin/CLAUDE.md`).
   */
  const [pinNotSet, setPinNotSet] = useState(initialPinNotSet);
  const [error, setError] = useState<string | null>(null);

  /** The code on a refusal, or undefined for anything that is not one. */
  function codeOf(err: unknown) {
    return err instanceof SwitchAccountError ? err.code : undefined;
  }

  /** The reader gets a translated line; the server's English goes to the console. */
  function reportUnexpected(err: unknown) {
    console.error("[switch-gate] account switch failed:", err);
    return t("switchFailed");
  }

  async function handlePin(entered: string) {
    pin.setBusy(true);
    onCommittingChange(true);
    setError(null);
    try {
      await onCommit({ pin: entered });
      // Both flags stay set: the promise resolves into a document that is
      // already unloading, and a pad that re-enabled here could fire twice.
      return;
    } catch (err) {
      onCommittingChange(false);
      const code = codeOf(err);
      if (code === SWITCH_PIN_NOT_SET) {
        // The pad is about to unmount, so its busy flag is left set on purpose.
        setPinNotSet(true);
        return;
      }
      if (code !== SWITCH_PIN_INVALID && code !== SWITCH_PIN_REQUIRED) {
        setError(reportUnexpected(err));
      }
      // A wrong PIN is the pad's own language: flash, shake, clear, retry. No
      // error text — the same convention every other PIN screen keeps.
      pin.reject();
    }
  }

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (committing) return;
    onCommittingChange(true);
    setError(null);
    try {
      await onCommit({ password });
      // Left set through the unload, exactly as above.
    } catch (err) {
      onCommittingChange(false);
      const code = codeOf(err);
      if (code === SWITCH_PASSWORD_INVALID || code === SWITCH_PASSWORD_REQUIRED) {
        setError(t("switchGate.passwordInvalid"));
      } else {
        setError(reportUnexpected(err));
      }
    }
  }

  if (pinNotSet) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 shrink-0" aria-hidden />
            {t("switchGate.pinNotSetTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("switchGate.pinNotSetDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{c("close")}</Button>
        </DialogFooter>
      </>
    );
  }

  if (mode === "pin") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("switchGate.pinTitle")}</DialogTitle>
          <DialogDescription>
            {t("switchGate.pinDescription", { name: target.first_name })}
          </DialogDescription>
        </DialogHeader>

        {/* The pad centres itself; the header above it stays left-aligned like
            every other dialog's. */}
        <div className="flex justify-center py-2">
          <PinPad
            value={pin.value}
            onChange={pin.setValue}
            onComplete={handlePin}
            disabled={pin.busy}
            shaking={pin.shaking}
            ariaLabel={t("switchGate.pinTitle")}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* One button, so nothing to order — the 4th digit is the affirmative. */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            {c("cancel")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={handlePassword} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {t("switchGate.passwordTitle", { name: target.first_name })}
        </DialogTitle>
        <DialogDescription>
          {t("switchGate.passwordDescription")}
        </DialogDescription>
      </DialogHeader>

      <Field label={c("password")} htmlFor={passwordId}>
        <PasswordInput
          id={passwordId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={committing}
          required
          autoFocus
        />
      </Field>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* DOM order [negative, affirmative]: rightmost in a row, topmost in a
          stack. `DialogFooter` places both. */}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={committing}
        >
          {c("cancel")}
        </Button>
        <Button type="submit" disabled={committing || password.length === 0}>
          {t("switchGate.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface SwitchGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: FamilyMember;
  mode: SwitchGateMode;
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
}

/**
 * The gate on its own, for the surfaces that had nothing to confirm first: the
 * header account menu's rows and the /select-profile tiles. Clicking a name
 * there *is* the confirmation, so the credential prompt is the whole dialog.
 *
 * `SwitchProfileDialog` does not use this wrapper — it already has a dialog
 * open and renders `SwitchGateBody` as its second step, so the gate replaces
 * the confirmation inside one box rather than stacking a second one over it.
 */
export function SwitchGateDialog({
  open,
  onOpenChange,
  target,
  mode,
  onCommit,
}: SwitchGateDialogProps) {
  const [committing, setCommitting] = useState(false);

  return (
    <Dialog
      open={open}
      // A commit in flight is not closable: the switch is landing either way,
      // and a backdrop click that pulled the box away mid-request would leave
      // the reader with no sign that anything is happening.
      onOpenChange={(next) => {
        if (!committing) onOpenChange(next);
      }}
    >
      <DialogContent className="space-y-4">
        <SwitchGateBody
          target={target}
          mode={mode}
          committing={committing}
          onCommittingChange={setCommitting}
          onCommit={onCommit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
