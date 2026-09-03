import { z } from "zod";
import { Constants } from "@/types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import type { FeedSeat } from "./events";

/**
 * The sandbox family: a fake parent, their gamers, the products those gamers
 * hold seats on, and the seats themselves — one JSON document per admin,
 * standing behind a calendar-feed URL.
 *
 * **Why it exists.** A calendar client shows a feed's answer to a *change*:
 * a gamer joins a second club, a camp's dates move, a seat is cancelled
 * mid-term. Reproducing those against real customers means editing a real
 * family's data, and the poll that would reveal the result arrives minutes to
 * hours later from a vendor's servers. So the sandbox is a family an admin may
 * rewrite freely, stored in a row the feed route can read with no session.
 *
 * **Why a document and not tables.** Nothing here is a Sogverse entity: these
 * gamers have no accounts, these products no prices, these seats no
 * subscriptions. Inventing rows in the real tables would make every feature
 * that counts products or lists children learn to exclude them. The document
 * carries exactly what the feed's expansion consumes and nothing else.
 *
 * **The schema is parsed at both boundaries** — the API route parses what an
 * admin saves, and the feed route parses what it reads back — because the
 * column's only structural guarantee is that it holds an object. Everything
 * else is here.
 */

/** Bounds. A sandbox is one family, not a dataset. */
export const SANDBOX_LIMITS = {
  gamers: 6,
  products: 12,
  participations: 24,
  slotsPerProduct: 7,
  /** Longest any name in the document may be — a name, not a paragraph. */
  nameLength: 60,
} as const;

/**
 * The zones a sandbox product may be authored in.
 *
 * An enum rather than a free IANA string, because an unrecognised zone does not
 * degrade — it throws inside the occurrence walk, and it would do so in the
 * feed route, where the caller is a calendar client that can only report that
 * the subscription broke. These four are the zones products are actually
 * authored in plus UTC, which is the one worth comparing against.
 */
export const SANDBOX_TIMEZONES = [
  "Europe/Helsinki",
  "Europe/Stockholm",
  "Europe/Paris",
  "UTC",
] as const;

export type SandboxTimezone = (typeof SANDBOX_TIMEZONES)[number];

/** A seat is held or waited on; nothing else reaches a calendar. */
export const SANDBOX_PARTICIPATION_STATUSES = ["active", "waitlisted"] as const;

const shortText = z.string().trim().min(1).max(SANDBOX_LIMITS.nameLength);
const uuid = z.string().uuid();
/** A bare calendar date, the shape `products.start_date` carries. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A 24-hour wall clock, the shape the slot editor writes. */
const wallClock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const sandboxSlotSchema = z.object({
  /** 0 = Monday, matching `schedule_slots.weekday`. */
  weekday: z.number().int().min(0).max(6),
  startTime: wallClock,
  durationMinutes: z.number().int().min(15).max(600),
});

export const sandboxGamerSchema = z.object({
  id: uuid,
  firstName: shortText,
});

export const sandboxProductSchema = z.object({
  id: uuid,
  name: shortText,
  productType: z.enum(Constants.public.Enums.product_type),
  timezone: z.enum(SANDBOX_TIMEZONES),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  isRemote: z.boolean(),
  locationName: shortText.nullable(),
  spokenLanguage: z.enum(Constants.public.Enums.spoken_language),
  slots: z.array(sandboxSlotSchema).max(SANDBOX_LIMITS.slotsPerProduct),
});

export const sandboxParticipationSchema = z.object({
  id: uuid,
  gamerId: uuid,
  productId: uuid,
  status: z.enum(SANDBOX_PARTICIPATION_STATUSES),
  /** Whether a group was assigned. An unplaced seat has no page to link to. */
  placed: z.boolean(),
  /**
   * The paid-through instant of a canceling subscription, or `null`. Nothing
   * after it is enumerated — the same clamp the real feed applies to a family
   * whose subscription is winding down.
   */
  cancelsAt: z.string().datetime({ offset: true }).nullable(),
});

