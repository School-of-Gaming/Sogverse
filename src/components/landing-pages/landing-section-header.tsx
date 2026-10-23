import type { ReactNode } from "react";
import { Heading } from "@sog/ui";
import { cn } from "@/lib/cn";
import { written } from "./landing-section-types";

/*
 * The frame pieces every landing section shares — its vertical rhythm and its
 * header — in a module of their own, with no client directive, so a section
 * renderer on the server and a section drawn by a client component (the
 * products section, which keeps its cards live) paint the same frame.
 */

/**
 * A section's content box: the page container, the same on every page. A
 * `card` section's band is the page body's full-width wrapper around it, and
 * a page's sticky card stands in the gutter outside it, so neither ever
 * narrows or pads the content.
 */
export const LANDING_CONTENT = "container mx-auto px-4";

/** Vertical rhythm shared by every section after the hero. */
export const LANDING_SECTION = `${LANDING_CONTENT} py-16 sm:py-24`;

/*
 * **A sticky section is an ordinary section that, from `2xl`, is also the
 * sticky card in its gutter** — one element, drawn once, whose look switches
 * at that breakpoint by its classes alone. Below `2xl` none of the classes
 * below applies and the section is drawn exactly as its type draws any
 * section. Every one of them is written `2xl:`, the width at which the page
 * body's grid lifts the section into the gutter, so they change together.
 */

/**
 * A sticky section's own box from `2xl`: the gutter's layer around it holds
 * the spacing there, so the section's container padding goes.
 */
export const LANDING_STICKY_SECTION = "2xl:p-0";

/**
 * A sticky section's words from `2xl`, the card's: start-aligned, under the
 * section heading a step down (the card's title, where the flow draws the
 * display step). Set on the element holding the words; the heading is
 * `Heading`, whose step is a prop, so the card's step is laid over it from
 * here, at the one breakpoint where the section is a card.
 */
export const LANDING_STICKY_WORDS =
  "2xl:text-start 2xl:[&_h2]:text-card-title 2xl:[&_h2]:text-start";

/**
 * An action whose label may wrap: at 360px, and in a sticky card's 20rem, a
 * long label — the French call to action — is wider than its column, and an
 * unwrapped button runs past the edge.
 */
export const LANDING_WRAPPING_ACTION = "h-auto min-h-11 whitespace-normal py-2.5 text-center";

/**
 * A sticky section's action from `2xl`, whichever type draws it — the call to
 * action's button, the guide's download, the sign-up's submit: the card's full
 * width, its label wrapping where a long one is wider than the card's 20rem.
 */
export const LANDING_STICKY_ACTION =
  "2xl:h-auto 2xl:min-h-11 2xl:w-full 2xl:whitespace-normal 2xl:py-2.5 2xl:text-center";

/** Small uppercase section label — furniture, so caps; act, as the Roblox page's. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-act">
      {children}
    </p>
  );
}

/** Whether any of a section's header words is written. */
export function hasSectionHeader(words: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
}): boolean {
  return (
    written(words.eyebrow) !== null ||
    written(words.heading) !== null ||
    written(words.intro) !== null
  );
}

/**
 * A section's eyebrow, heading and intro, each drawn only when written,
 * centred over the section or start-aligned — and a sticky section's, the
 * card's from `2xl` (`LANDING_STICKY_WORDS`).
 */
export function SectionHeader({
  eyebrow,
  heading,
  intro,
  centred = true,
  sticky = false,
}: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  centred?: boolean;
  /** The section is sticky: from `2xl` its header is the sticky card's. */
  sticky?: boolean;
}) {
  const label = written(eyebrow);
  const title = written(heading);
  const lead = written(intro);
  if (label === null && title === null && lead === null) return null;
  return (
    <div className={cn(centred && "mx-auto max-w-2xl text-center", sticky && LANDING_STICKY_WORDS)}>
      {label !== null && <Eyebrow>{label}</Eyebrow>}
      {title !== null && (
        <div className={cn(label !== null && "mt-4")}>
          <Heading level={2} step="display" align={centred ? "center" : "start"}>
            {title}
          </Heading>
        </div>
      )}
      {lead !== null && <p className="mt-4 text-muted-foreground">{lead}</p>}
    </div>
  );
}
