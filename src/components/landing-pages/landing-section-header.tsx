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

/** A section's eyebrow, heading and intro, each drawn only when written. */
export function SectionHeader({
  eyebrow,
  heading,
  intro,
  centred = true,
  compact = false,
}: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  centred?: boolean;
  /** The heading a step down, as a card's: for a section drawn in a card. */
  compact?: boolean;
}) {
  const label = written(eyebrow);
  const title = written(heading);
  const lead = written(intro);
  if (label === null && title === null && lead === null) return null;
  return (
    <div className={cn(centred && "mx-auto max-w-2xl text-center")}>
      {label !== null && <Eyebrow>{label}</Eyebrow>}
      {title !== null && (
        <div className={cn(label !== null && "mt-4")}>
          <Heading level={2} step={compact ? "card-title" : "display"} align={centred ? "center" : "start"}>
            {title}
          </Heading>
        </div>
      )}
      {lead !== null && <p className="mt-4 text-muted-foreground">{lead}</p>}
    </div>
  );
}
