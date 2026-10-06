import type { z } from "zod";
import type {
  LANDING_SECTIONS,
  LandingSectionOf,
  LandingSectionText,
  LandingSectionTexts,
  LandingSectionType,
} from "@/lib/landing-pages/sections";

/*
 * The per-type shapes every exhaustive section map in this directory is keyed
 * on — the renderer map and the SEO contribution map. Each map is declared as
 * a mapped type over `LandingSectionType`, so indexing it with a type
 * parameter gives that type's own entry, and a section of the stored union can
 * be dispatched through it without a cast (the call sites pass the section's
 * `type` beside the section, and TypeScript correlates the two).
 */

/** One section type's words in one language. Every field may be unwritten. */
export type LandingTextOf<Type extends LandingSectionType> = z.output<
  (typeof LANDING_SECTIONS)[Type]["text"]
>;

export type LandingSectionByType = {
  [Type in LandingSectionType]: LandingSectionOf<Type>;
};

export type LandingTextByType = {
  [Type in LandingSectionType]: LandingTextOf<Type>;
};

/**
 * A section's words in a version, or none written: the stored texts carry an
 * entry only for a section that has words, and every text field of every type
 * is optional, so an empty entry is a valid one for any type.
 */
export function landingSectionText(
  texts: LandingSectionTexts,
  sectionId: string,
): LandingSectionText {
  return Object.hasOwn(texts, sectionId) ? texts[sectionId] : {};
}

/** A text field holding something other than whitespace, trimmed; else null. */
export function written(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
