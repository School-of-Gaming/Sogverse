/**
 * The ruling page's furniture.
 *
 * **The page is seen, not read.** It shows a thing and its name and nothing
 * else: no prose, no rationale, no ratios, no pass marks. Every reason lives in
 * a doc comment beside the value it explains, which is where it can be read
 * next to the thing it governs and cannot rot into a paragraph nobody updates.
 * A ruling is made by looking at two pictures, so where the point used to be a
 * measurement it is now a rendering — the pairing drawn at real size on the
 * real ground, today beside the candidate, and the eye decides.
 *
 * What is allowed on screen: a section title, a thing, and a name. A name may
 * be a token name, a hex, a short `today` / `as authored` / `proposed` label,
 * a construct's name, or an exemplar's `component — page` locator, which is
 * that construct's name in the app rather than a sentence about it.
 *
 * Colour that is not a library token is drawn through an inline `style`, never
 * a class: Tailwind scans source text, so a class assembled from a hex at
 * render time is a class the stylesheet does not contain.
 */

import type { ReactNode } from "react";
import { NEUTRALS } from "../../../src/tokens/brand";

export function Question({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-24 border-t border-border pt-10">
      <p className="font-brand-mono text-body-s text-muted-foreground">{`0${n}`}</p>
      <h2 className="mt-1 text-h2">{title}</h2>
      <div className="mt-10 space-y-12">{children}</div>
    </section>
  );
}

/** A sub-heading inside a question, naming the construct being compared. */
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

/**
 * Two to six columns on a wide viewport, stacked on a narrow one.
 *
 * The count is a literal class per branch rather than an interpolation, for the
 * same reason every other class on this page is.
 *
 * Four, five and six exist for the candidate rows: a job that has a `today`
 * plus four or five replacements has to put all of them in one row, because
 * adjacent candidates compare themselves and candidates split across two rows
 * are compared from memory. They step down through `sm` and `lg` so a narrow
 * viewport gets pairs rather than a six-across squeeze, and the widest step is
 * `xl` because six panels only earn their width on a desk.
 */
const COLUMN_CLASSES: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid gap-6 lg:grid-cols-2",
  3: "grid gap-6 lg:grid-cols-3",
  4: "grid gap-6 sm:grid-cols-2 xl:grid-cols-4",
  5: "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  6: "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
};

export function Compare({
  columns,
  children,
}: {
  columns: 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  return <div className={COLUMN_CLASSES[columns]}>{children}</div>;
}

/** One labelled column of a comparison. The label is a name, never a sentence. */
export function Panel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Caps>{label}</Caps>
      <div className="mt-3 flex-1 rounded-lg border border-border p-4">
        {children}
      </div>
    </div>
  );
}

/**
 * One construct from the app, captioned with where a reader meets it.
 *
 * The caption is the construct's name in the codebase — the component it was
 * copied from and a page it appears on — so a colour is ruled on in the thing
 * it draws rather than as a square.
 */
export function Exemplar({
  file,
  page,
  children,
}: {
  file: string;
  page: string;
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <div>{children}</div>
      <figcaption className="mt-2 text-body-s text-muted-foreground">
        <span className="font-brand-mono">{file}</span>
        {" — "}
        {page}
      </figcaption>
    </figure>
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
 * the app uses closely enough to recognise.
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
  checkMark: ["m5 12 5 5L20 7"],
  plus: ["M12 5v14", "M5 12h14"],
  image: [
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
    "m21 15-5-5L5 21",
  ],
  chevron: ["m6 9 6 6 6-6"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  loader: ["M21 12a9 9 0 1 1-6.219-8.56"],
  micOff: [
    "m2 2 20 20",
    "M18.89 13.23A7.12 7.12 0 0 0 19 12v-2",
    "M5 10v2a7 7 0 0 0 12 5",
    "M15 9.34V5a3 3 0 0 0-5.68-1.33",
    "M9 9v3a3 3 0 0 0 5.12 2.12",
    "M12 19v3",
  ],
  sliders: [
    "M4 21v-7",
    "M4 10V3",
    "M12 21v-9",
    "M12 8V3",
    "M20 21v-5",
    "M20 12V3",
    "M1 14h6",
    "M9 8h6",
    "M17 16h6",
  ],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m20 20-4.5-4.5"],
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
