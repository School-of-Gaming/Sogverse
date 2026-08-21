import {
  buildSessionFeedFixture,
  SESSION_FEED_ADULT_ID,
  SESSION_FEED_GAMER_IDS,
  SESSION_FEED_WEEK_SPECS,
  type EntrySpec,
  type SessionFeedCadence,
  type SessionSendOutcome,
} from "@/components/gedu/session-feed/mock-fixtures";
import type {
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed";
import type { ProductSite } from "@/components/gedu/session-details/GeduProductPageBody";
import type { ProductAdminDetailRow } from "@/services/products";
import { ROUTES } from "@/lib/constants";
import { effectiveStatus } from "@/lib/products/effective-status";
import type {
  GroupParticipationDetail,
  ProductGroupsSnapshot,
  ProductType,
} from "@/types";
import type {
  AdminProductDetail,
  AdminProductGroupDetail,
} from "./detail/admin-product-detail-data";
import { tallySessions } from "./detail/admin-product-detail-data";

/**
 * Fixtures for the **admin product page** scene: one product, three shapes it
 * genuinely comes in, and every group, note, seat and session an admin can see
 * on it.
 *
 * **Everything is deterministic.** Ids are real generated UUIDs pasted in as
 * literals — the seating chips draw identicons hashed out of them, so a readable
 * stand-in would render a degenerate square and a generated one would give the
 * same child a different face on every reload. The clock is pinned (below) for
 * the same reason the list's is: this page is *about* the term, and a live clock
 * would show a different set of states every morning.
 *
 * **The three scenarios are the three product shapes that cannot coexist.** A
 * product is either an in-person municipality club with a venue and a kunta, or
 * a remote paid consumer club with a voice room, or a bounded camp with no
 * history yet. Everything else the page can show — a waitlist, an unstaffed
 * group, an unplaced seat, a term of mixed session states — fits inside the
 * first, and putting it in a scenario of its own would mean comparing it from
 * memory instead of side by side.
 *
 * The session copy is mock *data* rather than UI copy: it stands in for what a
 * gedu typed, so it is not translated.
 */

export const ADMIN_PRODUCT_DETAIL_SCENARIOS = [
  "muni-club",
  "online-club",
  "camp",
] as const;

export type AdminProductDetailScenario =
  (typeof ADMIN_PRODUCT_DETAIL_SCENARIOS)[number];

export function isAdminProductDetailScenario(
  value: string,
): value is AdminProductDetailScenario {
  return (ADMIN_PRODUCT_DETAIL_SCENARIOS as readonly string[]).includes(value);
}

/** Every product here is authored in the platform's own zone. */
const TIMEZONE = "Europe/Helsinki";

/**
 * The pinned "now": **Monday 14 September 2026, 17:20** in Helsinki.
 *
 * Three things are chosen at once by that instant, which is why it is this
 * precise rather than a round morning hour:
 *
 * - It is mid-term. There is a run of history to read above the divider and
 *   enough term left below it for the future block to be worth expanding.
 * - It is a **Monday**, which is the weekday every club here meets on. The
 *   shared session-feed builder lays its weekly run out on Mondays, so a
 *   product whose slots said anything else would have a schedule contradicting
 *   its own feed on the same screen.
 * - It is **inside the remote club's session**, so that club's voice room is
 *   open and its next card is the one in progress. That state is true for
 *   ninety minutes a week, which is why a fixture has to arrange it deliberately
 *   or nobody ever sees it.
 *
 * The date will one day be in the past, at which point the fixture is showing a
 * historical term rather than rotting silently.
 */
export const ADMIN_PRODUCT_DETAIL_NOW = new Date("2026-09-14T17:20:00+03:00");

/**
 * The people on these products, keyed by a readable name so a group's roster is
 * legible and the UUID stays where it belongs.
 *
 * The children's ids are deliberately the **session-feed fixture's own** ids:
 * the attendance maps in the shared spec list are keyed by them, so seating
 * these particular children is what makes the register on a session card and the
 * chips in the seating panel be about the same nine people.
 */
const PEOPLE = {
  aino: SESSION_FEED_GAMER_IDS.aino,
  vaino: SESSION_FEED_GAMER_IDS.vaino,
  elias: SESSION_FEED_GAMER_IDS.elias,
  linnea: SESSION_FEED_GAMER_IDS.linnea,
  oskar: SESSION_FEED_GAMER_IDS.oskar,
  siiri: SESSION_FEED_GAMER_IDS.siiri,
  emil: SESSION_FEED_GAMER_IDS.emil,
  hilda: SESSION_FEED_GAMER_IDS.hilda,
  marja: SESSION_FEED_ADULT_ID,
} as const;

type PersonKey = keyof typeof PEOPLE;

/** The gedus who teach these products — real UUIDs, for the same reason. */
const GEDU_IDS = {
  sanna: "4a84d001-b789-41f5-ace3-cfcffa139869",
  petra: "96e29545-ad63-4948-b783-14e91189ad75",
  onni: "b3ec8370-f4c5-4844-9256-123c3aaa0971",
} as const;

/**
 * One seat's worth of person: what the chip draws and what its popover answers.
 *
 * `parentEmail` is not part of the groups snapshot — the RPC emits a parent's
 * *name* and no address — so it is carried beside the participation here and
 * threaded into the chip as a resolved detail. That gap is real and is the one
 * thing on this page a promotion has to widen an RPC for.
 */
interface PersonSpec {
  firstName: string;
  dateOfBirth: string | null;
  gender: GroupParticipationDetail["participant_gender"];
  parentFirstName: string | null;
  parentLastName: string | null;
  parentEmail: string | null;
  /** Set on the one adult seat; null on every child. */
  ownEmail: string | null;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
  robloxUsername: string | null;
  robloxUserId: number | null;
}

const PERSON_SPECS: Record<PersonKey, PersonSpec> = {
  aino: {
    firstName: "Aino",
    dateOfBirth: "2015-04-02",
    gender: "girl",
    parentFirstName: "Riikka",
    parentLastName: "Virtanen",
    parentEmail: "riikka.virtanen@example.com",
    ownEmail: null,
    minecraftUsername: "AinoBuilds",
    minecraftUuid: "8f1c0f2e-6a4b-4a51-9c7d-0e2b3a5f7c19",
    robloxUsername: "AinoBuilds",
    robloxUserId: 1840226117,
  },
  vaino: {
    firstName: "Väinö",
    dateOfBirth: "2014-11-19",
    gender: "boy",
    parentFirstName: "Marko",
    parentLastName: "Nieminen",
    parentEmail: "marko.nieminen@example.com",
    ownEmail: null,
    minecraftUsername: "VainoTheBold",
    minecraftUuid: "2d4a7b90-1e63-4c85-b0f2-9a7c1d3e5b48",
    robloxUsername: "VainoTheBold",
    robloxUserId: 2094551038,
  },
  elias: {
    firstName: "Elias",
    dateOfBirth: "2015-08-27",
    gender: "boy",
    parentFirstName: "Sofia",
    parentLastName: "Laine",
    parentEmail: "sofia.laine@example.com",
    ownEmail: null,
    minecraftUsername: "EliasRedstone",
    // No key: the handle was typed and never confirmed by the platform.
    minecraftUuid: null,
    robloxUsername: "Elias_Builds",
    robloxUserId: null,
  },
  linnea: {
    firstName: "Linnéa",
    dateOfBirth: "2016-01-14",
    gender: "girl",
    parentFirstName: "Anders",
    parentLastName: "Ek",
    parentEmail: "anders.ek@example.com",
    ownEmail: null,
    minecraftUsername: "LinneaLoops",
    minecraftUuid: "6b8e2c14-9d07-4f36-a251-3c9f0b6d8e27",
    robloxUsername: "LinneaLoops",
    robloxUserId: 3271908445,
  },
  oskar: {
    firstName: "Oskar",
    dateOfBirth: "2014-06-30",
    gender: "boy",
    parentFirstName: "Heidi",
    parentLastName: "Salo",
    parentEmail: "heidi.salo@example.com",
    ownEmail: null,
    minecraftUsername: "OskarOre",
    minecraftUuid: "a3c50e78-2f16-4b94-8d07-5e1b9c2a6f30",
    robloxUsername: "OskarOre",
    robloxUserId: 1553402298,
  },
  siiri: {
    firstName: "Siiri",
    dateOfBirth: "2016-03-08",
    gender: "girl",
    parentFirstName: "Heidi",
    parentLastName: "Salo",
    // Siblings share a contact, which is why the copy-all list de-duplicates.
    parentEmail: "heidi.salo@example.com",
    ownEmail: null,
    minecraftUsername: "SiiriSky",
    minecraftUuid: "0e7b1a63-4c29-4d80-9f15-8a2c6e0b3d74",
    robloxUsername: "SiiriSky",
    robloxUserId: 4018772630,
  },
  emil: {
    firstName: "Emil",
    dateOfBirth: "2015-12-05",
    gender: "boy",
    parentFirstName: "Katri",
    parentLastName: "Mäkinen",
    parentEmail: "katri.makinen@example.com",
    ownEmail: null,
    // Nobody has ever given a handle for this one — the resting empty row.
    minecraftUsername: null,
    minecraftUuid: null,
    robloxUsername: null,
    robloxUserId: null,
  },
  hilda: {
    firstName: "Hilda",
    dateOfBirth: "2014-09-21",
    gender: "girl",
    parentFirstName: "Katri",
    parentLastName: "Mäkinen",
    parentEmail: "katri.makinen@example.com",
    ownEmail: null,
    minecraftUsername: "HildaHollow",
    minecraftUuid: "5a91c308-7e42-4f61-b0d9-2c8e1a4f6b03",
    robloxUsername: "HildaHollow",
    robloxUserId: 2760114589,
  },
  marja: {
    firstName: "Marja",
    // An adult seat carries none of the child-shaped facts, and the chip draws
    // that absence deliberately rather than as a gap.
    dateOfBirth: null,
    gender: null,
    parentFirstName: null,
    parentLastName: null,
    parentEmail: null,
    ownEmail: "marja.koskinen@example.com",
    minecraftUsername: null,
    minecraftUuid: null,
    robloxUsername: null,
    robloxUserId: null,
  },
};

/**
 * Participation ids — one per seat, real UUIDs, hardcoded.
 *
 * A participation is not a person: the same child can hold a seat on two
 * products, so the chip's drag key and the popover's lookup are keyed by this
 * rather than by the participant.
 */
const PARTICIPATION_IDS: Readonly<Record<string, string>> = {
  aino: "0586feaf-cd8a-4fb9-b005-5b2f52f9daeb",
  vaino: "d29fdb2c-b25d-4655-8d36-bb18d77a6f09",
  elias: "5e94cb92-0884-4de9-bb7d-e307d64f69a1",
  linnea: "9a032854-ed10-4e2a-852c-84ec2737aef1",
  oskar: "b2366bf5-175c-4bc3-9bca-b49ee2a39a40",
  siiri: "300cc3ab-4ff6-4e1a-9848-b703a1ff8a0b",
  emil: "0a946744-055b-4344-a4f3-87e0f544113f",
  hilda: "24ee79d5-c621-43b2-a2ca-432a2c1f8f62",
  marja: "90f8dc1a-7025-4cfc-b9a6-e11bef5af5cc",
};

/** Waitlisted seats need their own participation ids — a queue row is a row. */
const WAITLIST_PARTICIPATION_IDS: Record<string, string> = {
  jonne: "dbb3cef6-215a-4291-845b-f1434f84a239",
  pinja: "b79e4e96-1fa6-41dd-9f67-7130d2a067f7",
};

const WAITLIST_PARTICIPANT_IDS: Record<string, string> = {
  jonne: "aea95a65-a23d-47c5-8cde-6ef350d51791",
  pinja: "c2c34149-01f0-41ba-9569-e346820f43df",
};

const GROUP_IDS = {
  a: "cb609e06-4ba2-49bc-b3f3-c347bf115fae",
  b: "e9ca1dc7-9691-4a08-b807-8bc29ae40e14",
  c: "ffe5763d-1a42-43c3-a5f5-4e45c8f9bf9d",
};

const PRODUCT_IDS: Record<AdminProductDetailScenario, string> = {
  "muni-club": "8aafacbc-81d2-4635-a13f-23d790f040d6",
  "online-club": "00a4fa5d-9f9b-4fe0-89e1-d05ec15fd5bc",
  camp: "dfb52c5d-e1fe-445c-8f49-8726251fb46c",
};

const ADMIN_AUTHOR_ID = "008f636d-7f01-4b5e-afc8-dbe06cb7ff49";

/** Which platform's identity a seat carries is the product's topic's business. */
function participation(
  key: PersonKey,
  opts: { subscribed?: boolean; paid?: boolean; signedUpAt: string },
): GroupParticipationDetail {
  const person = PERSON_SPECS[key];
  return {
    id: PARTICIPATION_IDS[key],
    participant_id: PEOPLE[key],
    participant_first_name: person.firstName,
    participant_date_of_birth: person.dateOfBirth,
    participant_gender: person.gender,
    participant_minecraft_username: person.minecraftUsername,
    participant_minecraft_uuid: person.minecraftUuid,
    participant_roblox_username: person.robloxUsername,
    participant_roblox_user_id: person.robloxUserId,
    parent_first_name: person.parentFirstName,
    parent_last_name: person.parentLastName,
    participant_email: person.ownEmail,
    status: "active",
    signed_up_at: opts.signedUpAt,
    has_live_subscription: opts.subscribed ?? false,
    has_payment_marker: opts.paid ?? false,
  };
}

/** A queueing seat: never seated, so no subscription and no payment marker. */
function waitlisted(
  key: string,
  firstName: string,
  parent: { first: string; last: string; email: string },
  dateOfBirth: string,
  gender: GroupParticipationDetail["participant_gender"],
  signedUpAt: string,
): GroupParticipationDetail {
  return {
    id: WAITLIST_PARTICIPATION_IDS[key],
    participant_id: WAITLIST_PARTICIPANT_IDS[key],
    participant_first_name: firstName,
    participant_date_of_birth: dateOfBirth,
    participant_gender: gender,
    participant_minecraft_username: null,
    participant_minecraft_uuid: null,
    participant_roblox_username: null,
    participant_roblox_user_id: null,
    parent_first_name: parent.first,
    parent_last_name: parent.last,
    participant_email: null,
    status: "waitlisted",
    signed_up_at: signedUpAt,
    has_live_subscription: false,
    has_payment_marker: false,
  };
}

const WAITLIST_CONTACTS: Record<string, string> = {
  [WAITLIST_PARTICIPATION_IDS.jonne]: "tuomas.rantala@example.com",
  [WAITLIST_PARTICIPATION_IDS.pinja]: "eeva.korhonen@example.com",
};

// ---------------------------------------------------------------------------
// The product row
// ---------------------------------------------------------------------------

/**
 * A complete `products` row with its embeds, spelled out once and varied by
 * scenario.
 *
 * Written as the real admin query's shape rather than a reduced view-model
 * because that is what lets the page render the shop's own overview card and the
 * authored blurb through the very components a family meets them in — a second
 * rendering of the same columns is a second thing to keep in step.
 */
function productRow(args: {
  id: string;
  productType: ProductType;
  name: string;
  shortDescription: string;
  longDescription: string;
  slots: readonly { weekday: number; start_time: string; duration_minutes: number }[];
  startDate: string;
  endDate: string | null;
  isRemote: boolean;
  location: ProductAdminDetailRow["locations"];
  billingMode: ProductAdminDetailRow["billing_mode"];
  prices: readonly { currency: "eur"; price_cents: number }[];
  seatCount: number | null;
  waitlistEnabled: boolean;
  topic: ProductAdminDetailRow["topic"];
  tag: ProductAdminDetailRow["tag"];
  primaryGeduFeeCents: number | null;
  assistantGeduFeeCents: number | null;
  municipalityFeeCents: number | null;
  regionLockCountry: string | null;
  signupThreshold: number | null;
  spokenLanguage: string;
  minAge: number | null;
  maxAge: number | null;
  forGamers: boolean;
  forParents: boolean;
  materialUrl: string | null;
  holidayCalendars: readonly string[];
  /** The stored column; the page derives the effective status from it. */
  status?: ProductAdminDetailRow["status"];
}): ProductAdminDetailRow {
  return {
    id: args.id,
    product_type: args.productType,
    status: args.status ?? "running",
    start_date: args.startDate,
    end_date: args.endDate,
    timezone: TIMEZONE,
    is_remote: args.isRemote,
    is_visible: true,
    location_id: args.location?.id ?? null,
    min_age: args.minAge,
    max_age: args.maxAge,
    for_gamers: args.forGamers,
    for_parents: args.forParents,
    seat_count: args.seatCount,
    waitlist_enabled: args.waitlistEnabled,
    signup_threshold: args.signupThreshold,
    registration_opens_at: "2026-05-04T06:00:00+00:00",
    billing_mode: args.billingMode,
    primary_gedu_fee_cents: args.primaryGeduFeeCents,
    assistant_gedu_fee_cents: args.assistantGeduFeeCents,
    municipality_fee_cents: args.municipalityFeeCents,
    region_lock_country: args.regionLockCountry,
    spoken_language_code: args.spokenLanguage,
    topic: args.topic,
    tag: args.tag,
    image_id: null,
    image_path: null,
    created_at: "2026-04-28T11:12:00+00:00",
    created_by: ADMIN_AUTHOR_ID,
    updated_at: "2026-09-02T14:37:00+00:00",
    product_images: null,
    product_staff_details:
      args.materialUrl === null ? null : { material_url: args.materialUrl },
    product_translations: [
      {
        product_id: args.id,
        locale: "en",
        name: args.name,
        short_description: args.shortDescription,
        long_description: args.longDescription,
        created_at: "2026-04-28T11:12:00+00:00",
        updated_at: "2026-09-02T14:37:00+00:00",
      },
    ],
    product_prices: args.prices.map((price) => ({ ...price })),
    schedule_slots: args.slots.map((slot) => ({ ...slot })),
    locations: args.location,
    product_holiday_calendars: args.holidayCalendars.map((name) => ({
      calendar_id: name,
      holiday_calendars: { name },
    })),
  };
}

// ---------------------------------------------------------------------------
// Session feeds
// ---------------------------------------------------------------------------

/**
 * One group's feed, built from the shared spec list and then **namespaced by
 * group**.
 *
 * The shared builder keys entries by index (`mock-session-3`), which is right
 * for a page showing one group and wrong for a page showing three: the admin
 * page holds a single "which entry is open" id across the whole section, so two
 * groups sharing an entry id would leave an editor apparently open in a group
 * nobody opened it in. Prefixing with the group id is the smallest fix and keeps
 * the ids stable across a re-render.
 */
function groupFeed(
  now: Date,
  groupId: string,
  opts: {
    specs: readonly EntrySpec[];
    cadence?: SessionFeedCadence;
    startTime?: string;
    durationMinutes?: number;
    /**
     * Pull the next session's window back around `now`, so it is in progress.
     *
     * The shared builder can never produce one: it resolves "next" with the same
     * helper the live pages use, and that helper skips an occurrence whose start
     * has already passed. A live room is true for ninety minutes a week, so a
     * fixture that waited for one would show it to nobody — the same reasoning
     * behind the shared fixture clock's live slot, applied to a built entry
     * rather than to a schedule slot.
     */
    liveNext?: boolean;
  },
): { entries: SessionFeedEntry[]; sendOutcomes: Map<string, SessionSendOutcome> } {
  const built = buildSessionFeedFixture(now, {
    specs: opts.specs,
    cadence: opts.cadence,
    startTime: opts.startTime,
    durationMinutes: opts.durationMinutes,
  });

  const entries = built.entries.map((entry) => ({
    ...entry,
    id: `${groupId}:${entry.id}`,
  })) as SessionFeedEntry[];

  if (opts.liveNext === true) {
    // The next session is the LAST future entry — the feed is strictly
    // descending, so "next" is a fact about position rather than about the
    // session. Twenty-five minutes in and sixty-five to go: plainly under way,
    // and comfortably short of the end instant that would reclassify it.
    const nextIndex = entries.findLastIndex((entry) => entry.kind === "future");
    if (nextIndex >= 0) {
      entries[nextIndex] = {
        ...entries[nextIndex],
        startsAt: new Date(now.getTime() - 25 * 60_000),
        endsAt: new Date(now.getTime() + 65 * 60_000),
      };
    }
  }

  const sendOutcomes = new Map<string, SessionSendOutcome>();
  for (const [id, outcome] of built.sendOutcomes) {
    sendOutcomes.set(`${groupId}:${id}`, outcome);
  }

  return { entries, sendOutcomes };
}

/** A short run for a second group: one live-ish week, three finished, one gap. */
const SECOND_GROUP_SPECS: readonly EntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Redstone doors\n\nEverybody got a piston door working, and two of them got one working *on purpose*. Next week we wire the same circuit to a pressure plate.",
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.emil],
    report:
      "A quieter week — we finished the shared farm and spent the last twenty minutes tidying up the paths around it.",
    staffNote:
      "Emil has now missed two in a row without a word. Worth checking in with the family.",
  },
  // Marked off and never written up: the state the amber marker exists for.
  { kind: "past", allPresent: true },
];

