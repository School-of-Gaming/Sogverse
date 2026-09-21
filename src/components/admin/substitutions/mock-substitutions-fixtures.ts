import type {
  AdminOpenSubstitutionRequest,
  AdminResolvedSubstitution,
  AdminSubstitutionQueue,
} from "@/services/session-substitution";

/**
 * Fixtures for the Substitutions preview scene.
 *
 * **They are the wire document, not the view model.** The scene hands them to
 * the live mapping, so the sort, the urgency threshold, the occurrence
 * resolution and the zone line are all the real ones under the preview —
 * a fixture shaped like the already-mapped page would show those four things
 * as whatever it asserted them to be.
 */

export const ADMIN_SUBSTITUTIONS_SCENARIOS = ["queue", "all-clear"] as const;

export type AdminSubstitutionsScenario =
  (typeof ADMIN_SUBSTITUTIONS_SCENARIOS)[number];

export function isAdminSubstitutionsScenario(
  value: string,
): value is AdminSubstitutionsScenario {
  return (ADMIN_SUBSTITUTIONS_SCENARIOS as readonly string[]).includes(value);
}

/**
 * The scene's clock: Monday 17 August 2026, 09:20 in Helsinki — the same
 * instant the admin dashboard scene is pinned to, so the two previews describe
 * one morning.
 *
 * Pinned rather than live because every case on this page is arithmetic against
 * a known instant: which sessions are inside the urgent day, which fortnight
 * the settled rows fall in, which order the two same-day requests come out in.
 */
export const ADMIN_SUBSTITUTIONS_NOW = new Date("2026-08-17T09:20:00+03:00");

/** The zone the previewing admin is reading in. */
export const ADMIN_SUBSTITUTIONS_TIMEZONE = "Europe/Helsinki";

/**
 * The people. Real, hardcoded UUIDs: every chip draws an identicon out of the
 * id's hex bytes, so a readable stand-in renders a degenerate face rather than
 * a different one. Never generated at render time.
 */
const PERSON_IDS = {
  miloKorhonen: "dc5d2ed1-5498-450a-8db1-dad9701d10cd",
  siiriLaine: "174ab045-c53d-45e0-86e2-7281d1a7fe24",
  veetiAaltonen: "1832e0a5-1359-49cf-951f-f0507a42e288",
  eeliVirtanen: "2ca12e82-5101-4b6c-aa4d-85867c24fe4c",
  saanaNieminen: "ea0111ac-09ed-438c-85ef-f9f138b00209",
  aaroHeikkila: "6b6dd07a-63be-4292-a320-f4670784c45c",
} as const;

/** 0 = Monday, the app's own convention. */
const MON = 0;
const TUE = 1;
const WED = 2;
const FRI = 4;

type WireProduct = AdminOpenSubstitutionRequest["product"];

function product(args: {
  id: string;
  name: string;
  productType: WireProduct["product_type"];
  timezone: string;
  slots: readonly { weekday: number; startTime: string; minutes: number }[];
}): WireProduct {
  return {
    id: args.id,
    product_type: args.productType,
    timezone: args.timezone,
    is_remote: true,
    translations: [{ locale: "en", name: args.name }],
    schedule_slots: args.slots.map((slot) => ({
      weekday: slot.weekday,
      start_time: slot.startTime,
      duration_minutes: slot.minutes,
    })),
  };
}

const ESPOO_CLUB = product({
  id: "consumer-club-1",
  name: "Minecraft-klubi Espoo",
  productType: "consumer_club",
  timezone: "Europe/Helsinki",
  slots: [{ weekday: MON, startTime: "17:00", minutes: 90 }],
});

/**
 * A club authored in Stockholm, which is what puts the zone line on the page:
 * every time here is the viewer's, and the abbreviation is how the page says
 * so. It is also what makes the sort visible — this club's Monday session
 * starts an hour before Espoo's in the reader's own clock, and the read
 * delivers it second.
 */
const STOCKHOLM_CLUB = product({
  id: "municipality-club-3",
  name: "Roblox-klubben Solna",
  productType: "municipality_club",
  timezone: "Europe/Stockholm",
  slots: [{ weekday: MON, startTime: "15:00", minutes: 60 }],
});

