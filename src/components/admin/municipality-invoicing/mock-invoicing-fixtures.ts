import { addCalendarDays, monthsAfter, weekdayOf } from "@/lib/calendar-date";
import type {
  MunicipalityInvoicingClub,
  MunicipalityInvoicingLocation,
  MunicipalityInvoicingScheduleSlot,
  MunicipalityInvoicingSession,
  MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";
import type { ProductStatus } from "@/types";

/**
 * Fixtures for the municipality invoicing preview scene: one month of a Finnish
 * spring term as the RPC would hand it over, invented in the *shape* of
 * production.
 *
 * **It is a document, not a view.** Everything here satisfies
 * `municipalityInvoicingSnapshot` — raw clubs, raw session rows, the current
 * fee, the location chain's two ends — and every number the page prints is
 * derived from it by the same pure builder the live route's document goes
 * through. A fixture of the *built* invoice would have been a fixture of the
 * arithmetic being reviewed, which is the one thing a scene must not fake.
 *
 * **Everything is deterministic.** No `Math.random`, no `Date.now`, no
 * `crypto.randomUUID`: the clock is one pinned instant (below), the month is a
 * fixed month around it, and every date is either a literal or weekly
 * arithmetic from one. A ledger whose set of missed sessions changed between two
 * reloads could not be compared with itself, and this page is read by comparing
 * figures.
 *
 * **The municipalities are real Finnish ones and nothing else is.** A
 * municipality is what a Finnish reader recognises the row by, so those are the
 * actual names (with the Swedish exonyms a `sv` reader gets, which is also what
 * makes the localized sort worth looking at). The school sites and the club
 * names are invented — plausible Finnish compounds rather than any club School
 * of Gaming actually runs, because a fixture naming a real customer's club is a
 * page that looks like live data.
 *
 * **Club ids are readable rather than UUIDs, on purpose.** Nothing on this page
 * hashes an id into a picture — the avatar-identicon rule that forces real
 * UUIDs elsewhere has nothing to key on here — and each id ends up in the
 * `href` of the club's link out to its admin product page, where a readable
 * `preview-…` slug makes it obvious that the link belongs to a fixture.
 */

/**
 * **Two scenarios, and they cannot coexist:** a month with a ledger in it and a
 * month with nothing in it are the same page in its two states.
 *
 * Everything else this page can show belongs in the working month and is in it —
 * every club state, every session state, the exclusion warning, the
 * no-municipality bucket — because states that share one render are compared
 * side by side, and states behind separate links are compared from memory.
 */
export const MUNICIPALITY_INVOICING_SCENARIOS = [
  "working-month",
  "empty-month",
] as const;

export type MunicipalityInvoicingPreviewScenario =
  (typeof MUNICIPALITY_INVOICING_SCENARIOS)[number];

export function isMunicipalityInvoicingScenario(
  value: string,
): value is MunicipalityInvoicingPreviewScenario {
  return (MUNICIPALITY_INVOICING_SCENARIOS as readonly string[]).includes(value);
}

/**
 * The zone every club in this fixture is authored in.
 *
 * Municipality clubs are Finnish by definition, so this is the one zone the
 * whole document is in: the session rows are Helsinki-local dates, the schedule
 * slots are Helsinki wall clocks, and the club's own "today" — the comparison
 * that decides what bills — resolves in it.
 */
export const MUNICIPALITY_INVOICING_TIMEZONE = "Europe/Helsinki";

/**
 * The pinned "now": Thursday 21 May 2026, mid-morning in Helsinki.
 *
 * A *fixed* instant rather than the live clock, unlike the family scenes next
 * door, because every state this page has is a statement about a date's position
 * relative to today: a Monday earlier in the month is either recorded or missed,
 * next Monday is upcoming, and today's own session is the one that bills the
 * moment it is written up. Derived from a live clock, the scene would show a
 * different set of those cases every day and none of them the set the design was
 * drawn against — and once the real month rolled past May the working month
 * would have no upcoming lines at all.
 *
 * Mid-month and mid-week on purpose: a Thursday leaves three weeks behind it and
 * a week and a half ahead of it inside one month, so recorded, missed and
 * upcoming lines all fit in every club's own detail table.
 *
 * The cost is honest and known: this date will one day be in the past, at which
 * point the scene is showing a historical month rather than rotting silently.
 */
export const MUNICIPALITY_INVOICING_NOW = new Date("2026-05-21T10:40:00+03:00");

/** The pinned now as the bare Helsinki calendar date it is. */
const TODAY = "2026-05-21";

/** The month the working scenario opens on, as its first day. */
const WORKING_MONTH = "2026-05-01";

/**
 * The month the empty scenario opens on: July, when no municipality club runs.
 *
 * An empty month is a real month rather than a contrivance — Finnish schools are
 * out, every spring term has ended and no autumn one has started — which is why
 * it is a different month rather than May with its clubs deleted. Nothing in it
 * is clocked: with no club there is no date to place on either side of today.
 */
const EMPTY_MONTH = "2026-07-01";

/** The ordinary spring term every club here runs, unless it says otherwise. */
const TERM_START = "2026-01-12";
const TERM_END = "2026-05-29";

/** Weekdays, in the `schedule_slots` convention: 0 = Monday … 6 = Sunday. */
const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const FRI = 4;

/**
 * The municipalities, each with the Swedish exonym where one exists.
 *
 * The overrides are the half of this worth looking at: the page sorts
 * municipalities by the name **the reader sees**, so switching the preview to
 * Swedish has to re-order Espoo, Helsinki, Turku and Porvoo into Esbo,
 * Helsingfors, Åbo and Borgå — and Åbo landing first is the check that the sort
 * is localized rather than sorting the stored names.
 */
const MUNICIPALITIES = {
  espoo: { name: "Espoo", sv: "Esbo" },
  helsinki: { name: "Helsinki", sv: "Helsingfors" },
  vantaa: { name: "Vantaa", sv: "Vanda" },
  tampere: { name: "Tampere", sv: null },
  turku: { name: "Turku", sv: "Åbo" },
  oulu: { name: "Oulu", sv: null },
  jyvaskyla: { name: "Jyväskylä", sv: null },
  kuopio: { name: "Kuopio", sv: null },
  lahti: { name: "Lahti", sv: null },
  joensuu: { name: "Joensuu", sv: null },
  rovaniemi: { name: "Rovaniemi", sv: null },
  porvoo: { name: "Porvoo", sv: "Borgå" },
} as const;

type MunicipalityKey = keyof typeof MUNICIPALITIES;

/** One club, in the vocabulary the wire document uses. */
interface ClubSpec {
  /** URL-safe and readable: it reaches the DOM only as the club's own link. */
  id: string;
  name: string;
  /** Null puts the club in the trailing "no municipality" bucket. */
  municipality: MunicipalityKey | null;
  /**
   * Where it meets, and as what kind of location. A `site` is a school hall; a
   * `municipality` is an online club pointing at the municipality itself, which
   * is why the invoice's walk up the chain is ancestor-or-*self*.
   */
  site: { name: string; type?: MunicipalityInvoicingLocation["type"] } | null;
  /** Current per-session fee in cents. Null is a fee nobody has filled in. */
  feeCents: number | null;
  status?: ProductStatus;
  startDate?: string;
  endDate?: string | null;
  /** Weekly slots. Empty is a club whose schedule was never filled in. */
  slots?: readonly { weekday: number; startTime: string }[];
  /** How many groups met on each recorded date. One unless stated. */
  groups?: number;
  /**
   * Projected dates that have passed and carry **no** stored row — the missed
   * sessions the club's own line reports in warning tone.
   */
  missedDates?: readonly string[];
  /**
   * Stored rows on dates outside the projection: an orphan the schedule does not
   * put there, a row saved ahead of its own session, or — for a club with no
   * projection at all — the whole of its evidence.
   */
  extraDates?: readonly string[];
}

/** The default slot length, so a spec line carries only what varies. */
const SESSION_MINUTES = 90;

/**
 * The working month's clubs: thirty-two of them across twelve municipalities and
 * the no-municipality bucket, weighted the way production is — most
 * municipalities with one or two clubs, a few with four to six.
 *
 * Every state the page can be in is somewhere in this list, and the comment on
 * each line is which one it is there for. The ordinary club — one slot, one
 * group, every past date written up — is deliberately the overwhelming majority,
 * because a fixture in which every row is interesting is a fixture that cannot
 * show what interesting looks like.
 */
const WORKING_MONTH_CLUBS: readonly ClubSpec[] = [
  // Espoo — six clubs, the month's largest total, and the club with no fee.
  {
    id: "preview-club-purola",
    name: "Peliklubi Purola",
    municipality: "espoo",
    site: { name: "Purolan koulu" },
    feeCents: 8000,
    slots: [{ weekday: MON, startTime: "15:00" }],
  },
  {
    id: "preview-club-havukallio",
    name: "Peliklubi Havukallio",
    municipality: "espoo",
    site: { name: "Havukallion koulu" },
    feeCents: 8000,
    slots: [{ weekday: TUE, startTime: "15:30" }],
    // One session nobody wrote up: the warning count on a club line.
    missedDates: ["2026-05-12"],
  },
  {
    id: "preview-club-niittyranta",
    name: "Peliklubi Niittyranta",
    municipality: "espoo",
    site: { name: "Niittyrannan koulu" },
    feeCents: 9500,
    slots: [{ weekday: WED, startTime: "14:45" }],
    // Two groups on every date: two stored rows collapsing to one billed
    // session, which is the invoice's rule rather than the data's.
    groups: 2,
  },
  {
    id: "preview-club-mantyviita",
    name: "Peliklubi Mäntyviita",
    municipality: "espoo",
    site: { name: "Mäntyviidan koulu" },
    feeCents: 7500,
    slots: [{ weekday: THU, startTime: "16:00" }],
    // A Saturday the schedule does not project, with a row on it: an orphan
    // that still bills, because records beat projections.
    extraDates: ["2026-05-16"],
  },
  {
    id: "preview-club-kaislaranta",
    name: "Peliklubi Kaislaranta",
    municipality: "espoo",
    site: { name: "Kaislarannan koulu" },
    // The fee nobody has filled in: "Fee not set" on the fee, on the total and
    // on every recorded row, and the club out of both totals above it.
    feeCents: null,
    slots: [{ weekday: FRI, startTime: "15:00" }],
  },
  {
    id: "preview-club-lehtikallio",
    name: "Peliklubi Lehtikallio",
    municipality: "espoo",
    site: { name: "Lehtikallion koulu" },
    feeCents: 10000,
    // The one club here that meets twice a week, so the schedule column has a
    // two-part cadence to draw.
    slots: [
      { weekday: MON, startTime: "17:00" },
      { weekday: WED, startTime: "17:00" },
    ],
  },

  // Helsinki — the long name, the club with no schedule, and a month of misses.
  {
    id: "preview-club-pohjois-kaarela",
    name: "Peliklubi Pohjois-Kaarelan yhtenäiskoulun iltapäiväryhmä",
    municipality: "helsinki",
    // Long on both axes on purpose: the name truncates in the club column and
    // the site name truncates in the detail's location line.
    site: { name: "Pohjois-Kaarelan yhtenäiskoulun monitoimisali ja kerhotila" },
    feeCents: 9000,
    slots: [{ weekday: TUE, startTime: "15:15" }],
  },
  {
    id: "preview-club-vuorenpeikko",
    name: "Peliklubi Vuorenpeikko",
    municipality: "helsinki",
    site: { name: "Vuorenpeikon koulu" },
    feeCents: 6500,
    slots: [{ weekday: WED, startTime: "15:00" }],
    // Every past date missed: a club that owes three write-ups and bills
    // nothing, which is the strongest thing on the page to notice.
    missedDates: ["2026-05-06", "2026-05-13", "2026-05-20"],
  },
  {
    id: "preview-club-sammalniitty",
    name: "Peliklubi Sammalniitty",
    municipality: "helsinki",
    site: { name: "Sammalniityn koulu" },
    feeCents: 7000,
    // No weekly slots at all — a schedule never filled in, or emptied after the
    // term began. No schedule summary, no projection, and it still bills its
    // rows.
    slots: [],
    extraDates: ["2026-05-07", "2026-05-14", "2026-05-21"],
  },
  {
    id: "preview-club-kivikouru",
    name: "Peliklubi Kivikouru",
    municipality: "helsinki",
    site: { name: "Kivikourun koulu" },
    feeCents: 8500,
    slots: [{ weekday: THU, startTime: "16:30" }],
    // A note written against next week's session. The row exists and the date
    // has not arrived, so the line is upcoming and the month does not bill it.
    extraDates: ["2026-05-28"],
  },
  {
    id: "preview-club-aallonharju",
    name: "Peliklubi Aallonharju",
    municipality: "helsinki",
    site: { name: "Aallonharjan koulu" },
    feeCents: 5500,
    slots: [{ weekday: FRI, startTime: "14:30" }],
  },

  // Vantaa — the two clubs that bill without projecting anything.
  {
    id: "preview-club-ruskolintu",
    name: "Peliklubi Ruskolintu",
    municipality: "vantaa",
    site: { name: "Ruskolinnun koulu" },
    feeCents: 7000,
    slots: [{ weekday: MON, startTime: "15:45" }],
  },
  {
    id: "preview-club-kartanonrinne",
    name: "Peliklubi Kartanonrinne",
    municipality: "vantaa",
    site: { name: "Kartanonrinteen koulu" },
    feeCents: 7000,
    slots: [{ weekday: TUE, startTime: "16:00" }],
    missedDates: ["2026-05-19"],
  },
  {
    id: "preview-club-lammaskoski",
    name: "Peliklubi Lammaskoski",
    municipality: "vantaa",
    site: { name: "Lammaskosken koulu" },
    feeCents: 6000,
    // Pending, and starting in August: nothing to project, and a stray row in
    // May all the same. It bills, and the schedule beside it claims nothing.
    status: "pending",
    startDate: "2026-08-17",
    endDate: null,
    slots: [{ weekday: WED, startTime: "15:00" }],
    extraDates: ["2026-05-13"],
  },
  {
    id: "preview-club-ilvesmaki",
    name: "Peliklubi Ilvesmäki",
    municipality: "vantaa",
    site: { name: "Ilvesmäen koulu" },
    feeCents: 6500,
    // Cancelled, with a row from before it was called off. Same shape as the
    // pending club: it bills its evidence and projects nothing.
    status: "cancelled",
    slots: [{ weekday: THU, startTime: "15:30" }],
    extraDates: ["2026-05-07"],
  },

  // Tampere — a term that ends inside the month.
  {
    id: "preview-club-vuoreskallio",
    name: "Peliklubi Vuoreskallio",
    municipality: "tampere",
    site: { name: "Vuoreskallion koulu" },
    feeCents: 9000,
    slots: [{ weekday: MON, startTime: "16:15" }],
  },
  {
    id: "preview-club-hallilanmaki",
    name: "Peliklubi Hallilanmäki",
    municipality: "tampere",
    site: { name: "Hallilanmäen koulu" },
    feeCents: 8000,
    // Completed on the 13th: the projection is clipped to the term's last day,
    // so this club has no upcoming line while every other Wednesday club does.
    status: "completed",
    endDate: "2026-05-13",
    slots: [{ weekday: WED, startTime: "15:00" }],
  },
  {
    id: "preview-club-pyynikinportti",
    name: "Peliklubi Pyynikinportti",
    municipality: "tampere",
    site: { name: "Pyynikinportin koulu" },
    feeCents: 7500,
    slots: [{ weekday: THU, startTime: "15:00" }],
    // The second two-group club, so the collapse can be checked twice.
    groups: 2,
  },
  {
    id: "preview-club-tesomanharju",
    name: "Peliklubi Tesomanharju",
    municipality: "tampere",
    site: { name: "Tesomanharjun koulu" },
    // The bottom of the fee range.
    feeCents: 4500,
    slots: [{ weekday: FRI, startTime: "14:00" }],
    missedDates: ["2026-05-01"],
  },

  // Turku
  {
    id: "preview-club-runosmaenranta",
    name: "Peliklubi Runosmäenranta",
    municipality: "turku",
    site: { name: "Runosmäenrannan koulu" },
    feeCents: 8000,
    slots: [{ weekday: TUE, startTime: "15:00" }],
  },
  {
    id: "preview-club-ilpoistenpuisto",
    name: "Peliklubi Ilpoistenpuisto",
    municipality: "turku",
    site: { name: "Ilpoistenpuiston koulu" },
    feeCents: 8000,
    slots: [{ weekday: WED, startTime: "16:00" }],
  },
  {
    id: "preview-club-kaskenniitty",
    name: "Peliklubi Kaskenniitty",
    municipality: "turku",
    site: { name: "Kaskenniityn koulu" },
    feeCents: 6000,
    slots: [{ weekday: THU, startTime: "15:45" }],
    missedDates: ["2026-05-14"],
  },

  // Oulu — the online club, pointing at the municipality itself.
  {
    id: "preview-club-toppilansalmi",
    name: "Peliklubi Toppilansalmi",
    municipality: "oulu",
    site: { name: "Toppilansalmen koulu" },
    feeCents: 7000,
    slots: [{ weekday: MON, startTime: "17:15" }],
  },
  {
    id: "preview-club-verkkoklubi-oulu",
    name: "Verkkoklubi Oulu",
    municipality: "oulu",
    // A remote club has no hall: its own location *is* the municipality, which
    // is the ancestor-or-self half of the invoice's walk up the chain.
    site: { name: "Oulu", type: "municipality" },
    feeCents: 6500,
    slots: [{ weekday: THU, startTime: "18:00" }],
  },

  // Jyväskylä
  {
    id: "preview-club-kuokkalanportti",
    name: "Peliklubi Kuokkalanportti",
    municipality: "jyvaskyla",
    site: { name: "Kuokkalanportin koulu" },
    feeCents: 7500,
    slots: [{ weekday: TUE, startTime: "16:30" }],
  },
  {
    id: "preview-club-keltinmaenrinne",
    name: "Peliklubi Keltinmäenrinne",
    municipality: "jyvaskyla",
    site: { name: "Keltinmäenrinteen koulu" },
    feeCents: 7500,
    slots: [{ weekday: FRI, startTime: "15:30" }],
    missedDates: ["2026-05-08"],
  },

  // Five municipalities with a single club each: the short section, which is
  // what the collapsed list mostly is in production.
  {
    id: "preview-club-rypysuonranta",
    name: "Peliklubi Rypysuonranta",
    municipality: "kuopio",
    site: { name: "Rypysuonrannan koulu" },
    feeCents: 8500,
    slots: [{ weekday: WED, startTime: "15:15" }],
  },
  {
    id: "preview-club-mukkulanharju",
    name: "Peliklubi Mukkulanharju",
    municipality: "lahti",
    site: { name: "Mukkulanharjun koulu" },
    feeCents: 6000,
    slots: [{ weekday: MON, startTime: "15:00" }],
  },
  {
    id: "preview-club-niinivaaranportti",
    name: "Peliklubi Niinivaaranportti",
    municipality: "joensuu",
    site: { name: "Niinivaaranportin koulu" },
    feeCents: 9500,
    slots: [{ weekday: THU, startTime: "16:00" }],
  },
  {
    id: "preview-club-ounasrinne",
    name: "Peliklubi Ounasrinne",
    municipality: "rovaniemi",
    site: { name: "Ounasrinteen koulu" },
    // The top of the fee range.
    feeCents: 10000,
    slots: [{ weekday: TUE, startTime: "17:00" }],
  },
  {
    id: "preview-club-nasinmaki",
    name: "Peliklubi Näsinmäki",
    municipality: "porvoo",
    site: { name: "Näsinmäen koulu" },
    feeCents: 7000,
    slots: [{ weekday: WED, startTime: "15:30" }],
  },

  // The trailing bucket: a club whose site hangs off nothing that is a
  // municipality, so there is nobody to invoice and the page says so.
  {
    id: "preview-club-kanervala",
    name: "Peliklubi Kanervala",
    municipality: null,
    site: { name: "Kanervalan kerhotila" },
    feeCents: 6500,
    slots: [{ weekday: MON, startTime: "16:45" }],
  },
];

/**
 * One month of `get_admin_municipality_invoicing`, as the route would have
 * fetched it.
 *
 * Pure and cheap: the rows are weekly arithmetic over thirty-two specs, and the
 * whole point of returning the wire document rather than a view is that the
 * scene's numbers come out of the same builder the live page's do.
 */
export function buildMunicipalityInvoicingFixture(
  scenario: MunicipalityInvoicingPreviewScenario,
): MunicipalityInvoicingSnapshot {
  if (scenario === "empty-month") {
    return { month_start: EMPTY_MONTH, clubs: [] };
  }
  return {
    month_start: WORKING_MONTH,
    clubs: WORKING_MONTH_CLUBS.map(buildClub),
  };
}

function buildClub(spec: ClubSpec): MunicipalityInvoicingClub {
  const startDate = spec.startDate ?? TERM_START;
  const endDate = spec.endDate === undefined ? TERM_END : spec.endDate;
  const status = spec.status ?? "running";
  const slots: MunicipalityInvoicingScheduleSlot[] = (spec.slots ?? []).map(
    (slot) => ({
      weekday: slot.weekday,
      start_time: slot.startTime,
      duration_minutes: SESSION_MINUTES,
    }),
  );

  const municipality = spec.municipality;

  return {
    id: spec.id,
    status,
    timezone: MUNICIPALITY_INVOICING_TIMEZONE,
    start_date: startDate,
    end_date: endDate,
    municipality_fee_cents: spec.feeCents,
    // One translation row, in Finnish, because a municipality club is authored
    // in Finnish and the resolver's fallback chain ends on whatever row is
    // there. A reader in any locale therefore sees the club's real name, which
    // is what a Finnish admin would see on the live page.
    product_translations: [{ locale: "fi", name: spec.name }],
    schedule_slots: slots,
    location:
      spec.site === null
        ? null
        : {
            id: `${spec.id}-location`,
            name: spec.site.name,
            name_i18n: null,
            type: spec.site.type ?? "site",
          },
    municipality:
      municipality === null
        ? null
        : {
            id: `preview-municipality-${municipality}`,
            name: MUNICIPALITIES[municipality].name,
            name_i18n:
              MUNICIPALITIES[municipality].sv === null
                ? null
                : { sv: MUNICIPALITIES[municipality].sv },
          },
    sessions: storedRows(spec, { startDate, endDate, status, slots }),
  };
}

/**
 * The stored session rows a club carries in the month — the raw table rows, one
 * per group and date, exactly as the RPC sends them.
 *
 * A row exists for every date the club's schedule projected that has arrived,
 * minus the ones the spec says nobody wrote up, plus whatever dates the spec
 * adds by hand. That last part is the whole of a club with no projection: a
 * pending or cancelled club, or one whose slots were never filled in, reaches
 * the invoice on its rows alone.
 */
function storedRows(
  spec: ClubSpec,
  context: {
    startDate: string;
    endDate: string | null;
    status: ProductStatus;
    slots: readonly MunicipalityInvoicingScheduleSlot[];
  },
): MunicipalityInvoicingSession[] {
  const missed = new Set(spec.missedDates ?? []);
  const dates = new Set(
    projectedDates(context).filter((date) => date <= TODAY && !missed.has(date)),
  );
  for (const date of spec.extraDates ?? []) dates.add(date);

  const groups = spec.groups ?? 1;
  return [...dates]
    .sort()
    .flatMap((date) =>
      Array.from({ length: groups }, (_unused, index) => ({
        group_id: `${spec.id}-group-${index + 1}`,
        session_date: date,
      })),
    );
}

/**
 * Every date the club's weekly slots put inside the working month, clipped to
 * its term — the same walk the invoice makes, because the fixture has to agree
 * with it about what "a date the schedule projects" means.
 *
 * A club that is neither running nor completed projects nothing, which is what
 * makes the pending and cancelled specs carry their rows by hand.
 */
function projectedDates({
  startDate,
  endDate,
  status,
  slots,
}: {
  startDate: string;
  endDate: string | null;
  status: ProductStatus;
  slots: readonly MunicipalityInvoicingScheduleSlot[];
}): string[] {
  if (status !== "running" && status !== "completed") return [];

  const monthEnd = addCalendarDays(monthsAfter(WORKING_MONTH, 1), -1);
  const from = startDate > WORKING_MONTH ? startDate : WORKING_MONTH;
  const until = endDate !== null && endDate < monthEnd ? endDate : monthEnd;
  if (from > until) return [];

  const dates = new Set<string>();
  for (const slot of slots) {
    const offset = (slot.weekday - weekdayOf(from) + 7) % 7;
    for (
      let date = addCalendarDays(from, offset);
      date <= until;
      date = addCalendarDays(date, 7)
    ) {
      dates.add(date);
    }
  }
  return [...dates];
}
