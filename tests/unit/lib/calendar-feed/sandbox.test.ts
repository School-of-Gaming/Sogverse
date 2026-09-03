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
   * keeps the same identity across reloads and screenshots — and an identicon
   * derived from those bytes keeps the same face.
   *
   * Pinned against copies of the source's own literals rather than against a
   * second call: two calls in one process agree perfectly well when a UUID
   * generator runs once at module load, which is the exact mistake this test
   * exists to catch. Changing a seeded id is therefore a deliberate edit in two
   * places, which is the intended cost.
   */
  it("hands out the ids its source pins, not generated ones", () => {
    const seeded = defaultSandboxDefinition(NOW);
    expect(seeded.gamers.map((gamer) => gamer.id)).toEqual([
      "0f2b8a1c-6d33-4e0a-9c15-2a7f4b6d1e83",
      "7c41d9e2-58b0-4a6f-8d23-91e0c5b74f6a",
    ]);
    expect(seeded.products.map((product) => product.id)).toEqual([
      "b3e07a54-1f92-4c88-a0d6-3e5b91427cd1",
      "5a9c2f18-84e6-4b31-9f7a-c26d08b53e94",
      "e81f4d67-2c05-49ba-b3e8-70a19f6c2d45",
    ]);
    expect(seeded.participations.map((seat) => seat.id)).toEqual([
      "36d5b0c9-7e14-4af2-8b60-95c3e270d18f",
      "9b6e73a0-4d28-4157-ae93-1c80f5b62a37",
      "c40a8e15-93b7-4d6c-82f1-5e7a06d34b92",
      "1e75c3b8-0a49-4e2d-97f6-84b1d05a7c63",
    ]);
  });
});

describe("the sandbox schema", () => {
  it("refuses a date that is shaped right but is not a real day", () => {
    const document = definition();
    document.products[0].startDate = "2026-13-45";
    const parsed = sandboxDefinitionSchema.safeParse(document);
    expect(parsed.success).toBe(false);
  });

  it("accepts a leap day in a leap year", () => {
    const document = definition();
    document.products[0].startDate = "2028-02-29";
    expect(sandboxDefinitionSchema.safeParse(document).success).toBe(true);
  });

  /**
   * Two seats sharing an id become two VEVENTs under one UID, and a calendar
   * client resolves that by dropping one — so the document is refused at the
   * save rather than the session vanishing where nobody can see it.
   */
  it("refuses a duplicate gamer id", () => {
    const document = definition();
    document.gamers.push({ ...document.gamers[0] });
    expect(sandboxDefinitionSchema.safeParse(document).success).toBe(false);
  });

  it("refuses a duplicate product id", () => {
    const document = definition();
    document.products.push({ ...document.products[0] });
    expect(sandboxDefinitionSchema.safeParse(document).success).toBe(false);
  });

  it("refuses a duplicate seat id", () => {
    const document = definition();
    document.participations.push({ ...document.participations[0] });
    expect(sandboxDefinitionSchema.safeParse(document).success).toBe(false);
  });

  it("accepts the same id in two different lists", () => {
    // Nothing looks a gamer up in the product map, so the ids are three
    // independent namespaces and a collision across them is not a defect.
    const document = definition();
    document.products[0].id = document.gamers[0].id;
    document.participations[0].productId = document.gamers[0].id;
    expect(sandboxDefinitionSchema.safeParse(document).success).toBe(true);
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
