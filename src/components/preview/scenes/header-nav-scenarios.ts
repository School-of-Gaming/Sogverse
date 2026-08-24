/**
 * TEMP: header-nav exploration — strip before merge (this whole file).
 *
 * Lives apart from the scene so the server-side renderer can call the guard:
 * the scene is a client module, and a client export cannot be invoked on the
 * server — the same split every other scene makes by keeping its guard in a
 * fixtures module.
 */

export const HEADER_NAV_SCENARIOS = [
  "full-width",
  "phone-widths",
  "sm-breakpoint",
] as const;
export type HeaderNavScenario = (typeof HEADER_NAV_SCENARIOS)[number];

export function isHeaderNavScenario(value: string): value is HeaderNavScenario {
  return (HEADER_NAV_SCENARIOS as readonly string[]).includes(value);
}
