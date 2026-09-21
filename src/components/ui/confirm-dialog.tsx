"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusLine } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /**
   * Short message rendered inside the dialog's <DialogDescription> (a <p>) —
   * keep it inline-only. For richer content (callouts, lists) use `children`,
   * which renders below the description and outside that <p>.
   */
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
}

/**
 * The two answers to "does the person need the outcome before they move on?".
 *
 * They are a union rather than a flag beside an optional promise because the
 * two modes want different handlers, and a handler written for one is wrong in
 * the other: a handler returning nothing would leave a holding dialog with
 * nothing to wait for, and an `async` handler passed to the closing mode would
 * be awaited by nobody. Typing them apart is what stops a handler from changing
 * a dialog's behaviour just by being asynchronous.
 */
type ConfirmDialogModeProps =
  | {
      holdWhileCommitting?: false;
      /**
       * Runs, and the dialog closes in the same tick — so a flag the handler
       * sets is already live in the first render after the press.
       *
       * It returns nothing: the write behind it runs on its own, and the
       * surface underneath is what carries its pending state. A handler that
       * starts one spells it `void doThing()`, as anywhere else that takes a
       * plain callback.
       */
      onConfirm: () => void;
      describeError?: never;
    }
  | {
      /**
       * Hold the dialog open until the write settles.
       *
       * For a confirm whose outcome the person needs before they move on — a
       * refusal they have to read, or a result whatever they do next depends
       * on. Where the surface behind the dialog already carries the pending or
       * optimistic state, let the dialog close instead.
       */
      holdWhileCommitting: true;
      /**
       * The write. **Resolves only once the surface behind the dialog is ready
       * to be looked at again** — usually after the read that follows the write
       * — because the dialog closes the moment it does.
       */
      onConfirm: () => Promise<void>;
      /**
       * The rejection, in the words the person should read. Rendered inside the
       * dialog, so a refusal is never drawn behind the dialog that caused it.
       */
      describeError?: (error: unknown) => ReactNode;
    };

type ConfirmDialogProps = ConfirmDialogBaseProps & ConfirmDialogModeProps;

/**
 * A confirm/cancel dialog for destructive (or otherwise weighty) actions.
 *
 * By default the press is the end of the dialog: `onConfirm` fires, then the
 * dialog closes — callers don't dismiss it themselves. Cancel (button,
 * backdrop, Escape) just closes via `onOpenChange`.
 *
 * `holdWhileCommitting` is the other mode, and there the dialog owns the
 * committing latch for the write: set synchronously before `onConfirm` runs, so
 * no render between the click and the disabled button can take a second press;
 * both buttons refuse presses and the affirmative carries a spinner while the
 * write is in the air; backdrop and Escape are refused. A resolved write closes
 * the dialog with the latch still set, so the button never re-enables in the
 * frame before it goes; a rejected one keeps the dialog up, hands the buttons
 * back, and names the failure in place.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange } = props;
  /**
   * Whether the write is in the air — out here, because the two close paths the
   * primitive owns (backdrop, Escape) have to be refused while it is, and the
   * rest of the committing state lives in the body, which the primitive
   * unmounts the moment the dialog closes.
   */
  const committing = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A write in the air is not something a stray keypress may abandon: the
        // press has been made, and its outcome is what this dialog is still
        // here to show.
        if (committing.current) return;
        onOpenChange(next);
      }}
    >
      <ConfirmDialogBody {...props} committingRef={committing} />
    </Dialog>
  );
}

/**
 * Everything the dialog holds while it is open, and the only place the
 * committing latch and the failure line exist.
 *
 * Mounted by the primitive only while the dialog is open, which is what makes
 * both of them seed themselves cleanly on every open without anything clearing
 * them — the same reasoning the cover-request form is built on. Holding them in
 * the component above and resetting them in an effect was the other way to get
 * it, and it is the cascading-render shape React asks callers not to write.
 */
function ConfirmDialogBody({
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  confirmVariant = "destructive",
  committingRef,
  // The mode union, kept whole rather than destructured, because that is what
  // `holdWhileCommitting` discriminates and picking the handler out first would
  // throw the discrimination away. (`open` rides along in it, unread: the
  // primitive above is what answers that one.)
  ...mode
}: ConfirmDialogProps & { committingRef: RefObject<boolean> }) {
  const c = useTranslations("common");
  const [committing, setCommitting] = useState(false);
  const [failure, setFailure] = useState<ReactNode>(null);

  // The latch is deliberately still set when this unmounts on the success path,
  // and the ref outlives the unmount — so it is handed back here rather than
  // where it was raised.
  useEffect(
    () => () => {
      committingRef.current = false;
    },
    [committingRef],
  );

  const confirm = () => {
    if (mode.holdWhileCommitting !== true) {
      mode.onConfirm();
      onOpenChange(false);
      return;
    }
    // The ref rather than the state: a second click arriving in the same tick
    // as the first gets here before React has rendered the disabled button.
    if (committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);
    setFailure(null);

    const { onConfirm, describeError } = mode;
    const fail = (error: unknown) => {
      committingRef.current = false;
      setCommitting(false);
      setFailure(describeError?.(error) ?? null);
    };

    let settled: Promise<void>;
    try {
      settled = onConfirm();
    } catch (error) {
      fail(error);
      return;
    }
    void settled.then(
      // The latch stays set: clearing it here would re-enable the button for
      // the frame between the write landing and the dialog going.
      () => onOpenChange(false),
      fail,
    );
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children && <div className="mt-4">{children}</div>}
      {/* Above the footer, so the footer's own children are settled the moment
          the dialog opens and a failure can never reorder them. It reserves
          nothing while there is nothing to say: the line arrives as the direct
          result of a press the reader has just made. */}
      {failure !== null && (
        <StatusLine
          status="destructive"
          size="xs"
          role="alert"
          className="mt-4"
        >
          {failure}
        </StatusLine>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={committing}
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel ?? c("cancel")}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          disabled={committing}
          onClick={confirm}
          className="gap-1.5"
        >
          {committing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