export const sandboxDefinitionSchema = z.object({
  parent: z.object({
    firstName: shortText,
    /** The locale the feed's own words are written in, as a profile's would be. */
    locale: z.enum(SUPPORTED_LOCALES),
  }),
  gamers: z.array(sandboxGamerSchema).max(SANDBOX_LIMITS.gamers),
  products: z.array(sandboxProductSchema).max(SANDBOX_LIMITS.products),
  participations: z
    .array(sandboxParticipationSchema)
    .max(SANDBOX_LIMITS.participations),
});

export type SandboxDefinition = z.infer<typeof sandboxDefinitionSchema>;
export type SandboxGamer = z.infer<typeof sandboxGamerSchema>;
export type SandboxProduct = z.infer<typeof sandboxProductSchema>;
export type SandboxParticipation = z.infer<typeof sandboxParticipationSchema>;
export type SandboxSlot = z.infer<typeof sandboxSlotSchema>;

/**
 * Fixture ids, generated once and pasted in.
 *
 * Never generated at module load or at render: a person who changes identity on
 * every reload destroys the one thing a fixture is for, and it would make the
 * seeded family a different family every time an admin pressed Reset. The
 * readable name lives in the key; the UUID stays the value.
 */
const IDS = {
  gamerAino: "0f2b8a1c-6d33-4e0a-9c15-2a7f4b6d1e83",
  gamerEino: "7c41d9e2-58b0-4a6f-8d23-91e0c5b74f6a",
  productClub: "b3e07a54-1f92-4c88-a0d6-3e5b91427cd1",
  productCamp: "5a9c2f18-84e6-4b31-9f7a-c26d08b53e94",
  productEvent: "e81f4d67-2c05-49ba-b3e8-70a19f6c2d45",
  seatAinoClub: "36d5b0c9-7e14-4af2-8b60-95c3e270d18f",
  seatAinoEvent: "9b6e73a0-4d28-4157-ae93-1c80f5b62a37",
  seatEinoClub: "c40a8e15-93b7-4d6c-82f1-5e7a06d34b92",
  seatEinoCamp: "1e75c3b8-0a49-4e2d-97f6-84b1d05a7c63",
} as const;

/** `YYYY-MM-DD`, `days` days after `from`, computed UTC-pinned. */
function shiftDate(from: Date, days: number): string {
  const shifted = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + days,
    ),
  );
  return shifted.toISOString().slice(0, 10);
}

/**
 * The family an admin meets on first open, and the one Reset restores.
 *
 * A plausible household rather than a minimal one: two children, a weekly club
 * with two sessions, a camp with a date range a month out and a one-date event
 * — which between them exercise every branch the expansion has (a run with no
 * end, a bounded run, a single occurrence) without anybody having to build one.
 *
 * Dates are relative to `now` so a sandbox opened next year still has sessions
 * ahead of it; the ids are not, so the same person keeps the same face.
 */