const VANTAA_CLUB = product({
  id: "consumer-club-4",
  name: "Fortnite-klubi Vantaa",
  productType: "consumer_club",
  timezone: "Europe/Helsinki",
  slots: [
    { weekday: TUE, startTime: "16:00", minutes: 90 },
    { weekday: FRI, startTime: "16:00", minutes: 90 },
  ],
});

/**
 * The camp whose block runs Monday to Wednesday — which is what makes the
 * orphan an orphan rather than a hand-set flag: the request below is dated on a
 * Tuesday the schedule no longer names, so the occurrence resolves to nothing
 * and the row states its date alone.
 */
const ROBLOX_CAMP = product({
  id: "camp-2",
  name: "Roblox Studio -leiri Espoo",
  productType: "camp",
  timezone: "Europe/Helsinki",
  slots: [
    { weekday: MON, startTime: "10:00", minutes: 300 },
    { weekday: WED, startTime: "10:00", minutes: 300 },
  ],
});

function offer(args: {
  id: string;
  geduId: string;
  first: string;
  last: string;
  certified: boolean;
  /** When an admin recorded the extract, as an instant, or null. */
  checkedAt: string | null;
}): AdminOpenSubstitutionRequest["offers"][number] {
  return {
    id: args.id,
    gedu_id: args.geduId,
    first_name: args.first,
    last_name: args.last,
    certified: args.certified,
    criminal_record_check_at: args.checkedAt,
    created_at: "2026-08-16T18:05:00+03:00",
  };
}

/**
 * Four sessions nobody is teaching, holding every state an open row can be in:
 * inside the urgent day and outside it, several offers and none at all, both
 * roles, and the orphan whose date the schedule no longer projects.
 *
 * They sit in one scenario rather than four because the page shows all of them
 * at once, which is the whole reason a scene is worth opening: adjacent states
 * compare themselves, states behind separate links are compared from memory.
 * The only state that cannot coexist with these is the empty queue, and that is
 * what `all-clear` is.
 *
 * **In the order the read delivers them** — session date, then product id, then
 * id — so the mapping's soonest-first sort has something real to do: the two
 * Monday sessions arrive Espoo-then-Solna and are shown the other way round,
 * because Solna's 15:00 is 16:00 where the reader is.
 */
const OPEN_REQUESTS: readonly AdminOpenSubstitutionRequest[] = [
  {
    id: "substitution-request-1",
    group_id: "group-espoo-a",
    group_name: "Ryhmä A",
    session_date: "2026-08-17",
    role: "primary",
    reason: "sick",
    reason_note: "Flunssa, takaisin maanantaina.",
    created_at: "2026-08-16T20:10:00+03:00",
    requested_by: PERSON_IDS.miloKorhonen,
    requested_by_first_name: "Milo",
    requested_by_last_name: "Korhonen",
    product: ESPOO_CLUB,
    offers: [
      offer({
        id: "substitution-offer-1",
        geduId: PERSON_IDS.eeliVirtanen,
        first: "Eeli",
        last: "Virtanen",
        certified: true,
        checkedAt: "2026-05-04T11:00:00+03:00",
      }),
      // Certified, no extract on record. The standing informs and gates
      // nothing — exactly as it does in the certification queue — so the row
      // is pressable and only the missing half is tinted.
      offer({
        id: "substitution-offer-2",
        geduId: PERSON_IDS.saanaNieminen,
        first: "Saana",
        last: "Nieminen",
        certified: true,
        checkedAt: null,
      }),
    ],
  },
  {
    id: "substitution-request-2",
    group_id: "group-solna-b",
    group_name: "Grupp B",
    session_date: "2026-08-17",
    role: "assistant",
    reason: "other",
    reason_note: null,
    created_at: "2026-08-16T21:40:00+03:00",
    requested_by: PERSON_IDS.siiriLaine,
    requested_by_first_name: "Siiri",
    requested_by_last_name: "Laine",
    product: STOCKHOLM_CLUB,
    offers: [
      // An offerer whose certification has been taken away since they
      // volunteered. Only an admin's own edit can produce it — the write
      // refuses an uncertified caller — and it is the whole reason the flag
      // rides on the offer rather than being assumed from the offer existing.
      offer({
        id: "substitution-offer-3",
        geduId: PERSON_IDS.aaroHeikkila,
        first: "Aaro",
        last: "Heikkilä",
        certified: false,
        checkedAt: "2026-04-20T09:30:00+03:00",
      }),
    ],
  },
  {
    id: "substitution-request-3",
    group_id: "group-vantaa-c",
    group_name: "Ryhmä C",
    session_date: "2026-08-21",
    role: "primary",
    reason: "other",
    reason_note: "Perhesyy.",
    created_at: "2026-08-15T12:00:00+03:00",
    requested_by: PERSON_IDS.veetiAaltonen,
    requested_by_first_name: "Veeti",
    requested_by_last_name: "Aaltonen",
    product: VANTAA_CLUB,
    offers: [
      offer({
        id: "substitution-offer-4",
        geduId: PERSON_IDS.eeliVirtanen,
        first: "Eeli",
        last: "Virtanen",
        certified: true,
        checkedAt: "2026-05-04T11:00:00+03:00",
      }),
    ],
  },
  {
    id: "substitution-request-4",
    group_id: "group-roblox-camp-1",
    group_name: "Ryhmä 1",
    // A Tuesday, on a camp that meets Monday and Wednesday: the orphan.
    session_date: "2026-08-25",
    role: "primary",
    reason: "sick",
    reason_note: null,
    created_at: "2026-08-14T08:30:00+03:00",
    requested_by: PERSON_IDS.miloKorhonen,
    requested_by_first_name: "Milo",
    requested_by_last_name: "Korhonen",
    product: ROBLOX_CAMP,
    offers: [],
  },
];

