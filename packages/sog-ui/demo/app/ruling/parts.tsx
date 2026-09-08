/**
 * The ruling page's furniture.
 *
 * **The page is seen, not read.** It shows a thing and its name and nothing
 * else: no prose, no rationale, no ratios, no pass marks. Every reason lives in
 * a doc comment beside the thing it explains, which is where it can be read next
 * to what it governs and cannot rot into a paragraph nobody updates.
 *
 * What is allowed on screen: a section title, a thing, and a name. A name may be
 * a face's own family name, a short `today` / `Poppins` / `Space Mono` label, or
 * an exemplar's `component — page` locator, which is that construct's name in
 * the app rather than a sentence about it.
 *
 * The shapes here are the ones the theme adoption's ruling page used, kept
 * deliberately rather than re-derived: a page that draws two or three pictures
 * side by side and says where each comes from has always needed exactly these,
 * and inventing new names for them would only make the two ledgers harder to
 * read against each other. `Columns` is the one addition — faces are ruled three
 * at a time (today, Poppins, Space Mono) where colour was ruled two at a time.
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
      <h2 className="mt-1 text-h2">{title}</h2>
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
 * Two or three columns on a wide viewport, stacked on a narrow one.
 *
 * Both counts are written out as literal classes rather than interpolated, for
 * the same reason every other class here is: Tailwind scans source text, so a
 * class assembled at render time is a class the stylesheet does not contain.
 * The columns stay side by side rather than stacking, because a face is judged
 * against its neighbour and two drawings a scroll apart are compared from
 * memory.
 */
export function Columns({ of, children }: { of: 2 | 3; children: ReactNode }) {
  return (
    <div
      className={
        of === 3
          ? "grid gap-8 lg:grid-cols-3"
          : "grid gap-8 lg:grid-cols-2"
      }
    >
      {children}
    </div>
  );
}

/** One drawing in a comparison, under the name of the face it is set in. */
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
 * The caption is the construct's name in the codebase — the component it was
 * copied from and a page it appears on — so a face is ruled on in the thing it
 * sets rather than as a specimen line.
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
 * The card ground, for a site that is drawn on one in the app.
 *
 * A face on the page ground and the same face on a card are the same face, but
 * a heading pulled out of the card it lives in is not the thing the owner is
 * ruling on — the admin panel's title in particular is a small pixel line
 * against a card edge, and its size is only judged inside the box that sets it.
 */
export function CardGround({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">{children}</div>
  );
}
