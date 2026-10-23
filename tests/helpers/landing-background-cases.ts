import type { Json } from "@/types/database.types";
import { everySection } from "./landing-required-text-cases";

/**
 * Cases for a landing section's background, whose shape is checked twice — by
 * the registry's section schemas and by SQL's `landing_sections_problem`. The
 * unit test holds the TypeScript half to each case's verdict and to the
 * background it reads, and the DB test holds the SQL half to the same verdict
 * on what the TypeScript half would store (its output where it accepts, the
 * raw structure where it refuses), so the two halves cannot drift without one
 * of them failing.
 *
 * The cases are generated from `everySection()`, one section of every type,
 * so a type added there is covered here too: each non-hero type is tried with
 * each value, with a wrong one and with none, which both halves refuse; the
 * hero with any background at all.
 */
export interface BackgroundCase {
  name: string;
  /** A whole structure: the hero, then the section under test unless it is the hero. */
  sections: Json;
  valid: boolean;
  /** The background the section under test reads as, where the case is valid. */
  reads?: "default" | "card";
}

/** A section with its background replaced, or removed when `undefined`. */
function withBackground(section: object, background: Json | undefined): Json {
  const entries = Object.entries(section).filter(([key]) => key !== "background");
  return Object.fromEntries(
    background === undefined ? entries : [...entries, ["background", background]],
  );
}

export function backgroundCases(): BackgroundCase[] {
  const sections = everySection();
  const hero = withBackground(sections[0], undefined);
  return sections.flatMap((section): BackgroundCase[] => {
    if (section.type === "hero") {
      return (["default", "card"] as const).map((background) => ({
        name: `the hero with background ${background}`,
        sections: [withBackground(section, background)],
        valid: false,
      }));
    }
    const page = (background: Json | undefined): Json => [
      hero,
      withBackground(section, background),
    ];
    return [
      { name: `${section.type} with no background`, sections: page(undefined), valid: false },
      { name: `${section.type} on default`, sections: page("default"), valid: true, reads: "default" },
      { name: `${section.type} on card`, sections: page("card"), valid: true, reads: "card" },
      { name: `${section.type} on a ground there is none of`, sections: page("tinted"), valid: false },
      { name: `${section.type} with a background that is not a word`, sections: page(1), valid: false },
      { name: `${section.type} with a null background`, sections: page(null), valid: false },
    ];
  });
}

/**
 * Every section but the hero on card, each beside the next: adjacent card
 * sections, the way an admin groups related ones, are allowed.
 */
export function adjacentCardSections(): Json {
  const [hero, ...rest] = everySection();
  return [
    hero,
    ...rest.map((section) => withBackground(section, "card")),
  ];
}
