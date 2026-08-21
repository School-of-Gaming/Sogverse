import type { EffectiveProductStatus } from "@/lib/products/effective-status";
import type { ProductType } from "@/types";
import type {
  AdminProductListRow,
  ProductAttentionReason,
} from "./list/admin-product-list-data";

/**
 * Fixtures for the **admin product catalogue** scene: one platform's worth of
 * products across all four types, and the empty platform that has none.
 *
 * **Everything is deterministic.** No `Math.random`, no `Date.now`, no id
 * generated at load. The clock is one pinned instant (below) and every row is a
 * literal, so two reloads render the same page and a screenshot can be compared
 * with the one taken yesterday.
 *
 * **The clock is pinned rather than derived from `useNow()`**, unlike the
 * dashboards' scenes and for the same reason the admin dashboard's is: this list
 * is *about* dates. Which rows are running, which are still pending, which
 * expired without ever starting, and what the default sort therefore puts on
 * top are all arithmetic against a known day. Deriving them from the live clock
 * would make the scene show a different set of cases every morning, and none of
 * them the ones the design was drawn for. The cost is known and honest: this date
 * will eventually be in the past, at which point the fixture reads as a
 * historical catalogue rather than rotting silently.
 */

export const ADMIN_PRODUCT_LIST_SCENARIOS = ["populated", "empty"] as const;

export type AdminProductListScenario =
  (typeof ADMIN_PRODUCT_LIST_SCENARIOS)[number];

export function isAdminProductListScenario(
  value: string,
): value is AdminProductListScenario {
  return (ADMIN_PRODUCT_LIST_SCENARIOS as readonly string[]).includes(value);
}

/** Every product in this fixture is authored in the platform's own zone. */
const TIMEZONE = "Europe/Helsinki";

/** The pinned "now": Monday 17 August 2026 — the same day the dashboard pins. */
export const ADMIN_PRODUCT_LIST_NOW = new Date("2026-08-17T09:20:00+03:00");

/**
 * A compact spec per row, expanded below.
 *
 * Written as a spec rather than as thirty full row literals because almost every
 * field is the same on almost every row, and the differences are what the scene
 * is for: a spec list makes "two clubs identical but for the weekday" one line
 * apart and visibly identical, which is exactly the case the redesign's cadence
 * column exists to answer.
 */
interface RowSpec {
  id: string;
  name: string;
  type: ProductType;
  status: EffectiveProductStatus;
  /** `[weekday, "HH:MM"]` pairs; 0 = Monday. Empty for an unscheduled row. */
  slots?: readonly (readonly [number, string])[];
  durationMinutes?: number;
  startDate?: string | null;
  endDate?: string | null;
  remote?: boolean;
  site?: string | null;
  municipality?: string | null;
  gedus?: readonly string[];
  seatCount?: number | null;
  filled?: number;
  waiting?: number;
  unplaced?: number;
  language?: string;
  unlisted?: boolean;
  /** Beyond the ones derived from the row itself — see `attentionFor`. */
  extraAttention?: readonly ProductAttentionReason[];
  /** Overrides the derived gedu-fee gap; most rows have their fee set. */
  missingGeduFee?: boolean;
  missingMunicipalityFee?: boolean;
}

/**
 * The catalogue: thirty products, every type, every status, both formats.
 *
 * Three things are deliberately planted in it and are the reason it is this long
 * rather than six rows:
 *
 * - **Two pairs of same-named clubs differing only by weekday.** "Minecraft
 *   Builders Espoo" runs twice a week apart, and so does "Roblox Studio
 *   Tapiola". On the live list these two rows are indistinguishable; the cadence
 *   column is the whole answer, and it can only be judged with the pair on
 *   screen together.
 * - **Municipality clubs on both formats, including an online one.** The Vantaa
 *   club meets in a voice room and is still Vantaa's club — the row has to say
 *   so, and it is the one case where "Online" alone would be a lie of omission.
 * - **Every attention reason, and rows with more than one.** The warning column
 *   is one glyph however many things are wrong, so a row carrying three is what
 *   proves the tooltip is doing its job.
 */
