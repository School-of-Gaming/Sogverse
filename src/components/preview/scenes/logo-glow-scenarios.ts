/**
 * TEMP: logo-glow exploration — strip before merge (this whole file).
 *
 * Lives apart from the scene so the server-side renderer can call the guard:
 * the scene is a client module, and a client export cannot be invoked on the
 * server — the same split every other scene makes by keeping its guard in a
 * fixtures module.
 */

export const LOGO_GLOW_SCENARIOS = ["signed-out", "parent"] as const;
export type LogoGlowScenario = (typeof LOGO_GLOW_SCENARIOS)[number];

export function isLogoGlowScenario(value: string): value is LogoGlowScenario {
  return (LOGO_GLOW_SCENARIOS as readonly string[]).includes(value);
}
