import { describe, it, expect } from "vitest";
import {
  buildSessionFacts,
  sessionClockFace,
  sessionFactsProduct,
} from "@/lib/substitution-session-facts";
import type { SessionProductDocument } from "@/services/session-substitution";

/**
 * The one derivation every substitution surface describes a session through.
 *
 * 1. **Online or where has three answers, not two.** Remote; in person at a
 *    named site; and in person with no site recorded, which must stay in person
 *    — `siteName: null` alone never means online.
 * 2. **A remote product never carries a building**, whatever the row says.
 * 3. **An orphaned date keeps its date and loses its instants**, so every
 *    surface still shows it, by its date alone.
 * 4. **The name is the reader's locale's**, through the usual fallback.
 */

/** 0 = Monday, the app's own convention. 2026-08-17 is a Monday. */
const MONDAY = "2026-08-17";
const TUESDAY = "2026-08-18";

function document(
  overrides: Partial<SessionProductDocument> = {},
): SessionProductDocument {
  return {
    id: "consumer-club-1",
    product_type: "consumer_club",
    topic: "minecraft_java",
    spoken_language_code: "fi",
    timezone: "Europe/Helsinki",
    is_remote: false,
    start_date: null,
    end_date: null,
    site_name: "Sellon kirjasto, Espoo",
    translations: [
      { locale: "en", name: "Minecraft Club Espoo", description: "" },
      { locale: "fi", name: "Minecraft-klubi Espoo", description: "" },
    ],
    schedule_slots: [{ weekday: 0, start_time: "17:00", duration_minutes: 90 }],
    ...overrides,
  };
}

function facts(
  overrides: Partial<SessionProductDocument> = {},
  sessionDate = MONDAY,
) {
  return buildSessionFacts({
    product: sessionFactsProduct(document(overrides)),
    sessionDate,
    locale: "fi",
  });
}

describe("buildSessionFacts", () => {
  it("states an in-person session at its site, on the slot its date falls on", () => {
    const result = facts();

    expect(result).toMatchObject({
      sessionDate: MONDAY,
      timezone: "Europe/Helsinki",
      productName: "Minecraft-klubi Espoo",
      productType: "consumer_club",
      topic: "minecraft_java",
      spokenLanguageCode: "fi",
      isRemote: false,
      siteName: "Sellon kirjasto, Espoo",
    });
    expect(result.startsAt?.toISOString()).toBe("2026-08-17T14:00:00.000Z");
    expect(result.endsAt?.toISOString()).toBe("2026-08-17T15:30:00.000Z");
  });

  it("states a remote session as remote, never at a building", () => {
    // A remote municipality club can carry a location; it still has no venue.
    const result = facts({ is_remote: true, site_name: "Vantaan kaupungintalo" });

    expect(result.isRemote).toBe(true);
    expect(result.siteName).toBeNull();
  });

  it("keeps an in-person session with no site in person", () => {
    const result = facts({ is_remote: false, site_name: null });

    expect(result.isRemote).toBe(false);
    expect(result.siteName).toBeNull();
  });

  it("keeps an orphaned date's date and gives it no instants", () => {
    // The schedule meets on Mondays; a request on a Tuesday is an orphan.
    const result = facts({}, TUESDAY);

    expect(result.sessionDate).toBe(TUESDAY);
    expect(result.startsAt).toBeNull();
    expect(result.endsAt).toBeNull();
  });

  it("falls back to English for a locale the product has no name in", () => {
    const result = buildSessionFacts({
      product: sessionFactsProduct(document()),
      sessionDate: MONDAY,
      locale: "sv",
    });

    expect(result.productName).toBe("Minecraft Club Espoo");
  });
});

describe("sessionClockFace", () => {
  it("states the clock face in the zone it is asked for", () => {
    expect(sessionClockFace(facts(), "Europe/Helsinki")).toBe("17:00–18:30");
    expect(sessionClockFace(facts(), "Europe/Stockholm")).toBe("16:00–17:30");
  });

  it("states no time for an orphaned date", () => {
    expect(sessionClockFace(facts({}, TUESDAY), "Europe/Helsinki")).toBeNull();
  });
});
