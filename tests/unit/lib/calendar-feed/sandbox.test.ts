import { describe, it, expect } from "vitest";
import { buildCalendarFeedEvents } from "@/lib/calendar-feed/events";
import {
  CALENDAR_FEED_DEFAULTS,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import {
  SANDBOX_LIMITS,
  defaultSandboxDefinition,
  sandboxDefinitionSchema,
  sandboxToFeedSeats,
  type SandboxDefinition,
} from "@/lib/calendar-feed/sandbox";
import { getCalendarFeedTranslator } from "@/lib/calendar-feed/translator";

/**
 * The sandbox half of the feed's two sources.
 *
 * The adapter is tested *through* the shared expansion rather than beside it,
 * because the only property worth proving is that a sandbox family behaves
 * exactly as a real one does — a test that stopped at the mapped seats would
 * pass while the pipeline behind it disagreed.
 */

const GAMER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PRODUCT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const SEAT = "cccccccc-3333-4333-8333-cccccccccccc";

/** A Monday, mid-morning, well inside the club's run. */
const NOW = new Date("2026-03-02T09:00:00Z");
const ORIGIN = "https://app.example.test";

function definition(
  overrides: Partial<SandboxDefinition["participations"][number]> = {},
): SandboxDefinition {
  return {
    parent: { firstName: "Sanna", locale: "en" },
    gamers: [{ id: GAMER, firstName: "Aino" }],
    products: [
      {
        id: PRODUCT,
        name: "Monday club",
        productType: "consumer_club",
        timezone: "Europe/Helsinki",
        startDate: null,
        endDate: null,
        isRemote: true,
        locationName: null,
        spokenLanguage: "en",
        slots: [{ weekday: 0, startTime: "16:30", durationMinutes: 90 }],
      },
    ],
    participations: [
      {
        id: SEAT,
        gamerId: GAMER,
        productId: PRODUCT,
        status: "active",
        placed: true,
        cancelsAt: null,
        ...overrides,
      },
    ],
  };
}

async function eventsFor(
  document: SandboxDefinition,
  options: Partial<CalendarFeedOptions> = {},
) {
  const translate = await getCalendarFeedTranslator("en");
  return buildCalendarFeedEvents({
    seats: sandboxToFeedSeats(document),
    options: { ...CALENDAR_FEED_DEFAULTS, ...options },
    translate,
    locale: "en",
    origin: ORIGIN,
    now: NOW,
  });
}

describe("the seeded sandbox family", () => {
  it("parses through its own schema", () => {
    const parsed = sandboxDefinitionSchema.safeParse(
      defaultSandboxDefinition(NOW),
    );
    expect(parsed.success).toBe(true);
  });

  it("stays inside every bound the schema sets", () => {
    const seeded = defaultSandboxDefinition(NOW);
    expect(seeded.gamers.length).toBeLessThanOrEqual(SANDBOX_LIMITS.gamers);
    expect(seeded.products.length).toBeLessThanOrEqual(SANDBOX_LIMITS.products);
    expect(seeded.participations.length).toBeLessThanOrEqual(
      SANDBOX_LIMITS.participations,
    );
    for (const product of seeded.products) {
      expect(product.slots.length).toBeLessThanOrEqual(
        SANDBOX_LIMITS.slotsPerProduct,
      );
    }
  });

  it("names every seat's gamer and product, so nothing is dropped silently", () => {
    const seeded = defaultSandboxDefinition(NOW);
    expect(sandboxToFeedSeats(seeded)).toHaveLength(
      seeded.participations.length,
    );
  });

  /**
   * The fixture ids are literals rather than generated, so the same person
   * keeps the same identity across reloads and screenshots. Two calls a moment
   * apart proving equal is what would fail the day somebody reaches for a UUID
   * generator at module load.
   */
  it("hands out the same ids every time", () => {
    expect(defaultSandboxDefinition(NOW).gamers).toEqual(
      defaultSandboxDefinition(NOW).gamers,
    );
  });
});

describe("sandboxToFeedSeats", () => {
  it("expands a placed, active seat into sessions", async () => {
    const events = await eventsFor(definition());
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].summary).toBe("Monday club – Aino");
    expect(events[0].gamerName).toBe("Aino");
  });

  it("emits nothing for a waitlisted seat", async () => {
    expect(sandboxToFeedSeats(definition({ status: "waitlisted" }))).toEqual([]);
    expect(await eventsFor(definition({ status: "waitlisted" }))).toEqual([]);
  });

  it("clamps a seat to its cancels-at instant", async () => {
    // Nothing is paid for after this, so the walk emits no occurrence at all —
    // neither ahead of the poll nor in its one-week look-back.
    const events = await eventsFor(
      definition({ cancelsAt: "2026-01-05T00:00:00.000Z" }),
    );
    expect(events).toEqual([]);
  });

  it("links a placed seat under details=full", async () => {
    const events = await eventsFor(definition(), { details: "full" });
    expect(events[0].url?.startsWith(ORIGIN)).toBe(true);
    expect(events[0].url).toContain(SEAT);
  });

  it("gives an unplaced seat no link, even under details=full", async () => {
    const events = await eventsFor(definition({ placed: false }), {
      details: "full",
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].url).toBeNull();
  });

  it("drops a seat naming a gamer the document no longer holds", () => {
    const document = definition();
    document.gamers = [];
    expect(sandboxToFeedSeats(document)).toEqual([]);
  });

  it("drops a seat naming a product the document no longer holds", () => {
    const document = definition();
    document.products = [];
    expect(sandboxToFeedSeats(document)).toEqual([]);
  });
});
