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
 * was a pair of pictures. Every one of those questions has been ruled and
 * landed, and the page is the inventory alone — a title and two tables — so the
 * furniture the drawings needed went with the drawings. Its history is in git,
 * which is where a deleted component belongs rather than in a file exporting it
 * for nobody.
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

/** A small, tracked marker. Furniture, so caps are allowed and tracking travels with them. */
export function Caps({ children }: { children: ReactNode }) {
  return (
    <p className="text-body-s font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}