export function defaultSandboxDefinition(now: Date = new Date()): SandboxDefinition {
  const campStart = shiftDate(now, 30);
  const campEnd = shiftDate(now, 34);
  const eventDate = shiftDate(now, 14);

  return {
    parent: { firstName: "Sanna", locale: "en" },
    gamers: [
      { id: IDS.gamerAino, firstName: "Aino" },
      { id: IDS.gamerEino, firstName: "Eino" },
    ],
    products: [
      {
        id: IDS.productClub,
        name: "Tuesday and Thursday club",
        productType: "consumer_club",
        timezone: "Europe/Helsinki",
        startDate: null,
        endDate: null,
        isRemote: true,
        locationName: null,
        spokenLanguage: "en",
        slots: [
          { weekday: 1, startTime: "16:30", durationMinutes: 90 },
          { weekday: 3, startTime: "16:30", durationMinutes: 90 },
        ],
      },
      {
        id: IDS.productCamp,
        name: "Autumn build camp",
        productType: "camp",
        timezone: "Europe/Helsinki",
        startDate: campStart,
        endDate: campEnd,
        isRemote: false,
        locationName: "Tapiola school",
        spokenLanguage: "fi",
        slots: [
          { weekday: 0, startTime: "09:00", durationMinutes: 300 },
          { weekday: 1, startTime: "09:00", durationMinutes: 300 },
          { weekday: 2, startTime: "09:00", durationMinutes: 300 },
          { weekday: 3, startTime: "09:00", durationMinutes: 300 },
          { weekday: 4, startTime: "09:00", durationMinutes: 300 },
        ],
      },
      {
        id: IDS.productEvent,
        name: "Family tournament evening",
        productType: "event",
        timezone: "Europe/Helsinki",
        startDate: eventDate,
        endDate: eventDate,
        isRemote: true,
        locationName: null,
        spokenLanguage: "en",
        slots: [
          {
            // The event's own weekday, so its single slot lands on its date.
            weekday: weekdayOf(eventDate),
            startTime: "18:00",
            durationMinutes: 120,
          },
        ],
      },
    ],
    participations: [
      {
        id: IDS.seatAinoClub,
        gamerId: IDS.gamerAino,
        productId: IDS.productClub,
        status: "active",
        placed: true,
        cancelsAt: null,
      },
      {
        id: IDS.seatAinoEvent,
        gamerId: IDS.gamerAino,
        productId: IDS.productEvent,
        status: "active",
        placed: true,
        cancelsAt: null,
      },
      {
        id: IDS.seatEinoClub,
        gamerId: IDS.gamerEino,
        productId: IDS.productClub,
        status: "active",
        placed: true,
        cancelsAt: null,
      },
      {
        id: IDS.seatEinoCamp,
        gamerId: IDS.gamerEino,
        productId: IDS.productCamp,
        status: "active",
        placed: false,
        cancelsAt: null,
      },
    ],
  };
}

/**
 * The 0 = Monday weekday of a bare `YYYY-MM-DD` date.
 *
 * UTC-pinned end to end: the string is parsed at UTC midnight and read back
 * with `getUTCDay`, so it names the same weekday whatever zone the runtime is
 * in. A bare date has no clock face, so it never converts.
 */
function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The sandbox family as the seats the feed's expansion consumes.
 *
 * The same shape the real customer read produces, so the occurrence walk, the
 * event builder and the `.ics` writer are identical on both paths and cannot
 * disagree about what the sandbox says.
 *
 * Only **active** seats survive, exactly as the real query's `status` filter
 * does: a waitlist place is not a session anybody attends, and putting one in a
 * calendar would tell a family they have somewhere to be. A seat naming a gamer
 * or a product the document no longer holds is dropped for the same reason — a
 * document mid-edit is not a reason to serve a nameless event.
 */
export function sandboxToFeedSeats(
  definition: SandboxDefinition,
): FeedSeat[] {
  const gamers = new Map(definition.gamers.map((gamer) => [gamer.id, gamer]));
  const products = new Map(
    definition.products.map((product) => [product.id, product]),
  );

  const seats: FeedSeat[] = [];
  for (const participation of definition.participations) {
    if (participation.status !== "active") continue;
    const gamer = gamers.get(participation.gamerId);
    const product = products.get(participation.productId);
    if (gamer === undefined || product === undefined) continue;

    seats.push({
      participationId: participation.id,
      participantId: gamer.id,
      gamerName: gamer.firstName,
      isPlaced: participation.placed,
      productType: product.productType,
      productName: product.name,
      timezone: product.timezone,
      startDate: product.startDate,
      endDate: product.endDate,
      isRemote: product.isRemote,
      locationName: product.locationName,
      spokenLanguageCode: product.spokenLanguage,
      slots: product.slots,
      cancelsAt:
        participation.cancelsAt === null
          ? null
          : new Date(participation.cancelsAt),
    });
  }
  return seats;
}
