/**
 * The ruling page's furniture.
 *
 * **The page is seen, not read.** It shows a thing and its name and nothing
 * else: no prose, no rationale, no ratios, no pass marks. Every reason lives in
 * a doc comment beside the thing it explains.
 *
 * What is allowed on screen: a section title, a thing, and a name. A name is a
 * step's name (`today — h2`, `section`, `28px`), or an exemplar's
 * `component — page` locator, which is that construct's name in the app rather
 * than a sentence about it.
 *
 * The shapes are the theme and faces adoptions' ruling pages', kept rather than
 * re-derived so the three ledgers read against each other. Two additions:
 * `Columns` takes four, because the page-title and furniture questions are
 * ruled four drawings at a time; and `Frame`, a fixed-width box that stands in
 * for a viewport, for the breakpoint question.
 */

import type { ReactNode } from "react";

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
      <p className="font-mono text-body-s text-muted-foreground">{`0${n}`}</p>
      <h2 className="mt-1 text-display">{title}</h2>
      <div className="mt-10 space-y-14">{children}</div>
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
      <h3 className="text-section">{title}</h3>
      <div className="mt-5 space-y-10">{children}</div>
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
 * Two, three or four columns on a wide viewport, stacked on a narrow one.
 *
 * Every count is a literal class rather than an interpolated one: Tailwind
 * scans source text, so a class assembled at render time is a class the
 * stylesheet does not contain. The columns sit side by side because a step is
 * judged against its neighbour, and two drawings a scroll apart are compared
 * from memory.
 */
export function Columns({
  of,
  children,
}: {
  of: 2 | 3 | 4;
  children: ReactNode;
}) {
  const grid =
    of === 4
      ? "grid gap-8 lg:grid-cols-4"
      : of === 3
        ? "grid gap-8 lg:grid-cols-3"
        : "grid gap-8 lg:grid-cols-2";
  return <div className={grid}>{children}</div>;
}

/** One drawing in a comparison, under its name. */
export function Column({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Caps>{name}</Caps>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * One construct from the app, captioned with where a reader meets it.
 *
 * The caption is the component it was copied from and a page it appears on, so
 * a step is ruled on in the thing it sets rather than as a specimen line.
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
      <figcaption className="mt-3 text-body-s text-muted-foreground">
        <span className="font-mono">{file}</span>
        {" — "}
        {page}
      </figcaption>
    </figure>
  );
}

/**
 * The card ground, for a heading that is drawn on one in the app.
 *
 * A card title pulled out of its card is not the thing being ruled on: its size
 * is judged against the card's edge and padding. The padding is the app's own
 * card padding (`p-6`, the card primitive's header), so the box is the box.
 */
export function CardGround({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">{children}</div>
  );
}

/**
 * A fixed-width stand-in for a viewport.
 *
 * It is a container (`@container`), so a heading inside it resteps on the
 * frame's width rather than on the demo window's. A drawing reproduces a
 * breakpoint class by moving it from the viewport to the container at the
 * same width — `sm:` (40rem) becomes `@min-[40rem]:` and `md:` (48rem)
 * becomes `@min-[48rem]:` — and changes nothing else, so 360 and 840 can be
 * drawn side by side in one window. The frame's own padding is the app's
 * narrow page gutter (`px-4`).
 */
export function Frame({
  width,
  children,
}: {
  width: 360 | 840;
  children: ReactNode;
}) {
  return (
    <div
      className={
        width === 360
          ? "@container w-[360px] max-w-full shrink-0 rounded-lg border border-border px-4 py-6"
          : "@container w-[840px] max-w-full shrink-0 rounded-lg border border-border px-4 py-6"
      }
    >
      {children}
    </div>
  );
}
