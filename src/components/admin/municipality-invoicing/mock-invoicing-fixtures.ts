import { addCalendarDays, monthsAfter, weekdayOf } from "@/lib/calendar-date";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
import type {
  MunicipalityInvoicingClub,
  MunicipalityInvoicingLocation,
  MunicipalityInvoicingScheduleSlot,
  MunicipalityInvoicingSession,
  MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";

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
 * names are invented — plausible Finnish compounds rather than any school or any
 * club School of Gaming actually runs, because a fixture naming a real
 * customer's club, or a real school, is a page that looks like live data. That
 * cuts both ways and has caught this file out once: three of the sites here were
 * lifted from real schools and had to be renamed, so a *plausible* compound is
 * the requirement and a *recognisable* one is the defect.
 *
 * **Every club belongs to a municipality, because the database refuses to answer
 * a month in which one does not.** There is no no-municipality club here to
 * render, and there is nowhere for one to go.
 *
 * **Club ids are readable rather than UUIDs, on purpose.** Nothing on this page
 * hashes an id into a picture — the avatar-identicon rule that forces real
 * UUIDs elsewhere has nothing to key on here — and each id ends up in the
 * `href` of the club's link out to its admin product page, where a readable
 * `preview-…` slug makes it obvious that the link belongs to a fixture.
 */

/**
 * **One scenario, because the month is a control on the page.**
 *
 * The other state this page has is a month with nothing in it, and that is not a
 * second scenario: the ledger carries a month stepper, so stepping off the
 * working month is how the reader reaches an empty one — on the same page, with
 * the same stepper, which is also the only way to see that the empty month
 * *steps back*. A scenario would have been a second link to a state the page can
 * already be driven into.
 *
 * Everything that can share one render is in the working month — every club
 * state, every session state, the exclusion warning — because states that share
 * a render are compared side by side, and states behind separate links are
 * compared from memory.
 */
export const MUNICIPALITY_INVOICING_SCENARIOS = ["working-month"] as const;

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
 * The month the scene opens on, and the only month it has clubs for.
 *
 * Exported because the scene's own link targets and the test that pins its month
 * resolution both have to name it, and a second literal spelling of the same
 * month is a fixture that can disagree with itself.
 */
export const MUNICIPALITY_INVOICING_WORKING_MONTH = WORKING_MONTH;

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

/**
 * The Fennoa customers these clubs are invoiced to.
 *
 * **A buyer is a customer, not a municipality, and five of the entries here
 * are the whole reason that distinction is in the schema.** Most municipalities
 * buy their clubs themselves and appear once. Tampere appears **twice** — two
 * departments buying under two agreements, which is the shape that makes a
 * per-municipality link impossible — and so does Helsinki, whose second
 * department buys the one club that recorded nothing all month. And one
 * association buys clubs sited in a municipality it is not, which is the shape
 * that makes deriving the buyer from a club's location impossible even for the
 * single-customer case.
 *
 * Between them the customers here cover both halves of the export's readiness
 * rule and the state that has neither: Espoo's file is refused because one of
 * its clubs has no fee, Helsinki's youth department's because its one club has
 * nothing to invoice, and every other customer's can be downloaded.
 *
 * The billing names follow the municipalities, which are real for the reason
 * stated above — a Finnish reader recognises the row by them. Everything else
 * is invented on the same terms as the school and club names: a customer
 * number, a department name, an association or a street that belonged to a real
 * customer would be a page that looks like live data, so the numbers are
 * F-prefixed and plausible rather than anybody's.
 */
const INVOICE_CUSTOMERS = {
  espoo: {
    no: "F0204",
    name: "Espoon kaupunki",
    street: "Virastokuja 1",
    postalCode: "02070",
    city: "Espoo",
    yourReference: "TIL-2026-0418",
    invoiceText: null,
  },
  helsinki: {
    no: "F0207",
    name: "Helsingin kaupunki",
    street: "Virastokatu 3",
    postalCode: "00099",
    city: "Helsinki",
    yourReference: "PO 4471182",
    invoiceText: "Laskutusviite merkittävä jokaiselle riville.",
  },
  // Helsinki's second department, and the one customer here with nothing to
  // invoice: it buys exactly one club, and that club recorded no sessions at
  // all this month. Its download is refused for a reason that is not a missing
  // fee, which is the other half of the export's readiness rule and the one a
  // month of ordinary clubs would never show.
  helsinkiYouth: {
    no: "F0208",
    name: "Helsingin kaupunki, nuorisopalvelut",
    street: "Nuorisokuja 2",
    postalCode: "00099",
    city: "Helsinki",
    yourReference: null,
    invoiceText: null,
  },
  // The association: it buys the Vantaa clubs, and it is not Vantaa. A page
  // that derived the buyer from the club's location would address every one of
  // these invoices to the wrong party and still look entirely correct.
  lekvanner: {
    no: "F0219",
    name: "Föreningen Lekvänner rf",
    street: "Sjöstigen 12 A",
    postalCode: "01300",
    city: "Vantaa",
    yourReference: null,
    invoiceText: null,
  },
  // Tampere, twice. Library clubs and school clubs are bought by two
  // departments under two agreements, so one city is two customers and the
  // link has to be per club.
  tampereLibrary: {
    no: "F0211",
    name: "Tampereen kaupunki, kirjastopalvelut",
    street: "Kirjastokuja 5",
    postalCode: "33101",
    city: "Tampere",
    yourReference: "KIRJ-2026-77",
    invoiceText: null,
  },
  tampereSchools: {
    no: "F0212",
    name: "Tampereen kaupunki, kasvatus- ja opetuspalvelut",
    street: "Opintie 14",
    postalCode: "33101",
    city: "Tampere",
    yourReference: "KASVA-2026-310",
    invoiceText: null,
  },
  turku: {
    no: "F0221",
    name: "Turun kaupunki",
    street: "Raatihuoneenkuja 2",
    postalCode: "20101",
    city: "Turku",
    yourReference: null,
    invoiceText: null,
  },
  oulu: {
    no: "F0224",
    name: "Oulun kaupunki",
    street: "Pohjoisväylä 9",
    postalCode: "90015",
    city: "Oulu",
    yourReference: null,
    invoiceText: null,
  },
  jyvaskyla: {
    no: "F0228",
    name: "Jyväskylän kaupunki",
    street: "Järvikatu 7",
    postalCode: "40101",
    city: "Jyväskylä",
    yourReference: null,
    invoiceText: null,
  },
  kuopio: {
    no: "F0231",
    name: "Kuopion kaupunki",
    street: "Kallaveden puistotie 4",
    postalCode: "70101",
    city: "Kuopio",
    yourReference: null,
    invoiceText: null,
  },
  lahti: {
    no: "F0234",
    name: "Lahden kaupunki",
    street: "Harjukuja 11",
    postalCode: "15111",
    city: "Lahti",
    yourReference: null,
    invoiceText: null,
  },
  joensuu: {
    no: "F0237",
    name: "Joensuun kaupunki",
    street: "Pielisentie 6",
    postalCode: "80101",
    city: "Joensuu",
    yourReference: null,
    invoiceText: null,
  },
  rovaniemi: {
    no: "F0241",
    name: "Rovaniemen kaupunki",
    street: "Napapiirinkuja 8",
    postalCode: "96101",
    city: "Rovaniemi",
    yourReference: null,
    invoiceText: null,
  },
  porvoo: {
    no: "F0244",
    name: "Porvoon kaupunki",
    street: "Jokirannankuja 3",
    postalCode: "06100",
    city: "Porvoo",
    yourReference: null,
    invoiceText: null,
  },
} as const;

type CustomerKey = keyof typeof INVOICE_CUSTOMERS;

/**
 * Which customer a club is billed to when its spec does not say.
 *
 * Only the municipalities whose clubs all share one buyer have an entry:
 * Tampere is absent because its clubs split across two customers and a default
 * would hide exactly the case it is here to show, and Vantaa is absent because
 * an association buys its clubs — both name their customer per club instead.
 */
const DEFAULT_CUSTOMER: Partial<Record<MunicipalityKey, CustomerKey>> = {
  espoo: "espoo",
  helsinki: "helsinki",
  turku: "turku",
  oulu: "oulu",
  jyvaskyla: "jyvaskyla",
  kuopio: "kuopio",
  lahti: "lahti",
  joensuu: "joensuu",
  rovaniemi: "rovaniemi",
  porvoo: "porvoo",
};

/** One club, in the vocabulary the wire document uses. */
interface ClubSpec {
  /** URL-safe and readable: it reaches the DOM only as the club's own link. */
  id: string;
  name: string;
  /** Which municipality invoices it. Every club has one — see the note above. */
  municipality: MunicipalityKey;
  /**
   * Where it meets, and as what kind of location. A `site` is a school hall; a
   * `municipality` is an online club pointing at the municipality itself, which
   * is why the invoice's walk up the chain is ancestor-or-*self*.
   */
  site: { name: string; type?: MunicipalityInvoicingLocation["type"] } | null;
  /** Current per-session fee in cents. Null is a fee nobody has filled in. */
  feeCents: number | null;
  /**
   * Which Fennoa customer invoices it. Omitted means the municipality's own
   * customer (`DEFAULT_CUSTOMER`); an explicit `null` is a club nobody has
   * named a buyer for, which blocks its file and nothing else.
   */
  customer?: CustomerKey | null;
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
 * The working month's clubs: thirty-one of them across twelve municipalities,
 * weighted the way production is — most municipalities with one or two clubs, a
 * few with four to six.
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
    id: "preview-club-haavikallio",
    name: "Peliklubi Haavikallio",
    municipality: "espoo",
    site: { name: "Haavikallion koulu" },
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
    //
    // It DOES have a customer, which is the pairing worth having on the page:
    // the two gaps are independent, so a club can be short a fee and not a
    // buyer, and the flags beside it must not read as one condition.
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
    id: "preview-club-pohjois-vuorela",
    name: "Peliklubi Pohjois-Vuorelan yhtenäiskoulun iltapäiväryhmä",
    municipality: "helsinki",
    // Long on both axes on purpose: the name truncates in the club column and
    // the site name truncates in the detail's location line.
    site: {
      name: "Pohjois-Vuorelan yhtenäiskoulun monitoimisali ja kerhotila",
    },
    feeCents: 9000,
    slots: [{ weekday: TUE, startTime: "15:15" }],
  },
  {
    id: "preview-club-vuorenpeikko",
    name: "Peliklubi Vuorenpeikko",
    municipality: "helsinki",
    // Its own customer, buying nothing else. A club that recorded nothing is
    // already the strongest thing on the page to notice; giving it a buyer of
    // its own is what makes that buyer's file refusable for having nothing to
    // invoice rather than for a missing fee.
    customer: "helsinkiYouth",
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
    // The club nobody has named a buyer for. Its sessions and its money are on
    // the page in full — a missing customer costs no total anything — and the
    // one thing it cannot do is have a file produced for it.
    customer: null,
    slots: [{ weekday: FRI, startTime: "14:30" }],
  },

  // Vantaa — the two clubs that bill without projecting anything, and the
  // municipality whose clubs an ASSOCIATION buys: the buyer is not Vantaa, so
  // nothing here may derive a customer from where a club meets.
  {
    id: "preview-club-ruskolintu",
    name: "Peliklubi Ruskolintu",
    municipality: "vantaa",
    customer: "lekvanner",
    site: { name: "Ruskolinnun koulu" },
    feeCents: 7000,
    slots: [{ weekday: MON, startTime: "15:45" }],
  },
  {
    id: "preview-club-kartanonrinne",
    name: "Peliklubi Kartanonrinne",
    municipality: "vantaa",
    customer: "lekvanner",
    site: { name: "Kartanonrinteen koulu" },
    feeCents: 7000,
    slots: [{ weekday: TUE, startTime: "16:00" }],
    missedDates: ["2026-05-19"],
  },
  {
    id: "preview-club-lammaskoski",
    name: "Peliklubi Lammaskoski",
    municipality: "vantaa",
    customer: "lekvanner",
    site: { name: "Lammaskosken koulu" },
    feeCents: 6000,
    // A term that has not begun: it starts in August, so the projection clips
    // to a window entirely after this month and claims nothing. A stray row in
    // May all the same, so it bills its evidence and the schedule beside it
    // stays silent.
    startDate: "2026-08-17",
    endDate: null,
    slots: [{ weekday: WED, startTime: "15:00" }],
    extraDates: ["2026-05-13"],
  },
  {
    id: "preview-club-ilvesmaki",
    name: "Peliklubi Ilvesmäki",
    municipality: "vantaa",
    customer: "lekvanner",
    site: { name: "Ilvesmäen koulu" },
    feeCents: 6500,
    slots: [{ weekday: THU, startTime: "15:30" }],
  },

  // Tampere — a term that ends inside the month.
  {
    id: "preview-club-vuoreskallio",
    name: "Peliklubi Vuoreskallio",
    municipality: "tampere",
    customer: "tampereLibrary",
    site: { name: "Vuoreskallion koulu" },
    feeCents: 9000,
    slots: [{ weekday: MON, startTime: "16:15" }],
  },
  {
    id: "preview-club-hallilanmaki",
    name: "Peliklubi Hallilanmäki",
    municipality: "tampere",
    customer: "tampereLibrary",
    site: { name: "Hallilanmäen koulu" },
    feeCents: 8000,
    // A term ending on the 13th: the projection is clipped to the term's last
    // day, so this club has no upcoming line while every other Wednesday club
    // does.
    endDate: "2026-05-13",
    slots: [{ weekday: WED, startTime: "15:00" }],
  },
  {
    id: "preview-club-pyynikinportti",
    name: "Peliklubi Pyynikinportti",
    municipality: "tampere",
    customer: "tampereSchools",
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
    customer: "tampereSchools",
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
    id: "preview-club-ounasniitty",
    name: "Peliklubi Ounasniitty",
    municipality: "rovaniemi",
    site: { name: "Ounasniityn koulu" },
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

];

/** `YYYY-MM`, with the year inside this century — the live route's own shape. */
const PREVIEW_MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

/**
 * Which month the scene is showing: the one its `?month=` parameter names, or the
 * working month.
 *
 * **The default is the working month, not last month.** The live route defaults
 * to the month that just ended, because an invoice is raised for a finished
 * month; a preview defaults to the month it has clubs in, because a scene that
 * opened empty would be showing the reviewer nothing. A malformed or absurd
 * value falls to the same default — the page it selects is fixtures either way,
 * so there is nothing to refuse.
 *
 * Exported and pure so the scene's month resolution is pinned by a unit test
 * rather than by opening the preview and reading the URL bar.
 */
export function resolvePreviewInvoicingMonth(raw: string | null): string {
  if (raw !== null && PREVIEW_MONTH_PARAM.test(raw)) return `${raw}-01`;
  return WORKING_MONTH;
}

/**
 * One month of `get_admin_municipality_invoicing`, as the route would have
 * fetched it — for the month asked for.
 *
 * **The working month has the ledger in it and every other month is empty**,
 * which is the honest answer rather than a contrivance: the clubs here run one
 * spring term, and an invoicing month outside it genuinely has nothing in it.
 * That is what makes the scene's stepper worth using — a reader steps off May
 * and meets the empty state on the same page, in the same chrome, and steps back.
 *
 * Pure and cheap: the rows are weekly arithmetic over thirty-one specs, and the
 * whole point of returning the wire document rather than a view is that the
 * scene's numbers come out of the same builder the live page's do. A function of
 * the month alone, so the test can pin both answers without a browser.
 */
export function municipalityInvoicingMonthFixture(
  month: string,
): MunicipalityInvoicingSnapshot {
  if (month !== WORKING_MONTH) return { month_start: month, clubs: [] };
  return {
    month_start: WORKING_MONTH,
    clubs: WORKING_MONTH_CLUBS.map(buildClub),
  };
}

function buildClub(spec: ClubSpec): MunicipalityInvoicingClub {
  const startDate = spec.startDate ?? TERM_START;
  const endDate = spec.endDate === undefined ? TERM_END : spec.endDate;
  const slots: MunicipalityInvoicingScheduleSlot[] = (spec.slots ?? []).map(
    (slot) => ({
      weekday: slot.weekday,
      start_time: slot.startTime,
      duration_minutes: SESSION_MINUTES,
    }),
  );

  const municipality = MUNICIPALITIES[spec.municipality];

  return {
    id: spec.id,
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
    municipality: {
      id: `preview-municipality-${spec.municipality}`,
      name: municipality.name,
      name_i18n: municipality.sv === null ? null : { sv: municipality.sv },
    },
    invoice_customer: invoiceCustomerOf(spec),
    sessions: storedRows(spec, { startDate, endDate, slots }),
  };
}

/**
 * The customer row a club is billed to, as the RPC ships it: the whole row
 * against every club, not an id.
 *
 * `undefined` on the spec falls back to the municipality's own customer, an
 * explicit `null` is a club nobody has named a buyer for, and a named key is
 * how Tampere's two departments and the association that buys Vantaa's clubs
 * reach the document.
 */
function invoiceCustomerOf(spec: ClubSpec): InvoiceCustomerRow | null {
  const key =
    spec.customer === undefined
      ? DEFAULT_CUSTOMER[spec.municipality]
      : spec.customer;
  if (key === undefined || key === null) return null;

  const customer = INVOICE_CUSTOMERS[key];
  return {
    id: `preview-invoice-customer-${key}`,
    fennoa_customer_no: customer.no,
    invoice_name: customer.name,
    street: customer.street,
    postal_code: customer.postalCode,
    city: customer.city,
    country_code: "FI",
    your_reference: customer.yourReference,
    invoice_text: customer.invoiceText,
  };
}

/**
 * The stored session rows a club carries in the month — the raw table rows, one
 * per group and date, exactly as the RPC sends them.
 *
 * A row exists for every date the club's schedule projected that has arrived,
 * minus the ones the spec says nobody wrote up, plus whatever dates the spec
 * adds by hand. That last part is the whole of a club with no projection: a club
 * whose term falls outside the month, or one whose slots were never filled in,
 * reaches the invoice on its rows alone.
 */
function storedRows(
  spec: ClubSpec,
  context: {
    startDate: string;
    endDate: string | null;
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
 * A club whose term does not reach into the month projects nothing, which is
 * what makes the not-yet-started spec carry its row by hand.
 */
function projectedDates({
  startDate,
  endDate,
  slots,
}: {
  startDate: string;
  endDate: string | null;
  slots: readonly MunicipalityInvoicingScheduleSlot[];
}): string[] {
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
