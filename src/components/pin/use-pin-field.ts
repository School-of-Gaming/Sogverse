"use client";

import { useEffect, useRef, useState } from "react";

/** How long the wrong-PIN flash/shake plays before the dots auto-clear. */
const REJECT_MS = 600;

/**
 * Transient state for a PIN field, shared by PinEntry and PinSet: the entered
 * digits, the in-flight `busy` flag, and the wrong-PIN feedback.
 *
 * `reject()` is called from the (event-driven) submit handler when a PIN is
 * wrong — it flashes/shakes the dots, then clears them and re-enables input
 * after a short delay. Keeping this here (not in an effect) matches how it's
 * actually triggered: a user action, not derived state.
 */
export function usePinField() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Don't leave a pending clear running if the gate unmounts mid-shake.
  useEffect(() => () => clearTimeout(timer.current), []);

  function reject() {
    setShaking(true);
    timer.current = setTimeout(() => {
      setShaking(false);
      setBusy(false);
      setValue("");
    }, REJECT_MS);
  }

  return { value, setValue, busy, setBusy, shaking, reject };
}
