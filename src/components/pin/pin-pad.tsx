"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIN_LENGTH = 4;

/** 1-9, a blank slot for grid alignment, 0, then backspace. */
const KEYS: ReadonlyArray<string | "blank" | "backspace"> = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "blank", "0", "backspace",
];

/** Shared key styling for both the digit keys and the backspace key. */
const KEY_BASE =
  "flex h-16 w-16 touch-manipulation select-none items-center justify-center rounded-full transition hover:bg-accent hover:text-accent-foreground active:scale-90 active:bg-accent active:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none";

interface PinPadProps {
  /** Current digits entered (0..PIN_LENGTH characters). Controlled by the parent. */
  value: string;
  /** Receives each digit/backspace change — pass a referentially stable setter. */
  onChange: (next: string) => void;
  /** Fired once the 4th digit lands, with the complete PIN. */
  onComplete: (pin: string) => void;
  /** Disables touch/click/keyboard input (e.g. while a verify is in flight). */
  disabled?: boolean;
  /**
   * Wrong-PIN feedback: the filled dots flash red and shake. While shaking,
   * input is locked so the animating dots aren't disturbed. The owner clears
   * the value once the shake is done (see usePinField).
   */
  shaking?: boolean;
  /** Accessible label for the dot row (e.g. "Enter your PIN"). */
  ariaLabel: string;
}

/**
 * The PIN entry control: a row of dots that fill as digits land, above an
 * on-screen 10-key pad with a backspace.
 *
 * Three input methods work at once: tapping the pad (mobile), clicking it
 * (desktop), and the physical keyboard (0-9 + Backspace). Dots are masked —
 * they never show the digit, only filled/hollow — since the PIN is a secret.
 * There is no confirm button; the 4th digit fires `onComplete`. A wrong PIN
 * (signalled by bumping `rejectKey`) flashes the dots red and shakes them, then
 * clears — the red flash is the feedback even when the OS has reduced motion
 * and the shake is suppressed. The parent owns `value` and orchestrates the
 * multi-step flows. See PinEntry / PinSet.
 */
export function PinPad({
  value,
  onChange,
  onComplete,
  disabled = false,
  shaking = false,
  ariaLabel,
}: PinPadProps) {
  const t = useTranslations("pin");

  // Input is locked while a verify is in flight (disabled) and during the
  // reject flash (so the shaking dots aren't disturbed mid-animation).
  const locked = disabled || shaking;

  function pressDigit(digit: string) {
    if (locked || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  }

  function pressBackspace() {
    if (locked || value.length === 0) return;
    onChange(value.slice(0, -1));
  }

  // Physical-keyboard support. Re-subscribes when value/locked change so the
  // handler always reads the current digits (it closes over them).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (locked) return;
      if (e.key >= "0" && e.key <= "9") {
        if (value.length >= PIN_LENGTH) return;
        e.preventDefault();
        const next = value + e.key;
        onChange(next);
        if (next.length === PIN_LENGTH) onComplete(next);
      } else if (e.key === "Backspace") {
        if (value.length === 0) return;
        e.preventDefault();
        onChange(value.slice(0, -1));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [value, locked, onChange, onComplete]);

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Classic PIN dots: hollow until a digit lands, then filled — never the
          digit itself, since the PIN is a secret. ○ ○ ○ ○ → ● ● ○ ○ → ● ● ● ●.
          On a wrong PIN they flash red and shake before clearing. */}
      <div
        className={cn("flex gap-5", shaking && "animate-shake")}
        role="status"
        aria-label={ariaLabel}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < value.length;
          return (
            <span
              key={i}
              className={cn(
                "h-4 w-4 rounded-full border-2 transition-colors",
                shaking
                  ? "border-destructive bg-destructive"
                  : filled
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40",
              )}
            />
          );
        })}
      </div>

      {/* On-screen 10-key pad — perfect circles, centered in each grid cell. */}
      <div className="grid grid-cols-3 place-items-center gap-4">
        {KEYS.map((key, i) => {
          if (key === "blank") return <div key={i} className="h-16 w-16" aria-hidden="true" />;
          if (key === "backspace") {
            return (
              <button
                key={i}
                type="button"
                onClick={pressBackspace}
                disabled={locked || value.length === 0}
                aria-label={t("deleteDigit")}
                className={cn(KEY_BASE, "text-muted-foreground disabled:opacity-30")}
              >
                <Delete className="h-6 w-6" />
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => pressDigit(key)}
              disabled={locked || value.length >= PIN_LENGTH}
              className={cn(
                KEY_BASE,
                "border border-input bg-background text-2xl font-semibold tabular-nums shadow-sm disabled:opacity-40",
              )}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
