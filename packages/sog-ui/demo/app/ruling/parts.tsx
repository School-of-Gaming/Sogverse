/**
 * The ruling page's furniture.
 *
 * This page is the one place in the demo that is read rather than only seen:
 * it exists to be ruled on, so it carries labels, ratios and pass marks that
 * the rest of the demo is forbidden. It is deleted once the ruling is made.
 *
 * Two things are load-bearing here. Ratios come from the library's own
 * `contrastRatio` and are never typed; and every colour that is not a library
 * token is drawn through an inline `style`, because Tailwind scans source text
 * and a class built from a hex at render time is a class the stylesheet does
 * not contain.
 */

import type { ReactNode } from "react";
import { contrastRatio, THRESHOLDS } from "../../../src/tokens/contrast";
import { NEUTRALS, YTY_FAMILIES } from "../../../src/tokens/brand";

/**
 * The two marks a measurement can carry.
 *
 * Both are library colours the contrast tests already prove as body text on
 * both grounds, so the verdict is never itself an unmeasured pairing.
 */
const PASS = YTY_FAMILIES.glow.soft;
const FAIL = YTY_FAMILIES.harmony.soft;

export function Question({
  n,
  title,
  asks,
  children,
}: {
  n: number;
  title: string;
  asks: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-24 border-t border-border pt-10">
      <p className="font-brand-mono text-body-s text-muted-foreground">{`0${n}`}</p>
      <h2 className="mt-1 text-h2">{title}</h2>
      <p className="mt-3 max-w-[70ch] text-body-l text-muted-foreground">
        {asks}
      </p>
      <div className="mt-10 space-y-12">{children}</div>
    </section>
  );
}

/** A sub-heading inside a question, for one construct being compared. */
export function Case({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-h3">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** A small, tracked marker. Furniture, so caps are allowed and tracking travels with them. */
export function Caps({ children }: { children: ReactNode }) {
  return (
    <p className="text-body-s font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** A plain paragraph of context, at the page's reading width. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[70ch] text-body-s text-muted-foreground">{children}</p>
  );
}

/**
 * Two or three columns on a wide viewport, stacked on a narrow one.
 *
 * The count is a literal class per branch rather than an interpolation, for the
 * same reason every other class on this page is.
 */
export function Compare({
  columns,
  children,
}: {
  columns: 2 | 3;
  children: ReactNode;
}) {
  return (
    <div
      className={
        columns === 2
          ? "grid gap-6 lg:grid-cols-2"
          : "grid gap-6 lg:grid-cols-3"
      }
    >
      {children}
    </div>
  );
}

/** One labelled column of a comparison. */
export function Panel({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Caps>{label}</Caps>
      {sub === undefined ? null : (
        <p className="mt-1 text-body-s text-muted-foreground">{sub}</p>
      )}
      <div className="mt-3 flex-1 rounded-lg border border-border p-4">
        {children}
      </div>
    </div>
  );
}

/**
 * One measured pairing, with the floor it is held to and whether it clears it.
 *
 * `use` picks the floor the way the library does: a property of the usage, not
 * of the colour, so the same hue can pass as a mark and fail as a sentence.
 */
export function Ratio({
  what,
  foreground,
  background,
  use,
}: {
  what: string;
  foreground: string;
  background: string;
  use: "body" | "glyph";
}) {
  const floor =
    use === "body" ? THRESHOLDS.bodyText : THRESHOLDS.largeTextAndGlyphs;
  const measured = contrastRatio(foreground, background);
  const clears = measured >= floor;
  return (
    <p className="font-brand-mono text-body-s">
      <span className="text-muted-foreground">{what} </span>
      <span style={{ color: clears ? PASS : FAIL }}>
        {`${measured.toFixed(2)}:1 · needs ${floor} · ${clears ? "PASS" : "FAIL"}`}
      </span>
    </p>
  );
}

/** A colour, its name and its hex. */
export function Swatch({
  hex,
  name,
  sub,
}: {
  hex: string;
  name: string;
  sub?: string;
}) {
  return (
    <div>
      <div
        className="h-12 rounded border border-border"
        style={{ backgroundColor: hex }}
      />
      <p className="mt-2 text-body-s font-medium">{name}</p>
      <p className="font-brand-mono text-body-s text-muted-foreground">{hex}</p>
      {sub === undefined ? null : (
        <p className="text-body-s text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

/** The page's two grounds, so a sample can be drawn on the one it will really sit on. */
export const GROUND = NEUTRALS.background.hex;
export const CARD = NEUTRALS.card.hex;
export const INK = NEUTRALS.foreground.hex;
export const MUTED_INK = NEUTRALS.mutedForeground.hex;
export const EDGE = NEUTRALS.border.hex;

/**
 * The glyphs these comparisons need, drawn here rather than pulled from the
 * app's icon set.
 *
 * The demo does not depend on Sogverse or on its icon package, and the shape of
 * a glyph is not what is being ruled on — its colour is. These mirror the marks
 * the app uses closely enough to recognise: a heart, a sun, a sword and a brain
 * for the four elements, a home for the Clubhouse zone, and the four state
 * marks an alert carries.
 */
const GLYPHS = {
  heart: [
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  ],
  sun: [
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "M12 2v2",
    "M12 20v2",
    "m4.9 4.9 1.4 1.4",
    "m17.7 17.7 1.4 1.4",
    "M2 12h2",
    "M20 12h2",
    "m6.3 17.7-1.4 1.4",
    "m19.1 4.9-1.4 1.4",
  ],
  sword: ["M14.5 17.5 3 6V3h3l11.5 11.5", "m13 19 6-6", "m16 16 4 4"],
  brain: [
    "M12 5a3 3 0 1 0-5.997.125A4 4 0 0 0 5 13a4 4 0 0 0 2 3.5 3 3 0 0 0 5 2.5Z",
    "M12 5a3 3 0 1 1 5.997.125A4 4 0 0 1 19 13a4 4 0 0 1-2 3.5 3 3 0 0 1-5 2.5Z",
  ],
  home: ["m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 21v-9h6v9"],
  gamepad: [
    "M2 12a6 6 0 0 1 6-6h8a6 6 0 0 1 0 12H8a6 6 0 0 1-6-6Z",
    "M6 12h4",
    "M8 10v4",
    "M15 13h.01",
    "M18 11h.01",
  ],
  alert: [
    "m10.29 3.86-8.19 14a2 2 0 0 0 1.71 3h16.38a2 2 0 0 0 1.71-3l-8.19-14a2 2 0 0 0-3.42 0Z",
    "M12 9v4",
    "M12 17h.01",
  ],
  check: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "m8.5 12 2.5 2.5 4.5-5"],
  info: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 16v-4", "M12 8h.01"],
  cross: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "m15 9-6 6", "m9 9 6 6"],
  tent: ["M3.5 21 12 4l8.5 17", "M12 4v17", "M2 21h20"],
  school: ["M3 21h18", "M5 21V8l7-5 7 5v13", "M10 21v-6h4v6"],
  calendar: [
    "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    "M8 2v4",
    "M16 2v4",
    "M4 10h16",
  ],
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({
  name,
  size = 20,
  colour,
}: {
  name: GlyphName;
  size?: number;
  colour: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {GLYPHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
