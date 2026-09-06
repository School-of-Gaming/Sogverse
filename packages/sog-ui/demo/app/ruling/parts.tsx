/**
 * The ruling page's furniture.
 *
 * **The page is seen, not read.** It shows a thing and its name and nothing
 * else: no prose, no rationale, no ratios, no pass marks. Every reason lives in
 * a doc comment beside the value it explains, which is where it can be read
 * next to the thing it governs and cannot rot into a paragraph nobody updates.
 *
 * What is allowed on screen: a section title, a thing, and a name. A name may
 * be a token name, a hex, a short `today` / `as authored` / `proposed` label,
 * a construct's name, or an exemplar's `component — page` locator, which is
 * that construct's name in the app rather than a sentence about it.
 *
 * **What is left here is what the page still draws, and no more.** This module
 * carried a comparison grid, a labelled panel, a captioned exemplar, a swatch,
 * a glyph and the page's five neutral hexes, because every question on the page
 * was a pair of pictures. Most of those questions have been ruled and landed and
 * their furniture went with their drawings; its history is in git, which is
 * where a deleted component belongs rather than in a file exporting it for
 * nobody.
 *
 * Three pieces are back, because two questions came back to be drawn: a
 * sub-heading, a two-column comparison and a captioned exemplar. They are the
 * originals rather than new shapes — a page that draws two pictures side by side
 * and says where each comes from has always needed exactly these three, and
 * re-deriving them would produce the same components under different names.
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
 * Two columns on a wide viewport, stacked on a narrow one.
 *
 * The count is a literal class rather than an interpolation, for the same
 * reason every other class on this page is: Tailwind scans source text, so a
 * class assembled at render time is a class the stylesheet does not contain.
 */
export function Compare({ children }: { children: ReactNode }) {
  return <div className="grid gap-8 lg:grid-cols-2">{children}</div>;
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
