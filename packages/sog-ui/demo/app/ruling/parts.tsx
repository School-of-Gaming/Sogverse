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
import type { LucideIcon } from "lucide-react";
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
 * A glyph, drawn as the `lucide-react` component the app itself renders.
 *
 * The page draws the icons Sogverse draws, because the glyph's shape is part of
 * what is being judged: a mark decides how a construct reads as much as its
 * colour does, and a ruling made on an approximation is a ruling on a picture
 * nobody ships. So every call site names the component the exemplar's own file
 * imports, and where a glyph stands in for something that is not an icon in the
 * app — an identicon, a photograph, an emoji reaction — the call site says so.
 * There are no approximations.
 *
 * The size/colour API is the page's rather than lucide's own: `colour` is the
 * stroke, passed as a value and not a class, for the same reason every other
 * colour on this page is.
 */
export function Glyph({
  icon: Icon,
  size = 20,
  colour,
}: {
  icon: LucideIcon;
  size?: number;
  colour: string;
}) {
  return <Icon size={size} color={colour} aria-hidden className="shrink-0" />;
}