/** A camp that has not run yet: everything ahead, nothing behind. */
const CAMP_FUTURE_SPECS: readonly EntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    staffNote:
      "Day one. Laptops are booked from 08:30 — get there early, the caretaker takes a while to answer the buzzer.",
  },
];

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface GroupSpec {
  id: string;
  name: string;
  gedus: readonly { id: string; first_name: string; email: string | null }[];
  members: readonly PersonKey[];
  publicNote: string | null;
  staffNote: string | null;
  specs: readonly EntrySpec[];
  cadence?: SessionFeedCadence;
  startTime?: string;
  durationMinutes?: number;
  /** See `groupFeed`'s own note — the one group whose session is under way. */
  liveNext?: boolean;
}

export interface AdminProductDetailFixture {
  data: AdminProductDetail;
  /** What an inert send does per entry, so a scene can answer three ways. */
  sendOutcomes: ReadonlyMap<string, SessionSendOutcome>;
}

export function buildAdminProductDetailFixture(
  now: Date,
  scenario: AdminProductDetailScenario,
): AdminProductDetailFixture {
  const productId = PRODUCT_IDS[scenario];

  const product = buildProduct(scenario, productId);
  const groupSpecs = buildGroups(scenario);
  const unassignedKeys = scenario === "muni-club" ? (["emil"] as const) : [];
  const signedUpAt = "2026-08-14T09:00:00+00:00";
  const subscribed = scenario === "online-club";
  const paid = scenario !== "muni-club";

  const groups = groupSpecs.map((spec) => ({
    id: spec.id,
    name: spec.name,
    created_at: "2026-08-04T08:00:00+00:00",
    gedus: spec.gedus.map((gedu) => ({ ...gedu })),
    participations: spec.members.map((key) =>
      participation(key, { subscribed, paid, signedUpAt }),
    ),
  }));

  const waitlist: GroupParticipationDetail[] =
    scenario === "muni-club"
      ? [
          waitlisted(
            "jonne",
            "Jonne",
            { first: "Tuomas", last: "Rantala", email: "tuomas.rantala@example.com" },
            "2015-02-11",
            "boy",
            "2026-08-30T18:22:00+00:00",
          ),
          waitlisted(
            "pinja",
            "Pinja",
            { first: "Eeva", last: "Korhonen", email: "eeva.korhonen@example.com" },
            "2016-07-04",
            "girl",
            "2026-09-05T20:10:00+00:00",
          ),
        ]
      : [];

  const snapshot: ProductGroupsSnapshot = {
    product_id: productId,
    groups,
    unassigned: unassignedKeys.map((key) =>
      participation(key, { subscribed, paid, signedUpAt }),
    ),
    waitlist,
  };

  const sendOutcomes = new Map<string, SessionSendOutcome>();
  const groupDetails: AdminProductGroupDetail[] = groupSpecs.map((spec) => {
    const feed = groupFeed(now, spec.id, {
      specs: spec.specs,
      cadence: spec.cadence,
      startTime: spec.startTime,
      durationMinutes: spec.durationMinutes,
      liveNext: spec.liveNext,
    });
    for (const [id, outcome] of feed.sendOutcomes) sendOutcomes.set(id, outcome);

    const roster: SessionFeedGamer[] = spec.members.map((key) => ({
      id: PEOPLE[key],
      firstName: PERSON_SPECS[key].firstName,
    }));

    return {
      groupId: spec.id,
      name: spec.name,
      publicNote: spec.publicNote,
      staffNote: spec.staffNote,
      contactEmails: dedupe(
        spec.members.map(
          (key) => PERSON_SPECS[key].ownEmail ?? PERSON_SPECS[key].parentEmail,
        ),
      ),
      entries: feed.entries,
      roster,
    };
  });

  // Totalled across every group, exactly as the ledger strips beneath are
  // totalled per group — one walk of the same entries, so the headline and the
  // sections under it cannot disagree about what is outstanding.
  const totals = groupDetails.reduce(
    (acc, group) => {
      const tally = tallySessions(group.entries);
      return {
        run: acc.run + tally.run,
        writtenUp: acc.writtenUp + tally.writtenUp,
        emailed: acc.emailed + tally.emailed,
        upcoming: acc.upcoming + tally.upcoming,
      };
    },
    { run: 0, writtenUp: 0, emailed: 0, upcoming: 0 },
  );

  const filled =
    snapshot.groups.reduce((n, g) => n + g.participations.length, 0) +
    snapshot.unassigned.length;

  const firstGroupEntries = groupDetails[0]?.entries ?? [];
  const nextEntry = [...firstGroupEntries]
    .reverse()
    .find((entry) => entry.kind === "future");

  const contactByParticipation: Record<string, string | null> = {};
  for (const group of snapshot.groups) {
    for (const p of group.participations) {
      contactByParticipation[p.id] = contactFor(p.id);
    }
  }
  for (const p of snapshot.unassigned) {
    contactByParticipation[p.id] = contactFor(p.id);
  }
  for (const p of snapshot.waitlist) {
    contactByParticipation[p.id] = WAITLIST_CONTACTS[p.id] ?? null;
  }

  const data: AdminProductDetail = {
    product,
    status: effectiveStatus(product, now, filled),
    statusReason: STATUS_REASON[scenario],
    publicUrl: publicUrl(scenario, productId),
    nextSession:
      nextEntry === undefined
        ? null
        : {
            startsAt: nextEntry.startsAt,
            endsAt: nextEntry.endsAt,
            isLive:
              nextEntry.startsAt <= now && now < nextEntry.endsAt,
          },
    sessionsRun: totals.run,
    sessionsRemaining: product.end_date === null ? null : totals.upcoming,
    sessionsWrittenUp: totals.writtenUp,
    sessionsEmailed: totals.emailed,
    seats: {
      filled,
      free:
        product.seat_count === null
          ? null
          : Math.max(0, product.seat_count - filled),
      waitlisted: snapshot.waitlist.length,
      unplaced: snapshot.unassigned.length,
    },
    createdBy: { name: "Mikko Ahonen", at: product.created_at },
    updatedBy: { name: "Kyle Hutchinson", at: product.updated_at },
    allContactEmails: dedupe(
      groupDetails.flatMap((group) => group.contactEmails),
    ),
    site: SITES[scenario],
    municipalityName: scenario === "muni-club" ? "Espoo" : null,
    groups: snapshot,
    groupDetails,
    contactByParticipation,
  };

  return { data, sendOutcomes };
}

