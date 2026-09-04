"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PinPad, usePinField } from "@/components/pin";
import {
  SwitchAccountError,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_REQUIRED,
  SWITCH_SIGN_OUT_REQUIRED,
  type FamilyMember,
  type SwitchAccountCredentials,
} from "@/services/family";

/**
 * What this gate does about the switch behind it. Chosen by `switchGateFor`,
 * never here.
 *
 *  - `pin` — collect a linked parent's PIN and commit.
 *  - `signOut` — collect nothing. Explain why this session cannot become
 *    somebody else's, and offer the way that works.
 */
export type SwitchGateMode = "pin" | "signOut";

interface SwitchGateBodyProps {
  /** The account being switched into — named in the copy, never a source of truth. */
  target: FamilyMember;
  /**
   * The signed-in viewer's own first name. The sign-out copy is about *them* —
   * whose session this is and who it belongs to — so it cannot be derived from
   * the target, and every host already knows it.
   */
  viewerFirstName: string;
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
  /**
   * Runs before the sign-out form's native submit proceeds.
   *
   * The second style-guide seam, and it exists because the sign-out here is
   * *real*: a demo box rendering this body renders a form that really posts to
   * `/api/auth/signout`, so a reader clicking the button to see what it does
   * would be signed out of the admin session they are reading the page in.
   * Calling `preventDefault` on the event makes the box inert, and the flag
   * that disables the buttons is then left unset — nothing is in flight, so
   * nothing should look like it is. Production passes nothing.
   */
  onSignOutSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * What stands between a child and somebody else's account, in whichever of its
 * two shapes applies.
 *
 * Which shape is not this component's decision — `switchGateFor` makes it from
 * the viewer's role and their session's provenance, and hands the answer down
 * as `mode`. A session a parent handed over is asked for that parent's PIN. A
 * session the child opened with their own username or email is asked for
 * nothing: it belongs to them alone, and the way to another account is the
 * login page, so this body explains that in plain words and offers the sign-out
 * that starts it.
 *
 * **A failure never navigates.** The route guarantees a refused gate leaves the
 * caller's session untouched, and the UI has to match that promise: a wrong PIN
 * shakes and clears, and the child stays exactly where they were.
 *
 * **The sign-out is the canonical shape and nothing else.** A form POST to
 * `/api/auth/signout`, which the route answers with a 303 the browser follows
 * as a full-page GET — no fetch, no router push. The browser Supabase client is
 * seeded from cookies at construction time, so only a document unload rebuilds
 * it (root `CLAUDE.md` § Auth Architecture).
 *
 * **There is no "forgot PIN" escape here.** That route is customer-gated, so a
 * child could not complete it; the way out of a family with a forgotten PIN is
 * the same sign-out this body already offers on its other path.
 *
 * Rendered inside a `DialogContent` the caller owns — as its whole content
 * (`SwitchGateDialog`) or as the second step of a confirm dialog that decided a
 * gate applies. Sharing the body rather than opening a second dialog is what
 * keeps the confirm→gate transition from flashing a backdrop.
 */
export function SwitchGateBody({
  target,
  viewerFirstName,
  mode,
  committing,
  onCommittingChange,
  onCommit,
  onClose,
  initialPinNotSet = false,
  onSignOutSubmit,
}: SwitchGateBodyProps) {
  const t = useTranslations("family");
  const c = useTranslations("common");
  const pin = usePinField();
  /**
   * The one terminal state: nobody in this family holds a PIN. Reached only
   * from the route's own answer, because a gamer session cannot ask the
   * question — `pin_is_set()` is `auth.uid()`-scoped and would answer about the
   * child (see `src/services/pin/CLAUDE.md`).
   */
  const [pinNotSet, setPinNotSet] = useState(initialPinNotSet);
  /**
   * A commit that came back `SIGN_OUT_REQUIRED` even though this body was asked
   * for a PIN. It should not happen — the helper and the route are the same
   * rule — but the route is the boundary and its answer wins, so the body drops
   * the prompt and shows what actually applies rather than leaving a child
   * typing digits nothing will accept.
   */
  const [forcedSignOut, setForcedSignOut] = useState(false);
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
      if (code === SWITCH_SIGN_OUT_REQUIRED) {
        // Same: the pad goes with the prompt it belonged to.
        setForcedSignOut(true);
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

  if (mode === "pin" && !forcedSignOut) {
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
            // Either flag closes the pad. `pin.busy` is this body's own — set
            // the instant the fourth digit lands and left set through the
            // unload — and `committing` is the host's, which is what a commit
            // the host started (or a style-guide box pinning the state) says.
            disabled={pin.busy || committing}
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
    <SignOutToSwitch
      target={target}
      viewerFirstName={viewerFirstName}
      onClose={onClose}
      onSignOutSubmit={onSignOutSubmit}
    />
  );
}

/**
 * The answer to a switch no credential buys: what this session is, why it will
 * not become somebody else's, and the way that does work.
 *
 * Three short sentences, in the words a parent standing behind the child can
 * follow. The middle one is the mechanism (root `CLAUDE.md` § Safety copy): not
 * that we care about privacy, but that a session opened with one person's own
 * credentials opens exactly one account — which is a thing a reader can test.
 *
 * **The last sentence branches on what the target actually is**, because
 * "sign in as them" is advice only some targets can be reached by. A parent, and
 * a child whose account holds a username or a mailbox, each have a login of
 * their own; a `parent`-mode child has none at all — their account is reached by
 * an account switch and nothing else — so telling a reader to sign in as them
 * names an action that does not exist. That target gets the route that does
 * work: sign in as the parent, then switch from there. A member carrying no mode
 * at all is read the same way, since "no credential of their own" is the honest
 * reading of an absent one (`family.contracts.ts`).
 */
function SignOutToSwitch({
  target,
  viewerFirstName,
  onClose,
  onSignOutSubmit,
}: {
  target: FamilyMember;
  viewerFirstName: string;
  onClose: () => void;
  onSignOutSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("family");
  const c = useTranslations("common");
  /**
   * The submit is a native form POST with no promise behind it and no JS error
   * path: the document either navigates or it does not. Set in `onSubmit` while
   * the submit proceeds, it renders immediately and stands until the 303
   * unloads the page — never cleared, for the same reason.
   */
  const [signingOut, setSigningOut] = useState(false);

  /**
   * Whether the target can be signed into directly. A customer always can, and
   * so can a child in `username` or `email` mode; `parent` mode — and an absent
   * mode, which means the same thing — cannot, so the advice has to route
   * through the parent instead.
   */
  const targetHasOwnLogin =
    target.role === "customer" ||
    target.sign_in === "username" ||
    target.sign_in === "email";

  return (
    <>
      {/* `text-left` at every width: the header primitive centres on a phone,
          which suits a one-line title over a pad, but this view is two
          sentences of explanation and reads as a description. The second
          sentence lives inside the header so both take the same alignment. */}
      <DialogHeader className="text-left">
        <DialogTitle className="flex items-center gap-2">
          <LogOut className="h-5 w-5 shrink-0" aria-hidden />
          {t("switchGate.signOutTitle")}
        </DialogTitle>
        {/* Both sentences are the dialog's description, so both live inside
            `DialogDescription` — the second used to be a sibling paragraph
            beside it, which put half the explanation outside the description a
            screen reader is handed. A `<p>` cannot hold a `<p>`, so the second
            sentence is a block `span` rather than a paragraph of its own; the
            two still read as two lines. */}
        <DialogDescription>
          <span className="block">
            {t("switchGate.signOutOwnSession", { name: viewerFirstName })}
          </span>
          <span className="mt-1.5 block">
            {targetHasOwnLogin
              ? t("switchGate.signOutHow", { name: target.first_name })
              : t("switchGate.signOutHowViaParent", { name: target.first_name })}
          </span>
        </DialogDescription>
      </DialogHeader>

      {/* The canonical sign-out: a form POST the server answers with a 303,
          which the browser follows as a full-page GET. No client fetch, no
          router — the route changes cookies the browser Supabase singleton
          never sees, so only a document reload rebuilds it.

          The form wraps the whole footer rather than the one button, so the
          footer stays the flex parent and its DOM order is untouched:
          [negative, affirmative], rightmost in a row and topmost in a stack.
          Cancel is `type="button"` so it cannot submit, and there is no text
          field in this view for a browser's implicit submission to fire from.

          `onSubmit` records the commit and lets the native submit proceed — no
          `preventDefault`. The browser stays on this document until the 303
          comes back, so the spinner is on screen for the whole round trip, and
          there is no JS error path to clear it from.

          The one exception is the style-guide seam: a host that cancels the
          submit has stopped the sign-out, so the flag stays clear rather than
          disabling two buttons over a request nobody made. */}
      <form
        method="post"
        action="/api/auth/signout"
        onSubmit={(event) => {
          onSignOutSubmit?.(event);
          if (event.defaultPrevented) return;
          setSigningOut(true);
        }}
      >
        {/* The header's sign-out lands on the home page; this one exists to
            sign in as someone else, so it asks the route for the login page.
            The route resolves the value as an internal path and falls back to
            home for anything else. */}
        <input type="hidden" name="next" value={ROUTES.login} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={signingOut}
          >
            {c("cancel")}
          </Button>
          <Button type="submit" disabled={signingOut}>
            {signingOut && <Loader2 className="animate-spin" aria-hidden />}
            {c("signOut")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

interface SwitchGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: FamilyMember;
  viewerFirstName: string;
  mode: SwitchGateMode;
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
}

/**
 * The gate on its own, for the surfaces that had nothing to confirm first: the
 * header account menu's rows and the /select-profile tiles. Clicking a name
 * there *is* the confirmation, so the gate is the whole dialog.
 *
 * `SwitchProfileDialog` does not use this wrapper — it already has a dialog
 * open and renders `SwitchGateBody` as its second step, so the gate replaces
 * the confirmation inside one box rather than stacking a second one over it.
 */
export function SwitchGateDialog({
  open,
  onOpenChange,
  target,
  viewerFirstName,
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
          viewerFirstName={viewerFirstName}
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