const POPULATED_SPECS: readonly RowSpec[] = [
  // ── Consumer clubs ─────────────────────────────────────────────────────
  {
    id: "1e3fd3c2-0b3e-4c1f-8d43-2a4bd60f4a11",
    name: "Minecraft Builders Espoo",
    type: "consumer_club",
    status: "running",
    slots: [[1, "17:00"]],
    startDate: "2026-08-11",
    remote: true,
    gedus: ["Sanna", "Petra"],
    seatCount: 12,
    filled: 12,
    waiting: 3,
  },
  {
    id: "0a1c9b56-3f7d-4a08-9e21-6f6c1b7b0c31",
    name: "Minecraft Builders Espoo",
    type: "consumer_club",
    status: "running",
    slots: [[3, "17:00"]],
    startDate: "2026-08-13",
    remote: true,
    gedus: ["Petra"],
    seatCount: 12,
    filled: 9,
  },
  {
    id: "b0d31a45-79c2-4f5e-9a63-1c8f4d2e5b70",
    name: "Roblox Studio Tapiola",
    type: "consumer_club",
    status: "running",
    slots: [[1, "16:00"]],
    startDate: "2026-08-11",
    remote: false,
    site: "Tapiolan kirjasto",
    gedus: ["Onni"],
    seatCount: 10,
    filled: 7,
    unplaced: 2,
  },
  {
    id: "5f7a2c19-4e8b-4d21-b3a7-9d0e6c1f2a48",
    name: "Roblox Studio Tapiola",
    type: "consumer_club",
    status: "running",
    slots: [[4, "16:00"]],
    startDate: "2026-08-14",
    remote: false,
    site: "Tapiolan kirjasto",
    gedus: [],
    seatCount: 10,
    filled: 4,
  },
  {
    id: "9c2e4b17-6a0d-4f38-8c95-3b7e1d0a6f52",
    name: "Fortnite Creative Club",
    type: "consumer_club",
    status: "pending",
    slots: [[2, "18:00"]],
    startDate: "2026-09-08",
    remote: true,
    gedus: ["Iida"],
    seatCount: 16,
    filled: 5,
  },
  {
    id: "3d8f0a62-1c47-4b93-a2e6-7f5b9d1c0e34",
    name: "Rocket League -klubi Leppävaara",
    type: "consumer_club",
    status: "running",
    slots: [[2, "17:30"], [4, "17:30"]],
    startDate: "2026-08-11",
    remote: false,
    site: "Leppävaaran nuorisotila",
    gedus: ["Topias"],
    seatCount: 14,
    filled: 14,
    waiting: 5,
    missingGeduFee: true,
  },
  {
    id: "7b1c5e08-9d3a-4726-b8f1-0a4e2c6d9b57",
    name: "Stardew Valley -klubi Vallila",
    type: "consumer_club",
    status: "pending",
    slots: [[0, "16:30"]],
    startDate: "2026-09-14",
    remote: true,
    gedus: [],
    seatCount: 12,
    filled: 2,
    language: "fi",
  },
  {
    id: "c4a90d31-2f68-4e15-9b07-6d3a1c8f5e29",
    name: "Terraria Club Kallio",
    type: "consumer_club",
    status: "completed",
    slots: [[3, "17:00"]],
    startDate: "2026-01-14",
    endDate: "2026-05-27",
    remote: true,
    gedus: ["Helmi"],
    seatCount: 12,
    filled: 11,
  },
  {
    id: "e6b28f04-5a1d-4c73-8e92-0b7f3d6a1c48",
    name: "Valorant Club Töölö",
    type: "consumer_club",
    status: "cancelled",
    slots: [[4, "19:00"]],
    startDate: "2026-02-05",
    endDate: "2026-05-28",
    remote: true,
    gedus: ["Venla"],
    seatCount: 10,
    filled: 0,
  },
  {
    id: "a8d05c72-3b94-4f61-a0d8-5e2c7b1f9a36",
    name: "Among Us -klubi Herttoniemi",
    type: "consumer_club",
    status: "expired",
    slots: [[1, "18:00"]],
    startDate: "2026-03-02",
    endDate: "2026-05-25",
    remote: true,
    gedus: [],
    seatCount: 12,
    filled: 3,
    missingGeduFee: true,
  },
  {
    id: "2c7e1b98-4d05-4a36-9f27-8b0d3e6c1a45",
    name: "Splatoon-klubi Käpylä",
    type: "consumer_club",
    status: "pending",
    slots: [[5, "11:00"]],
    startDate: "2026-09-05",
    remote: false,
    site: "Käpylän koulu",
    gedus: ["Onni"],
    seatCount: 12,
    filled: 0,
    unlisted: true,
    language: "sv",
  },

  // ── Municipality clubs ─────────────────────────────────────────────────
  {
    id: "d1f36a80-7c25-4e94-b1a6-3d8f0c5b2e17",
    name: "Espoon pelikerho",
    type: "municipality_club",
    status: "running",
    slots: [[1, "15:00"], [3, "15:00"]],
    startDate: "2026-08-10",
    endDate: "2026-12-18",
    remote: false,
    site: "Tapiolan koulu",
    municipality: "Espoo",
    gedus: ["Sanna", "Iida"],
    seatCount: 24,
    filled: 21,
    unplaced: 1,
    language: "fi",
    extraAttention: ["unwritten_session"],
  },
  {
    id: "f0a94c26-8d13-4b57-92e0-6c1b7f3d5a89",
    name: "Vantaan etäpelikerho",
    type: "municipality_club",
    status: "running",
    slots: [[2, "15:30"]],
    startDate: "2026-08-11",
    endDate: "2026-12-15",
    remote: true,
    municipality: "Vantaa",
    gedus: ["Topias"],
    seatCount: 18,
    filled: 16,
    language: "fi",
  },
  {
    id: "48e2b07d-1a63-4f95-8c20-9d5e3b6c0f14",
    name: "Helsingin koululaisklubi",
    type: "municipality_club",
    status: "running",
    slots: [[0, "14:30"], [4, "14:30"]],
    startDate: "2026-08-10",
    endDate: "2026-12-18",
    remote: false,
    site: "Kallion peruskoulu",
    municipality: "Helsinki",
    gedus: [],
    seatCount: 20,
    filled: 20,
    waiting: 6,
    unplaced: 4,
    language: "fi",
    missingMunicipalityFee: true,
    extraAttention: ["unwritten_session"],
  },
  {
    id: "6b3d1f05-9e28-4c74-a1b6-2f8c0d5e7a93",
    name: "Turun pelikerho",
    type: "municipality_club",
    status: "pending",
    slots: [[3, "16:00"]],
    startDate: "2026-09-03",
    endDate: "2026-12-17",
    remote: false,
    site: "Puolalan koulu",
    municipality: "Turku",
    gedus: ["Venla"],
    seatCount: 18,
    filled: 4,
    language: "fi",
  },
  {
    id: "91c8a3e0-5d47-4b26-8f13-7a0e2c6b9d58",
    name: "Tampereen pelikerho",
    type: "municipality_club",
    status: "completed",
    slots: [[2, "15:00"]],
    startDate: "2026-01-13",
    endDate: "2026-05-26",
    remote: false,
    site: "Tammelan koulu",
    municipality: "Tampere",
    gedus: ["Helmi"],
    seatCount: 20,
    filled: 19,
    language: "fi",
  },
  {
    id: "0d5f7b31-6c92-4a08-b47e-1f3a9d2c8e60",
    name: "Oulun etäkerho",
    type: "municipality_club",
    status: "pending",
    slots: [[1, "16:00"]],
    startDate: "2026-09-07",
    endDate: "2026-12-14",
    remote: true,
    municipality: "Oulu",
    gedus: [],
    seatCount: 16,
    filled: 0,
    language: "fi",
    missingMunicipalityFee: true,
    missingGeduFee: true,
  },

  // ── Camps ──────────────────────────────────────────────────────────────
  {
    id: "7e0b2d94-3f61-4c85-9a27-5d8c1b0f6a34",
    name: "Syyslomaleiri Espoo",
    type: "camp",
    status: "pending",
    slots: [[0, "09:00"], [1, "09:00"], [2, "09:00"], [3, "09:00"], [4, "09:00"]],
    durationMinutes: 360,
    startDate: "2026-10-19",
    endDate: "2026-10-23",
    remote: false,
    site: "Otaniemen kampus",
    gedus: ["Sanna", "Onni"],
    seatCount: 24,
    filled: 18,
    waiting: 2,
  },
  {
    id: "9be159df-ef4b-4a7e-890e-b7fb80c532b3",
    name: "Minecraft Summer Camp Online",
    type: "camp",
    status: "completed",
    slots: [[0, "10:00"], [1, "10:00"], [2, "10:00"], [3, "10:00"], [4, "10:00"]],
    durationMinutes: 300,
    startDate: "2026-06-08",
    endDate: "2026-06-12",
    remote: true,
    gedus: ["Petra", "Iida"],
    seatCount: 30,
    filled: 28,
  },
  {
    id: "c9f14b70-2e83-4a06-9d51-8b3f0c6e2a17",
    name: "Roblox Studio Camp Tampere",
    type: "camp",
    status: "pending",
    slots: [[0, "09:30"], [1, "09:30"], [2, "09:30"]],
    durationMinutes: 300,
    startDate: "2026-12-28",
    endDate: "2026-12-30",
    remote: false,
    site: "Tampereen pääkirjasto",
    gedus: [],
    seatCount: 20,
    filled: 1,
    missingGeduFee: true,
  },
  {
    id: "5d08e3a1-7b46-4c29-8f05-2a9c1e7b3d64",
    name: "Esports Camp Turku",
    type: "camp",
    status: "expired",
    slots: [[0, "10:00"], [1, "10:00"]],
    durationMinutes: 300,
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    remote: false,
    site: "Turun urheiluhalli",
    gedus: ["Venla"],
    seatCount: 24,
    filled: 5,
  },
  {
    id: "8f2a0c65-4d91-4e37-b620-9c5e1a3f7b08",
    name: "Creative Coding Camp Vantaa",
    type: "camp",
    status: "running",
    slots: [[0, "09:00"], [1, "09:00"], [2, "09:00"], [3, "09:00"], [4, "09:00"]],
    durationMinutes: 360,
    startDate: "2026-08-17",
    endDate: "2026-08-21",
    remote: false,
    site: "Myyrmäen nuorisotalo",
    gedus: ["Topias"],
    seatCount: 20,
    filled: 20,
    waiting: 4,
    unplaced: 1,
    language: "en",
  },

  // ── Events ─────────────────────────────────────────────────────────────
  {
    id: "1b7d5f30-8c24-4a96-9e07-3d1f6b0c8a52",
    name: "Parents' Evening — Gaming at Home",
    type: "event",
    status: "pending",
    slots: [[3, "18:00"]],
    durationMinutes: 90,
    startDate: "2026-09-24",
    endDate: "2026-09-24",
    remote: true,
    gedus: ["Helmi"],
    seatCount: null,
    filled: 42,
  },
  {
    id: "6e94a1c8-0b57-4d23-8f16-5a2c9e0d7b31",
    name: "Minecraft Build Battle Finals",
    type: "event",
    status: "pending",
    slots: [[5, "12:00"]],
    durationMinutes: 180,
    startDate: "2026-11-14",
    endDate: "2026-11-14",
    remote: true,
    gedus: ["Sanna", "Petra", "Onni"],
    seatCount: 64,
    filled: 31,
  },
  {
    id: "a0c37e15-9d68-4b04-a2f9-7c6b1d5e0a83",
    name: "Open Day — Tapiolan kirjasto",
    type: "event",
    status: "completed",
    slots: [[5, "11:00"]],
    durationMinutes: 240,
    startDate: "2026-05-16",
    endDate: "2026-05-16",
    remote: false,
    site: "Tapiolan kirjasto",
    gedus: ["Iida"],
    seatCount: 40,
    filled: 37,
  },
  {
    id: "d5b02f89-6a31-4c74-9018-2e7c5a1b6f04",
    name: "Roblox Creator Workshop",
    type: "event",
    status: "cancelled",
    slots: [[6, "13:00"]],
    durationMinutes: 150,
    startDate: "2026-04-19",
    endDate: "2026-04-19",
    remote: true,
    gedus: [],
    seatCount: 50,
    filled: 0,
  },
  {
    id: "f37a6c02-1e59-4d80-b3a5-8d0c2f6b9e14",
    name: "Gedu Meetup Helsinki",
    type: "event",
    status: "pending",
    slots: [[1, "17:00"]],
    durationMinutes: 120,
    startDate: "2026-09-28",
    endDate: "2026-09-28",
    remote: false,
    site: "Kallion peruskoulu",
    gedus: ["Venla", "Topias"],
    seatCount: 30,
    filled: 12,
    unlisted: true,
  },
  {
    id: "4c81e0d7-5f23-4a69-8b12-0a3e7c9d5b26",
    name: "Family Game Night Online",
    type: "event",
    status: "pending",
    slots: [[2, "19:00"]],
    durationMinutes: 90,
    startDate: "2026-10-06",
    endDate: "2026-10-06",
    remote: true,
    gedus: [],
    seatCount: null,
    filled: 8,
    missingGeduFee: true,
  },
];

