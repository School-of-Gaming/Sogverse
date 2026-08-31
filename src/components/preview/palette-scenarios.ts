import type { YtyPalette } from "@/lib/constants/yty";

/**
 * The brand-draft axis, shared by every scene that carries one.
 *
 * The Guidebook's hues and faces are being judged against the ones they
 * replace, and the only honest comparison is the same page under each — so two
 * scenes (the home page and the gamer dashboard) grow a scenario that differs
 * from its sibling in nothing but the draft. One module owns which slug means
 * the draft, so a second scene joining the comparison cannot spell it
 * differently.
 *
 * **The draft scenario is the whole proposal, not one axis of it.** It carries
 * the Yty palette *and* the display-face swap together, because a scenario per
 * typeface would be two links whose difference has to be held in memory — and
 * the two changes cannot conflict for the reader's attention anyway (one is the
 * greeting's face, the other is a grid of cards further down). Anything else
 * the draft grows lands here too rather than forking a third scenario.
 *
 * Data-only and type-only in its import, so the registry beside it stays free
 * of React: `YtyPalette` is erased at compile time.
 *
 * All of this retires with the draft — once the tokens and faces promote there
 * is one palette, one face, and nothing to compare.
 */
export const BRAND_PALETTE_SCENARIO = {
  slug: "brand-palette",
  label: "Brand palette (draft)",
} as const;

/**
 * The same four families, spent at the marketing site's dose.
 *
 * The question the whole pass answers is whether this app can be as bright and
 * lively as sog.gg while keeping the dark ground — and that is a question about
 * *how much* colour, not which. So the draft is two scenarios rather than one:
 * `brand-palette` uses the palette as accents, `brand-lively` gives it whole
 * fields. Same hues, same contrast rules, different dose; the owner picks.
 *
 * **Both doses are flat.** There was a third scenario for a while — the lively
 * page with every two-hue blend taken out of it — because whether to keep
 * brand-hue gradients was an open ruling. It is no longer open: gradients smear
 * colours the palette no longer needs smeared, so flat is the drafts' default
 * and the flat scenario collapsed into this one. What survives of the question
 * is a single exhibit on the walkthrough's gradient slide, where the dusk hero
 * makes its own case beside the flat one.
 *
 * Home only. The gamer dashboard keeps its two scenarios, because the dose
 * question is about a marketing surface and that is not one.
 */
export const BRAND_LIVELY_SCENARIO = {
  slug: "brand-lively",
  label: "Brand palette, lively (draft)",
} as const;

export const CURRENT_PALETTE_SCENARIO = {
  slug: "current",
  label: "Current palette",
} as const;

/** Which palette a scenario slug asks for; anything else is the live one. */
export function ytyPaletteFor(scenario: string): YtyPalette {
  if (scenario === BRAND_LIVELY_SCENARIO.slug) return "brand-lively";
  return scenario === BRAND_PALETTE_SCENARIO.slug ? "brand" : "current";
}

/**
 * Which face a surface's own display heading is set in.
 *
 * `"display"` is Press Start 2P — `--font-display`, what every such heading
 * wears today — and `"mono"` is Space Mono, the Guidebook's in-platform voice.
 * The two are not interchangeable at one size: Press Start 2P advances a full
 * em per character and Space Mono about 0.6, so a surface that takes this prop
 * carries a size per face rather than a face alone.
 */
export type DisplayFace = "display" | "mono";

/** Which display face a scenario slug asks for; anything else is today's. */
export function displayFaceFor(scenario: string): DisplayFace {
  return scenario === BRAND_PALETTE_SCENARIO.slug ? "mono" : "display";
}

/**
 * The home scene's scenarios *are* the palette axis and nothing else: the page
 * has no data and no states, so there is nothing else for a scenario to vary.
 * Three of them, because one open question remains that a page cannot answer
 * twice in one render — how much colour, accented against lively. How the
 * colour is laid down is no longer an axis: both doses are flat.
 */
export const HOME_SCENARIOS = [
  CURRENT_PALETTE_SCENARIO.slug,
  BRAND_PALETTE_SCENARIO.slug,
  BRAND_LIVELY_SCENARIO.slug,
] as const;

export type HomeScenario = (typeof HOME_SCENARIOS)[number];

export function isHomeScenario(s: string): s is HomeScenario {
  return (HOME_SCENARIOS as readonly string[]).includes(s);
}
