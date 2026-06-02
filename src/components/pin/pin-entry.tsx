"use client";

import { type ReactNode } from "react";
import { PinPad } from "./pin-pad";
import { usePinField } from "./use-pin-field";

interface PinEntryProps {
  title: string;
  description?: string;
  /**
   * Validate the entered PIN. Resolve `true` when accepted (the caller is
   * responsible for navigating away or swapping the view) or `false` to reject
   * — the pad flashes red, shakes, and clears for an instant retry. A thrown
   * error is treated as a rejection.
   */
  onSubmit: (pin: string) => Promise<boolean>;
  /** Rendered below the pad (forgot link, etc.). */
  footer?: ReactNode;
}

/**
 * Single 4-digit capture with wrong-value feedback. Used to enter a known PIN:
 * the unlock gate and the "current PIN" step of the change flow.
 *
 * On accept the pad stays disabled (we never clear `busy`) so it can't
 * re-trigger during the navigation/view-swap the caller kicks off — the
 * loading-state contract. On reject `reject()` owns the flash/shake/clear and
 * the re-enable.
 */
export function PinEntry({ title, description, onSubmit, footer }: PinEntryProps) {
  const { value, setValue, busy, setBusy, shaking, reject } = usePinField();

  async function handleComplete(pin: string) {
    setBusy(true);
    let accepted = false;
    try {
      accepted = await onSubmit(pin);
    } catch {
      accepted = false;
    }
    if (accepted) return; // hold the disabled state through the caller's transition
    reject();
  }

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
      {footer && <div className="w-full">{footer}</div>}
    </div>
  );
}