/**
 * What a row is asking for, derived from the row itself wherever it can be.
 *
 * Derived rather than authored, because these are the same five conditions the
 * live query will have to answer and a fixture that hand-wrote them could show a
 * warning glyph beside a row with an educator in it. The two that cannot be
 * derived from the columns a row carries here — a fee that is null rather than
 * volunteer, and a finished session with no write-up — are flags on the spec.
 */
function attentionFor(spec: RowSpec): ProductAttentionReason[] {
  const reasons: ProductAttentionReason[] = [];
  const live = spec.status === "running" || spec.status === "pending";
  if (live && (spec.gedus?.length ?? 0) === 0) reasons.push("no_gedu");
  if ((spec.unplaced ?? 0) > 0) reasons.push("unplaced");
  if (spec.missingGeduFee) reasons.push("missing_gedu_fee");
  if (spec.missingMunicipalityFee) reasons.push("missing_municipality_fee");
  for (const extra of spec.extraAttention ?? []) reasons.push(extra);
  return reasons;
}

function toRow(spec: RowSpec): AdminProductListRow {
  return {
    id: spec.id,
    name: spec.name,
    productType: spec.type,
    status: spec.status,
    isVisible: spec.unlisted !== true,
    isRemote: spec.remote ?? true,
    schedule: {
      product_type: spec.type,
      start_date: spec.startDate ?? null,
      end_date: spec.endDate ?? null,
      timezone: TIMEZONE,
      schedule_slots: (spec.slots ?? []).map(([weekday, startTime]) => ({
        weekday,
        start_time: startTime,
        duration_minutes: spec.durationMinutes ?? 90,
      })),
    },
    siteName: spec.site ?? null,
    municipalityName: spec.municipality ?? null,
    geduFirstNames: [...(spec.gedus ?? [])],
    seatCount: spec.seatCount === undefined ? null : spec.seatCount,
    filledSeats: spec.filled ?? 0,
    waitlistCount: spec.waiting ?? 0,
    unplacedCount: spec.unplaced ?? 0,
    spokenLanguageCode: spec.language ?? "en",
    attention: attentionFor(spec),
  };
}

export function buildAdminProductListFixture(
  scenario: AdminProductListScenario,
): AdminProductListRow[] {
  if (scenario === "empty") return [];
  return POPULATED_SPECS.map(toRow);
}
