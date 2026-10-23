import type { ReactNode } from "react";
import { Heading } from "@sog/ui";

/**
 * The act phrase of a public index page's headline: the `act` tag of its rich
 * message, rendered in the one accent the hero treatment allows.
 */
export function actPhrase(chunks: ReactNode) {
  return <span className="text-act">{chunks}</span>;
}

/**
 * **The header the public index pages share** — the Library, the Team and the
 * landing pages' index. The public-page headline treatment, kept compact
 * because the list is what each page is for: the headline centred, one phrase
 * in act (`actPhrase`), the world rule beneath it running exactly the
 * headline's measure, and the intro left-aligned under it.
 */
export function PublicIndexHeader({
  title,
  intro,
}: {
  /** The headline, its act phrase already rendered. */
  title: ReactNode;
  intro: string;
}) {
  return (
    <header>
      {/* The headline and its rule are centred; the wrapper shrinks to the
          headline's longest line, so the rule runs exactly its measure. */}
      <div className="mx-auto w-fit text-center">
        <Heading level={1} step="hero" align="center">
          {title}
        </Heading>
        <span aria-hidden className="mt-4 block h-1.5 w-full rounded-full bg-world" />
      </div>
      <p className="mt-5 text-base text-muted-foreground sm:text-lg">{intro}</p>
    </header>
  );
}
