import type { YtyPalette } from "@/lib/constants/yty";

/**
 * The palette-comparison axis, shared by every scene that carries one.
 *
 * The brand's Yty hues are being judged against the ones they replace, and the
 * only honest comparison is the same page under each — so two scenes (the home
 * page and the gamer dashboard) grow a scenario that differs from its sibling
 * in nothing but the palette. One module owns which slug means the draft, so a
 * second scene joining the comparison cannot spell it differently.
 *
 * Data-only and type-only in its import, so the registry beside it stays free
 * of React: `YtyPalette` is erased at compile time.
 *
 * All of this retires with the draft palette — once the tokens promote there is
 * one palette again and nothing to compare.
 */
export const BRAND_PALETTE_SCENARIO = {
  slug: "brand-palette",
  label: "Brand palette (draft)",
} as const;

export const CURRENT_PALETTE_SCENARIO = {
  slug: "current",
  label: "Current palette",
} as const;

/** Which palette a scenario slug asks for; anything else is the live one. */
export function ytyPaletteFor(scenario: string): YtyPalette {
  return scenario === BRAND_PALETTE_SCENARIO.slug ? "brand" : "current";
}

/**
 * The home scene's scenarios *are* the palette axis and nothing else: the page
 * has no data and no states, so there is nothing else for a scenario to vary.
 */
export const HOME_SCENARIOS = [
  CURRENT_PALETTE_SCENARIO.slug,
  BRAND_PALETTE_SCENARIO.slug,
] as const;

export type HomeScenario = (typeof HOME_SCENARIOS)[number];

export function isHomeScenario(s: string): s is HomeScenario {
  return (HOME_SCENARIOS as readonly string[]).includes(s);
}
