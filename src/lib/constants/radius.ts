// Pixel equivalents of the --radius-* custom properties in globals.css.
// Email HTML can't use CSS variables or Tailwind classes, so the scale is
// mirrored here the same way colors.ts mirrors the palette.
// If you change --radius in globals.css, update these.

/**
 * The app's corner scale, keyed by the Tailwind class that consumes it, so a
 * call site reads as the class it is standing in for: `RADIUS.md` is what
 * `rounded-md` renders to, `RADIUS.lg` is `rounded-lg`.
 *
 * This exists because both email radii had drifted off it — a button at 8px
 * against the app's 6px, and the message panel at 12px against a `Card`'s 8px —
 * and neither was visible as a difference while they were literals. A number
 * typed into markup cannot disagree with anything; a number named after the
 * token it mirrors can, and that is the whole point of mirroring it.
 *
 * `sm` and `xl` are here to complete the scale rather than because a mail uses
 * them: a partial mirror is how the next value gets typed in by hand.
 */
export const RADIUS = {
  /** rounded-sm — calc(var(--radius) - 4px) */
  sm: "4px",
  /** rounded-md — calc(var(--radius) - 2px). Buttons. */
  md: "6px",
  /** rounded-lg — var(--radius). Cards, and the email's message panel. */
  lg: "8px",
  /** rounded-xl — calc(var(--radius) + 4px) */
  xl: "12px",
} as const;
