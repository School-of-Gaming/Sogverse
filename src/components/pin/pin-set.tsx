"use client";

import { useState, type ReactNode } from "react";
import { PinPad } from "./pin-pad";
import { usePinField } from "./use-pin-field";

interface PinSetProps {
  enterTitle: string;
  confirmTitle: string;
  description?: string;
  /** Shown (in a reserved-height line) when the confirmation didn't match. */
  mismatchMessage: string;
  /**
   * Persist the new PIN once entered and confirmed identically. Resolve `true`
   * when stored (caller navigates / swaps the view) or `false` to reject and
   * restart. A thrown error is treated as a rejection.
   */
  onSubmit: (pin: string) => Promise<boolean>;
  footer?: ReactNode;
}

/**
 * Enter-then-confirm capture for creating or resetting a PIN. The first entry
 * is held, the pad clears, and the parent must re-enter the same four digits.
 * A mismatch flashes/shakes, shows `mismatchMessage`, and restarts from the
 * first step — so a typo can never silently become the PIN. Used by the
 * create-at-gate, email-reset, and change-PIN ("new PIN") flows.
 */
export function PinSet({
  enterTitle,
  confirmTitle,
  description,
  mismatchMessage,
  onSubmit,
  footer,
}: PinSetProps) {
  const { value, setValue, busy, setBusy, shaking, reject } = usePinField();
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [mismatch, setMismatch] = useState(false);

  // Wrong confirmation (or a server reject): flag it, shake/clear via reject(),
  // and go back to the first step so a typo can never silently become the PIN.
  function restart() {
    setMismatch(true);
    setFirst("");
    setStage("enter");
    reject();
  }

  async function handleComplete(pin: string) {
    if (stage === "enter") {
      setFirst(pin);
      setValue("");
      setMismatch(false); // clears the "didn't match" line once they re-enter
      setStage("confirm");
      return;
    }
    // confirm stage
    if (pin !== first) {
      restart();
      return;
    }
    setBusy(true);
    let stored = false;
    try {
      stored = await onSubmit(pin);
    } catch {
      stored = false;
    }
    if (stored) return; // hold disabled state through the caller's transition
    restart();
  }

  const title = stage === "enter" ? enterTitle : confirmTitle;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      <PinPad
        value={value}
        onChange={setValue}
        onComplete={handleComplete}
        disabled={busy}
        shaking={shaking}
        ariaLabel={title}
      />
      {/* Reserved-height status line so showing the mismatch text never reflows
          the pad above it (no-layout-shift rule). */}
      <p className="min-h-5 text-sm text-destructive" role="alert">
        {mismatch ? mismatchMessage : ""}
      </p>
      {footer && <div className="w-full">{footer}</div>}
    </div>
  );
}
