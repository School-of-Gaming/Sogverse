import type {
  GeduInvoicingGedu,
  GeduInvoicingGroup,
  GeduInvoicingProduct,
  GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing";

/**
 * Fixtures for the gedu invoicing preview scenes: one month as the RPC would
 * hand it over, invented in the shape of production.
 *
 * **A document, not a view** — it satisfies `geduInvoicingSnapshot`, and every
 * figure a scene prints comes out of the same pure builder the live document
 * goes through. **Deterministic**: one pinned instant, one fixed month, literal
 * dates. The names are plausible and nobody's.
 *
 * Every state the builder distinguishes is in the one month: paid seats in
 * both roles, a sub paid in the role they covered, a covered absence and an
 * uncovered one, a missed session, a cancellation, a row written ahead of its
 * date, a club whose fee nobody set, and both subtotals.
 */

/** Thursday 21 May 2026, mid-morning in Helsinki. */
export const GEDU_INVOICING_NOW = new Date("2026-05-21T10:40:00+03:00");

/** The month the scenes open on, and the only month with anything in it. */
export const GEDU_INVOICING_WORKING_MONTH = "2026-05-01";

const HELSINKI = "Europe/Helsinki";
const TERM_START = "2026-01-12";
const TERM_END = "2026-05-29";

/** Real UUIDs, because a gedu's avatar is drawn from their id. */
const AINO = "e81482ad-e9b5-4c89-9d4c-255be2720d4c";
const MIKAEL = "ef8672a8-055a-430f-87d1-75c9ceb53016";
const SARA = "b33dd440-0dac-4f04-888a-ffc478dbfcdb";

/** The gedu the gedu-side scene is signed in as. */
export const GEDU_INVOICING_VIEWER_ID = AINO;

const PEOPLE = {
  aino: { id: AINO, first_name: "Aino", last_name: "Kallio" },
  mikael: { id: MIKAEL, first_name: "Mikael", last_name: "Rinne" },
  sara: { id: SARA, first_name: "Sara", last_name: "Vuorela" },
} as const;

const PRODUCTS: GeduInvoicingProduct[] = [
  {
    // Mondays: 4, 11, 18, 25 May.
    id: "preview-kivikko",
    product_type: "municipality_club",
    timezone: HELSINKI,
    start_date: TERM_START,
    end_date: TERM_END,
    primary_gedu_fee_cents: 6_500,
    assistant_gedu_fee_cents: 4_500,
    product_translations: [{ locale: "fi", name: "Pelikerho Kivikko" }],
    schedule_slots: [{ weekday: 0, start_time: "14:15", duration_minutes: 75 }],
    location: {
      id: "preview-loc-kivikko",
      name: "Kivikonrinteen koulu",
      name_i18n: null,
      type: "site",
    },
    municipality: { id: "preview-loc-espoo", name: "Espoo", name_i18n: { sv: "Esbo" } },
  },
  {
    // Wednesdays: 6, 13, 20, 27 May. Nobody has set the primary fee.
    id: "preview-mantyranta",
    product_type: "municipality_club",
    timezone: HELSINKI,
    start_date: TERM_START,
    end_date: TERM_END,
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: 4_500,
    product_translations: [{ locale: "fi", name: "Rakentajakerho Mäntyranta" }],
    schedule_slots: [{ weekday: 2, start_time: "15:00", duration_minutes: 90 }],
    location: {
      id: "preview-loc-mantyranta",
      name: "Mäntyrannan koulu",
      name_i18n: null,
      type: "site",
    },
    municipality: { id: "preview-loc-vantaa", name: "Vantaa", name_i18n: { sv: "Vanda" } },
  },
  {
    // Tuesdays: 5, 12, 19, 26 May. An online consumer club, two groups.
    id: "preview-seikkailijat",
    product_type: "consumer_club",
    timezone: HELSINKI,
    start_date: TERM_START,
    end_date: null,
    primary_gedu_fee_cents: 5_000,
    assistant_gedu_fee_cents: 3_500,
    product_translations: [
      { locale: "fi", name: "Minecraft-seikkailijat" },
      { locale: "en", name: "Minecraft adventurers" },
    ],
    schedule_slots: [{ weekday: 1, start_time: "17:00", duration_minutes: 60 }],
    location: null,
    municipality: null,
  },
];

const GROUPS: GeduInvoicingGroup[] = [
  {
    id: "preview-group-kivikko",
    product_id: "preview-kivikko",
    name: "Ryhmä A",
    sessions: ["2026-05-04", "2026-05-11", "2026-05-18"],
    cancelled_sessions: [],
  },
  {
    id: "preview-group-mantyranta",
    product_id: "preview-mantyranta",
    name: "Ryhmä A",
    sessions: ["2026-05-06", "2026-05-20"],
    cancelled_sessions: ["2026-05-13"],
  },
  {
    // The 12th passed with no row: Aino's missed session.
    id: "preview-group-seikkailijat-1",
    product_id: "preview-seikkailijat",
    name: "Group 1",
    sessions: ["2026-05-05", "2026-05-19"],
    cancelled_sessions: [],
  },
  {
    // The 26th carries a note written ahead of its date: upcoming, not paid.
    id: "preview-group-seikkailijat-2",
    product_id: "preview-seikkailijat",
    name: "Group 2",
    sessions: ["2026-05-05", "2026-05-12", "2026-05-19", "2026-05-26"],
    cancelled_sessions: [],
  },
];

const GEDUS: GeduInvoicingGedu[] = [
  {
    ...PEOPLE.aino,
    assignments: [
      { group_id: "preview-group-kivikko", role: "primary" },
      { group_id: "preview-group-seikkailijat-1", role: "primary" },
    ],
    substitutions: [],
    absences: [
      {
        request_id: "preview-request-aino-11",
        group_id: "preview-group-kivikko",
        session_date: "2026-05-11",
        role: "primary",
        status: "substituted",
        substitute: PEOPLE.mikael,
      },
    ],
  },
  {
    ...PEOPLE.mikael,
    assignments: [
      { group_id: "preview-group-mantyranta", role: "primary" },
      { group_id: "preview-group-seikkailijat-2", role: "assistant" },
    ],
    substitutions: [
      {
        request_id: "preview-request-aino-11",
        group_id: "preview-group-kivikko",
        session_date: "2026-05-11",
        role: "primary",
        absent_gedu: PEOPLE.aino,
      },
    ],
    absences: [],
  },
  {
    ...PEOPLE.sara,
    assignments: [{ group_id: "preview-group-kivikko", role: "assistant" }],
    substitutions: [],
    // Nobody picked it up.
    absences: [
      {
        request_id: "preview-request-sara-04",
        group_id: "preview-group-kivikko",
        session_date: "2026-05-04",
        role: "assistant",
        status: "open",
        substitute: null,
      },
    ],
  },
];

/**
 * One month of gedu invoicing, for the month asked for — the working month has
 * everything, every other month is empty. `geduId` narrows it to one gedu, the
 * way `get_my_gedu_invoicing` answers: the same document with a single gedu
 * and only the groups and products their seats touch.
 */
export function geduInvoicingMonthFixture(
  month: string,
  geduId?: string,
): GeduInvoicingSnapshot {
  if (month !== GEDU_INVOICING_WORKING_MONTH) {
    return { month_start: month, gedus: [], groups: [], products: [] };
  }
  const gedus =
    geduId === undefined ? GEDUS : GEDUS.filter((gedu) => gedu.id === geduId);
  const groupIds = new Set(
    gedus.flatMap((gedu) => [
      ...gedu.assignments.map((seat) => seat.group_id),
      ...gedu.substitutions.map((seat) => seat.group_id),
      ...gedu.absences.map((seat) => seat.group_id),
    ]),
  );
  const groups = GROUPS.filter((group) => groupIds.has(group.id));
  const productIds = new Set(groups.map((group) => group.product_id));
  return {
    month_start: GEDU_INVOICING_WORKING_MONTH,
    gedus,
    groups,
    products: PRODUCTS.filter((product) => productIds.has(product.id)),
  };
}

/**
 * The admin scene's one scenario. An empty month is not a second one: the
 * ledger carries a month stepper, and every month but the working one is empty,
 * so stepping off it is how the empty ledger is reached — on the same page.
 */
export const ADMIN_GEDU_INVOICING_SCENARIOS = ["working-month"] as const;

export type AdminGeduInvoicingPreviewScenario =
  (typeof ADMIN_GEDU_INVOICING_SCENARIOS)[number];

export function isAdminGeduInvoicingScenario(
  value: string,
): value is AdminGeduInvoicingPreviewScenario {
  return (ADMIN_GEDU_INVOICING_SCENARIOS as readonly string[]).includes(value);
}

/**
 * The gedu scene's scenarios are its viewers, because the gedu's own read
 * answers for one gedu and no single one of them holds every line kind: the
 * absent gedu carries a covered absence and a missed session, and the one who
 * covered carries the substitution, a cancellation and a club whose fee nobody
 * set. A different viewer is a state the page cannot show beside another.
 */
export const MY_GEDU_INVOICING_SCENARIOS = ["was-away", "stood-in"] as const;

export type MyGeduInvoicingPreviewScenario =
  (typeof MY_GEDU_INVOICING_SCENARIOS)[number];

/** Who each gedu scenario is signed in as. */
export const MY_GEDU_INVOICING_VIEWERS: Record<
  MyGeduInvoicingPreviewScenario,
  string
> = {
  "was-away": AINO,
  "stood-in": MIKAEL,
};

export function isMyGeduInvoicingScenario(
  value: string,
): value is MyGeduInvoicingPreviewScenario {
  return (MY_GEDU_INVOICING_SCENARIOS as readonly string[]).includes(value);
}

/** `YYYY-MM`, with the year inside this century — the live routes' own shape. */
const PREVIEW_MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

/**
 * Which month a scene is showing: the one its `?month=` names, or the working
 * month — the month the fixtures have anything in, rather than the live routes'
 * last month, because a scene that opened empty would show the reviewer
 * nothing.
 */
export function resolvePreviewGeduInvoicingMonth(raw: string | null): string {
  if (raw !== null && PREVIEW_MONTH_PARAM.test(raw)) return `${raw}-01`;
  return GEDU_INVOICING_WORKING_MONTH;
}