/**
 * The fortnight behind the queue: one session somebody stood in for, and one
 * where nobody had to.
 *
 * Both outcomes, because the difference between them is the whole of what this
 * list has to make legible — and the pair is the only thing on the page an
 * empty queue could not also show.
 */
const RECENT: readonly AdminResolvedSubstitution[] = [
  {
    id: "substitution-request-5",
    group_id: "group-espoo-a",
    group_name: "Ryhmä A",
    session_date: "2026-08-10",
    role: "primary",
    status: "substituted",
    reason: "sick",
    reason_note: null,
    created_at: "2026-08-09T19:00:00+03:00",
    approved_at: "2026-08-10T08:15:00+03:00",
    requested_by: PERSON_IDS.miloKorhonen,
    requested_by_first_name: "Milo",
    requested_by_last_name: "Korhonen",
    substitute_id: PERSON_IDS.saanaNieminen,
    substitute_first_name: "Saana",
    substitute_last_name: "Nieminen",
    product: ESPOO_CLUB,
  },
  {
    id: "substitution-request-6",
    group_id: "group-vantaa-c",
    group_name: "Ryhmä C",
    session_date: "2026-08-14",
    role: "assistant",
    status: "withdrawn",
    reason: "other",
    reason_note: null,
    created_at: "2026-08-12T10:00:00+03:00",
    approved_at: null,
    requested_by: PERSON_IDS.veetiAaltonen,
    requested_by_first_name: "Veeti",
    requested_by_last_name: "Aaltonen",
    substitute_id: null,
    substitute_first_name: null,
    substitute_last_name: null,
    product: VANTAA_CLUB,
  },
];

/**
 * The document the read would have returned, for one scenario.
 *
 * `all-clear` empties **both** lists: a platform with four sessions to staff has
 * no way to reach the queue's all-clear line, and a fortnight with something in
 * it has no way to show the settled list's absence.
 */
export function buildAdminSubstitutionsFixture(
  scenario: AdminSubstitutionsScenario,
): AdminSubstitutionQueue {
  if (scenario === "all-clear") return { open: [], recent: [] };
  // Copied out rather than handed over: the document's own type is mutable
  // (it is a zod output), and a fixture that let a caller write into the module
  // constant would leak one scene's edits into the next one opened.
  return { open: [...OPEN_REQUESTS], recent: [...RECENT] };
}
