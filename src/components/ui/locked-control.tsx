"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Everything a locked control says when it is pressed. Every word is a prop.
 *
 * **Two sentences, in that order: what the control does, then why this reader
 * cannot use it here.** A locked control is a teaching aid before it is a
 * refusal — the reader is looking at the real page, so the first thing worth
 * telling them is what the thing in front of them is *for*. The reason comes
 * second and says whose action it is rather than what this reader lacks.
 */
export interface LockExplanation {
  /** The control's own name, as the dialog's title — "Save", "Send to parents". */
  title: string;
  /** One sentence on what the control does for the reader who may use it. */
  what: string;
  /** One sentence on why it is locked for this reader. */
  why: string;
  /** The one button that closes the explanation. */
  dismiss: string;
  /**
   * The word a screen reader hears as the control's description, so a locked
   * control announces itself as one before it is pressed — the lock glyph is
   * decoration and says nothing to assistive technology.
   */
  lockedHint: string;
}

/**
 * An action a surface has declined to perform for this reader, in the slot
 * where the action would otherwise be handed in.
 *
 * **A lock is supplied, never inferred.** A component whose capability is
 * "was a save handed to me" keeps asking exactly that — and a shell that wants
 * the control *shown* but inert hands this in place of the function, carrying
 * the words the control explains itself with. The component never learns who
 * is looking or why; it learns that this slot is locked and what to say.
 */
export interface Locked {
  readonly locked: LockExplanation;
}

export function isLocked(value: unknown): value is Locked {
  return (
    typeof value === "object" &&
    value !== null &&
    "locked" in value &&
    typeof (value as { locked: unknown }).locked === "object"
  );
}

/** The explanation behind a slot that may be locked, or `null` when it is not. */
export function lockOf(value: unknown): LockExplanation | null {
  return isLocked(value) ? value.locked : null;
}

/**
 * The explanation dialog, and the handle a control opens it with.
 *
 * **For a control that is not a plain button** — a menu row, a pair of
 * attendance marks, a thumbnail's ✕ — where the control keeps its own shape and
 * only its press is redirected here. A plain button takes {@link LockedButton},
 * which is this plus the button.
 *
 * Focus goes back to whatever was focused when the explanation opened, because
 * the dialog primitive leaves focus where it lands and a keyboard reader who
 * pressed a locked Save should come back to that Save.
 */
export function useLockExplanation(explanation: LockExplanation | null): {
  open: () => void;
  isOpen: boolean;
  dialog: ReactNode;
} {
  const [isOpen, setIsOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement ? active : null;
    setIsOpen(true);
  }, []);

  const close = () => {
    setIsOpen(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target !== null && target.isConnected) {
      // After the commit that removes the dialog, so the focus is not taken
      // back by a node that is on its way out.
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  };

  const dialog =
    explanation === null ? null : (
      <LockExplanationDialog
        explanation={explanation}
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      />
    );

  return { open, isOpen, dialog };
}

/**
 * The explanation itself: the control's name, what it does, why it is locked,
 * and one way out.
 *
 * **A dialog rather than a popover**, because the kit has a dialog primitive
 * that already owns the portal, the backdrop, Escape and the stacking of one
 * overlay over another — which matters here, since a locked Save can sit inside
 * a dialog of its own — and has no popover. A second overlay with its own
 * answers to those four would be the drift the primitive exists to prevent. It
 * is the smallest size the primitive offers, and it asks nothing: one button,
 * which is focused on open so Enter and Escape both close it.
 */
export function LockExplanationDialog({
  explanation,
  open,
  onOpenChange,
}: {
  explanation: LockExplanation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="dialog" aria-modal>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {explanation.title}
          </DialogTitle>
          <DialogDescription>{explanation.what}</DialogDescription>
          <DialogDescription>{explanation.why}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            autoFocus
            onClick={() => onOpenChange(false)}
          >
            {explanation.dismiss}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The small padlock a locked control wears beside its own glyph and label —
 * exported for the composite controls that keep their own shape.
 */
export function LockGlyph({ className }: { className?: string }) {
  return <Lock className={cn("h-3 w-3 shrink-0", className)} aria-hidden />;
}

type LockedButtonProps = Omit<
  ButtonProps,
  "onClick" | "disabled" | "aria-haspopup"
> & {
  explanation: LockExplanation;
};

/**
 * **A locked control looks like the real one, carries a small padlock, and
 * explains itself when pressed.** One pattern everywhere a surface shows an
 * action this reader may not take: the button keeps its variant, its size, its
 * glyph and its label, so the page is the page an entitled reader sees, and a
 * padlock after the label is the one visible difference.
 *
 * **It is a real, enabled button**, never a disabled one. A disabled control
 * cannot be focused or pressed, so it can neither be found by a keyboard nor
 * asked what it is — and "what is this, and why can I not use it" is exactly the
 * question a locked control exists to answer. Pressing it opens the explanation;
 * it never performs the action, and the surface behind it has refused the write
 * besides — the lock is a teaching aid, not the boundary.
 *
 * It is dimmed a step so it does not compete with the controls this reader can
 * use, without dropping to the disabled weight that says "not now".
 */
export const LockedButton = forwardRef<HTMLButtonElement, LockedButtonProps>(
  function LockedButton({ explanation, className, children, ...props }, ref) {
    const { open, isOpen, dialog } = useLockExplanation(explanation);
    const hintId = useId();
    return (
      <>
        <Button
          ref={ref}
          type="button"
          {...props}
          // The hint describes rather than names, so the control's name stays
          // exactly the entitled reader's ("Save") and "locked" is announced
          // after it.
          aria-describedby={hintId}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={open}
          className={cn("gap-1.5 opacity-80", className)}
        >
          {children}
          <LockGlyph />
        </Button>
        {/* Outside the button, so it describes the control without becoming
            part of its name. */}
        <span id={hintId} className="sr-only">
          {explanation.lockedHint}
        </span>
        {dialog}
      </>
    );
  },
);