/**
 * The address to answer on, keyed by participation id.
 *
 * Built once from the two tables above rather than searched per lookup, so the
 * relationship stays a single derivation: change who a person's contact is and
 * both the chip's popover and the copy-all lists move together.
 */
const CONTACT_BY_PARTICIPATION: Readonly<Record<string, string | null>> =
  Object.fromEntries(
    Object.entries(PERSON_SPECS).map(([key, person]) => [
      PARTICIPATION_IDS[key],
      person.ownEmail ?? person.parentEmail,
    ]),
  );

function contactFor(participationId: string): string | null {
  return CONTACT_BY_PARTICIPATION[participationId] ?? null;
}

/** Strip nulls and de-duplicate — siblings share a contact. */
function dedupe(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * The public URL a product is reachable at.
 *
 * A municipality club lives under its school's slug rather than in the shop,
 * which is exactly the kind of thing the facts band exists to say out loud: an
 * admin pasting `/shop/{id}` for a muni club sends a whole town to a 404.
 */
function publicUrl(
  scenario: AdminProductDetailScenario,
  productId: string,
): string {
  const origin = "https://sogverse.com";
  if (scenario === "muni-club") {
    return `${origin}${ROUTES.schoolMunicipalityProduct("espoo", productId)}`;
  }
  return `${origin}${ROUTES.shopProduct(productId)}`;
}

const STATUS_REASON: Record<AdminProductDetailScenario, string | null> = {
  "muni-club": null,
  "online-club": null,
  // The one scenario whose status is not self-explanatory: a camp that has not
  // opened yet, and the reason is a date rather than a threshold.
  camp: "Pending until 15 September 2026",
};

const SITES: Record<AdminProductDetailScenario, ProductSite | null> = {
  "muni-club": {
    name: "Tapiolan koulu",
    address: "Opintie 1, 02100 Espoo",
    publicNote:
      "The club meets in the media room on the first floor. Come in through the main doors — the side entrance is locked after 15:00.",
    staffNote:
      "Door code is 4417# until the end of term. The caretaker locks up at 18:00 sharp, so pack down from 17:45. Laptops 3 and 5 have no working audio out.",
  },
  "online-club": null,
  camp: {
    name: "Otaniemen kampus",
    address: "Otakaari 1, 02150 Espoo",
    publicNote:
      "Drop-off and pick-up are at the main entrance. Lunch is included; let us know about allergies before the first day.",
    staffNote: null,
  },
};

function buildProduct(
  scenario: AdminProductDetailScenario,
  productId: string,
): ProductAdminDetailRow {
  switch (scenario) {
    case "muni-club":
      return productRow({
        id: productId,
        productType: "municipality_club",
        name: "Espoon pelikerho — Tapiola",
        shortDescription:
          "A weekly after-school gaming club for Tapiola's schools, run in Finnish.",
        longDescription:
          "## What happens in a session\n\nEvery week the group builds something together in Minecraft, and every week somebody blows part of it up. That is roughly the curriculum.\n\n- **Weeks 1–4** — the shared world, ground rules, and everybody's first plot\n- **Weeks 5–8** — redstone, which is where the explosions start\n- **Weeks 9–12** — a build the whole group presents at the end of term\n\nSessions are run by a trained game educator and are free for families: [Espoo](https://www.espoo.fi) funds the place.",
        slots: [{ weekday: 0, start_time: "15:00:00", duration_minutes: 90 }],
        startDate: "2026-08-10",
        endDate: "2026-12-14",
        isRemote: false,
        location: {
          id: "cc5c485a-8e39-4191-bf59-c15beec797d7",
          name: "Tapiolan koulu",
          name_i18n: null,
          type: "site",
          parent: {
            id: "87ffc897-1711-4c60-be8c-761d4a3130e0",
            name: "Espoo",
            name_i18n: null,
            type: "municipality",
          },
        },
        billingMode: "external_contract",
        prices: [],
        seatCount: 12,
        waitlistEnabled: true,
        topic: "minecraft_java",
        tag: null,
        primaryGeduFeeCents: 6000,
        assistantGeduFeeCents: 3500,
        municipalityFeeCents: 14500,
        regionLockCountry: null,
        signupThreshold: null,
        spokenLanguage: "fi",
        minAge: 9,
        maxAge: 13,
        forGamers: true,
        forParents: false,
        materialUrl: "https://drive.example.com/sog/minecraft-term-plan",
        holidayCalendars: ["Espoo school holidays 2026–27"],
      });

    case "online-club":
      return productRow({
        id: productId,
        productType: "consumer_club",
        name: "Roblox Studio Club",
        shortDescription:
          "A weekly online club where 9–14s build and publish their own Roblox games.",
        longDescription:
          "## Build something people actually play\n\nEvery member ships a game. Not a demo, not a half-finished lobby — something with a start, a middle and a leaderboard.\n\nWe work in [Roblox Studio](https://create.roblox.com) from the first session. No prior scripting needed; by the end of term most members are writing their own Lua.\n\n> Sessions run in a private voice room with a trained game educator present at all times.",
        slots: [{ weekday: 0, start_time: "17:00:00", duration_minutes: 90 }],
        startDate: "2026-08-10",
        endDate: null,
        isRemote: true,
        location: null,
        billingMode: "paid",
        prices: [{ currency: "eur", price_cents: 4900 }],
        seatCount: 8,
        waitlistEnabled: false,
        topic: "roblox_studio",
        tag: "neuroinclusive",
        primaryGeduFeeCents: 6000,
        assistantGeduFeeCents: null,
        municipalityFeeCents: null,
        regionLockCountry: "FI",
        signupThreshold: 4,
        spokenLanguage: "en",
        minAge: 9,
        maxAge: 14,
        forGamers: true,
        forParents: false,
        materialUrl: "https://drive.example.com/sog/roblox-studio-term-plan",
        holidayCalendars: [],
      });

    case "camp":
      return productRow({
        id: productId,
        productType: "camp",
        name: "Syysloman pelileiri",
        shortDescription:
          "A four-day autumn-holiday camp in Otaniemi: build, play, and show what you made.",
        longDescription:
          "Four days, one project, and a showcase for families on the last afternoon.\n\nLunch and snacks are included. Bring a water bottle and indoor shoes; everything else is provided.",
        slots: [
          { weekday: 1, start_time: "09:30:00", duration_minutes: 300 },
          { weekday: 2, start_time: "09:30:00", duration_minutes: 300 },
          { weekday: 3, start_time: "09:30:00", duration_minutes: 300 },
          { weekday: 4, start_time: "09:30:00", duration_minutes: 300 },
        ],
        startDate: "2026-09-15",
        endDate: "2026-09-18",
        status: "pending",
        isRemote: false,
        location: {
          id: "eeee3cbc-8ab2-4ea2-90cc-7faad1126c72",
          name: "Otaniemen kampus",
          name_i18n: null,
          type: "site",
          parent: {
            id: "87ffc897-1711-4c60-be8c-761d4a3130e0",
            name: "Espoo",
            name_i18n: null,
            type: "municipality",
          },
        },
        billingMode: "paid",
        prices: [{ currency: "eur", price_cents: 24000 }],
        seatCount: 16,
        waitlistEnabled: false,
        topic: "minecraft_java",
        tag: null,
        primaryGeduFeeCents: 12000,
        assistantGeduFeeCents: 8000,
        municipalityFeeCents: null,
        regionLockCountry: null,
        signupThreshold: null,
        spokenLanguage: "fi",
        minAge: 8,
        maxAge: 12,
        forGamers: true,
        forParents: false,
        materialUrl: null,
        holidayCalendars: [],
      });
  }
}

function buildGroups(scenario: AdminProductDetailScenario): GroupSpec[] {
  switch (scenario) {
    case "muni-club":
      return [
        {
          id: GROUP_IDS.a,
          name: "Group A",
          gedus: [
            { id: GEDU_IDS.sanna, first_name: "Sanna", email: "sanna@sog.gg" },
          ],
          members: ["aino", "vaino", "elias", "linnea"],
          publicNote:
            "We meet in the media room. If your child is going to be away, a message the day before is plenty.",
          staffNote:
            "Väinö and Oskar work much better on separate tables. Aino is the one to ask if you need somebody to explain the world rules to a newcomer.",
          specs: SESSION_FEED_WEEK_SPECS,
          startTime: "15:00",
        },
        {
          id: GROUP_IDS.b,
          name: "Group B",
          gedus: [
            { id: GEDU_IDS.petra, first_name: "Petra", email: "petra@sog.gg" },
          ],
          members: ["oskar", "siiri", "hilda"],
          publicNote: null,
          staffNote:
            "Siiri drops out of the call most weeks — it is her connection, not her.",
          specs: SECOND_GROUP_SPECS,
          startTime: "15:00",
        },
        {
          // The unstaffed group: a real and common state, and the one the
          // catalogue's warning column is most often pointing at.
          id: GROUP_IDS.c,
          name: "Group C",
          gedus: [],
          members: ["marja"],
          publicNote: null,
          staffNote: null,
          specs: SECOND_GROUP_SPECS,
          startTime: "15:00",
        },
      ];

    case "online-club":
      return [
        {
          id: GROUP_IDS.a,
          name: "Group A",
          gedus: [
            { id: GEDU_IDS.sanna, first_name: "Sanna", email: "sanna@sog.gg" },
            { id: GEDU_IDS.onni, first_name: "Onni", email: "onni@sog.gg" },
          ],
          members: ["aino", "vaino", "elias", "linnea"],
          publicNote:
            "The room opens fifteen minutes before we start. Headphones make a big difference.",
          staffNote:
            "Elias's Roblox handle has never checked out — worth fixing on the roster before the showcase.",
          specs: LIVE_CLUB_SPECS,
          startTime: "17:00",
          liveNext: true,
        },
        {
          id: GROUP_IDS.b,
          name: "Group B",
          gedus: [
            { id: GEDU_IDS.petra, first_name: "Petra", email: "petra@sog.gg" },
          ],
          members: ["oskar", "siiri", "hilda", "emil"],
          publicNote: null,
          staffNote: null,
          specs: SECOND_GROUP_SPECS,
          startTime: "17:00",
        },
      ];

    case "camp":
      return [
        {
          id: GROUP_IDS.a,
          name: "Group A",
          gedus: [
            { id: GEDU_IDS.sanna, first_name: "Sanna", email: "sanna@sog.gg" },
            { id: GEDU_IDS.petra, first_name: "Petra", email: "petra@sog.gg" },
          ],
          members: ["aino", "vaino", "elias", "linnea", "oskar"],
          publicNote:
            "Doors open at 09:00 and the day finishes at 14:30. Lunch is included.",
          staffNote: null,
          specs: CAMP_FUTURE_SPECS,
          cadence: "daily",
          startTime: "09:30",
          durationMinutes: 300,
        },
      ];
  }
}

/**
 * The remote club's run, whose newest past week is written and unsent and whose
 * *next* session is the one that matters: a live room, which is a state true for
 * two hours a week and therefore impossible to catch on demand.
 */
const LIVE_CLUB_SPECS: readonly EntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Leaderboards\n\nWe wired up a working leaderboard and immediately spent twenty minutes cheating on it, which turned out to be the best possible way to find the bugs.",
    sendOutcome: "sent",
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.linnea],
    report:
      "Obby week. Everybody built a course and everybody else played it; Väinö's is still undefeated.",
    sendOutcome: "partial",
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "First session of term — accounts, Studio setup, and a very short game each.",
    sendOutcome: "fails",
  },
];
