import type { SessionFacts } from "@/lib/substitution-session-facts";

/**
 * One session's facts, as a substitution surface's view model carries them —
 * an in-person Helsinki club on a Monday, 17:00–18:30, unless overridden.
 *
 * For the component tests that build a view model by hand rather than through
 * a mapping; a test about the derivation itself builds it from a product.
 */
export function sessionFacts(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    sessionDate: "2026-08-17",
    timezone: "Europe/Helsinki",
    startsAt: new Date("2026-08-17T17:00:00+03:00"),
    endsAt: new Date("2026-08-17T18:30:00+03:00"),
    productName: "Minecraft-klubi Espoo",
    productType: "consumer_club",
    topic: "minecraft_java",
    spokenLanguageCode: "fi",
    isRemote: false,
    siteName: "Sellon kirjasto, Espoo",
    ...overrides,
  };
}
