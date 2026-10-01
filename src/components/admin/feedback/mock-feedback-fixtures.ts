import { addCalendarDays, weekdayOf } from "@/lib/calendar-date";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
} from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackDimension, FeedbackPeriod, FeedbackScopeKind } from "./aggregate-feedback";
import { feedbackRangePeriods, feedbackReadSpan } from "./feedback-range";

/**
 * Fixtures for the admin feedback preview scene.
 *
 * **One scenario per page, plus the two states no page of answers can show**:
 * the overview, a list, a product, a group, a Gedu, a gamer and the notes are
 * each a different page; a range nobody answered in and a read that failed are
 * not a click away from any of them.
 *
 * Two years are generated rather than written out, from a fixed seed, because
 * the pages compare a range with the one before it and a trend needs a few
 * hundred answers to be one. The generator is deterministic: the same fixture
 * on every reload. It holds the stories the pages exist to surface — a group
 * whose sense of belonging slides, a Gedu whose sessions are loved, a club that
 * runs every week and hears almost nothing back, a group too new to judge, and
 * a handful of notes, one of which an admin would want to read today.
 */
export const ADMIN_FEEDBACK_SCENARIOS = [
  "overview",
  "list",
  "product",
  "group",
  "gedu",
  "gamer",
  "notes",
  "empty",
  "load-failed",
] as const;

export type AdminFeedbackPreviewScenario = (typeof ADMIN_FEEDBACK_SCENARIOS)[number];

export function isAdminFeedbackScenario(value: string): value is AdminFeedbackPreviewScenario {
  return (ADMIN_FEEDBACK_SCENARIOS as readonly string[]).includes(value);
}

/** The day the fixture ends on — the scene's "today". */
export const FEEDBACK_FIXTURE_TODAY = "2026-09-28";

const PRODUCTS = {
  minecraft: {
    productId: "1918c4a0-7549-4020-9be7-48f8eb7b5cb2",
    productName: "Minecraft building club",
    productType: "consumer_club",
    isRemote: true,
  },
  roblox: {
    productId: "6e8b4d01-c0bb-425f-a2fa-224d02dc9dbd",
    productName: "Roblox game design club",
    productType: "consumer_club",
    isRemote: true,
  },
  tampere: {
    productId: "081e1e8d-4c4e-4e3a-aff0-2c71d663aa9c",
    productName: "Tampere online club",
    productType: "municipality_club",
    isRemote: true,
  },
} as const satisfies Record<string, Omit<AdminFeedbackGroupRef, "groupId" | "groupName">>;

const GEDUS = {
  aino: { id: "fbb37487-2f16-4311-982e-d6bdd8297803", name: "Aino Virtanen" },
  mikael: { id: "32ff6486-a511-47d2-af16-d32805d8b752", name: "Mikael Korhonen" },
  sofia: { id: "43fa5eeb-7e27-4f22-93a9-9f264149cc51", name: "Sofia Lindqvist" },
  oskari: { id: "ed68011a-c36a-4d07-95dd-6d49b10181a3", name: "Oskari Mäkelä" },
} as const;

const GROUP_IDS = {
  tuesday: "69832141-6a35-436a-8c4f-34f397a8ac1a",
  thursday: "0e899757-d789-4fe0-a083-7ef9185e4a72",
  wednesday: "e6b2dd62-9e8b-4d86-b1bc-eb2ffa642969",
  monday: "85e24989-b67c-48c7-88ad-c8f6b4f773ff",
  saturday: "a2b4bf76-9060-4db7-a5b9-f7c55f382fce",
} as const;

const GAMERS = {
  eetu: { id: "df0d3591-d491-44d6-9d73-94c2fb740ff5", name: "Eetu" },
  linnea: { id: "6801a3c2-0237-4192-8a8e-9f150851ae22", name: "Linnea" },
  onni: { id: "2ee12040-cdc2-4118-b26f-6efa54431b11", name: "Onni" },
  venla: { id: "c55daf6d-29e8-4d86-b3bf-2a778c951823", name: "Venla" },
  leo: { id: "04f1f0bf-d722-469b-b5c1-223ea3b9ed3e", name: "Leo" },
  aada: { id: "0084f914-f779-4c61-8625-77fb8522a82a", name: "Aada" },
  elias: { id: "b70563fb-cab1-42be-9954-58d36fb52910", name: "Elias" },
  helmi: { id: "7e1a660c-ac75-41af-803f-4bcef80cecb2", name: "Helmi" },
  niilo: { id: "d557d9cd-d9a7-4366-9c10-de49d4f64ed2", name: "Niilo" },
  siiri: { id: "e7422f8f-1783-459d-9cfc-4813a106bbb7", name: "Siiri" },
  toivo: { id: "8f55a170-3344-410c-9564-b3d7dd62e5f2", name: "Toivo" },
  ilona: { id: "196a52e6-ee68-43aa-81e3-4982de8fbbc0", name: "Ilona" },
  kasper: { id: "80da6c86-216a-48c8-9643-4749bbb94cc4", name: "Kasper" },
  lumi: { id: "d67f06e2-7119-424b-ba86-d384fcbcfad3", name: "Lumi" },
  vilho: { id: "2e4f0461-bb1a-48d0-83d4-3415e6312b2f", name: "Vilho" },
  aleksi: { id: "a26531b5-0655-4124-b114-91b9b139088e", name: "Aleksi" },
  emma: { id: "27b1768e-8689-4d54-9ddb-b5d52b080067", name: "Emma" },
  jooa: { id: "a0add629-7c86-4193-a12c-c7a20ad8b8c4", name: "Jooa" },
  minea: { id: "226feea3-e2b0-4cdf-ad28-cc0a9d65619f", name: "Minea" },
  pihla: { id: "e7a844ec-135b-47fa-bee1-657224cc6789", name: "Pihla" },
  rasmus: { id: "4477e8c9-5bb7-45e0-b850-6288ef976612", name: "Rasmus" },
  saga: { id: "faa01d0c-2958-45e0-bf9f-e499e97f5001", name: "Saga" },
  otso: { id: "66dbfaf4-79df-4962-8ec4-07ce7bbd855a", name: "Otso" },
  iida: { id: "f64b69e0-b587-4153-a42d-37cc1995ac43", name: "Iida" },
  kerttu: { id: "d5861d1b-5fab-4999-8d14-5913781d2a27", name: "Kerttu" },
  vilja: { id: "624788b4-3f77-4759-bc13-061eb2879591", name: "Vilja" },
} as const;

/** The scope each detail scenario opens on when the scene is given no `?id=`. */
export const FEEDBACK_FIXTURE_FEATURED: Record<FeedbackScopeKind, string> = {
  product: PRODUCTS.minecraft.productId,
  group: GROUP_IDS.thursday,
  gedu: GEDUS.mikael.id,
  gamer: GAMERS.helmi.id,
};

/** The list scenario's dimension when the scene is given no `?dimension=`. */
export const FEEDBACK_FIXTURE_LIST: FeedbackDimension = "group";

interface FixtureGroup {
  ref: AdminFeedbackGroupRef;
  weekday: number;
  /** The first session day; nothing before it. */
  startsOn?: string;
  gedus: AdminFeedbackGedu[];
  gamers: { id: string; name: string }[];
  /** The share of present gamers who answer. */
  answerRate: number;
  /** Each statement's lean, as the chance an answer lands at 4–5. */
  lean: (progress: number) => Record<string, number>;
}

const GROUPS: FixtureGroup[] = [
  {
    ref: { ...PRODUCTS.minecraft, groupId: GROUP_IDS.tuesday, groupName: "Tuesday builders" },
    weekday: 1,
    gedus: [{ ...GEDUS.aino, role: "primary" }],
    gamers: [GAMERS.eetu, GAMERS.linnea, GAMERS.onni, GAMERS.venla, GAMERS.leo],
    answerRate: 0.85,
    lean: () => ({ learned: 0.85, fun: 0.92, geduKnowledgeable: 0.94, geduKind: 0.96, groupListens: 0.85 }),
  },
  {
    ref: { ...PRODUCTS.minecraft, groupId: GROUP_IDS.thursday, groupName: "Thursday builders" },
    weekday: 3,
    gedus: [
      { ...GEDUS.mikael, role: "primary" },
      { ...GEDUS.oskari, role: "assistant" },
    ],
    gamers: [
      GAMERS.aada,
      GAMERS.elias,
      GAMERS.helmi,
      GAMERS.kerttu,
      GAMERS.niilo,
      GAMERS.siiri,
      GAMERS.toivo,
      GAMERS.vilja,
    ],
    answerRate: 0.85,
    // Belonging slides as the second year goes on, and takes the fun with it —
    // the story the pages should tell.
    lean: (progress) => {
      const slide = Math.max(0, progress - 0.5) * 2;
      return {
        learned: 0.78,
        fun: 0.85 - slide * 0.3,
        geduKnowledgeable: 0.8,
        geduKind: 0.85 - slide * 0.15,
        groupListens: 0.85 - slide * 0.65,
      };
    },
  },
  {
    ref: { ...PRODUCTS.roblox, groupId: GROUP_IDS.wednesday, groupName: "Wednesday creators" },
    weekday: 2,
    gedus: [{ ...GEDUS.sofia, role: "primary" }],
    gamers: [GAMERS.ilona, GAMERS.kasper, GAMERS.lumi, GAMERS.vilho],
    answerRate: 0.9,
    lean: (progress) => ({
      learned: 0.6 + progress * 0.3,
      fun: 0.88,
      geduKnowledgeable: 0.9,
      geduKind: 0.92,
      groupListens: 0.8,
    }),
  },
  {
    ref: { ...PRODUCTS.roblox, groupId: GROUP_IDS.saturday, groupName: "Saturday starters" },
    weekday: 5,
    // Too new to say anything about: listed, never judged.
    startsOn: "2026-09-19",
    gedus: [{ ...GEDUS.sofia, role: "primary" }],
    gamers: [GAMERS.saga, GAMERS.otso, GAMERS.iida],
    answerRate: 0.7,
    lean: () => ({ learned: 0.8, fun: 0.9, geduKnowledgeable: 0.9, geduKind: 0.9, groupListens: 0.85 }),
  },
  {
    ref: { ...PRODUCTS.tampere, groupId: GROUP_IDS.monday, groupName: "Hervanta Monday" },
    weekday: 0,
    gedus: [{ ...GEDUS.oskari, role: "primary" }],
    gamers: [GAMERS.aleksi, GAMERS.emma, GAMERS.jooa, GAMERS.minea, GAMERS.pihla, GAMERS.rasmus],
    // Runs every week and hears almost nothing back.
    answerRate: 0.12,
    lean: () => ({ learned: 0.6, fun: 0.65, geduKnowledgeable: 0.7, geduKind: 0.75, groupListens: 0.6 }),
  },
];

const NOTES = [
  "We built a whole castle together, it was the best!",
  "Can we do redstone next time?",
  "My internet kept cutting out so I missed the middle.",
  "Some of the others kept talking over me and nobody listened when I had an idea.",
  "The new map was really cool.",
  "I wish the session was longer.",
];

/** A small deterministic generator, so the fixture is the same on every load. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rating(random: () => number, lean: number): number {
  if (random() < lean) return random() < 0.55 ? 5 : 4;
  const low = random();
  return low < 0.5 ? 3 : low < 0.8 ? 2 : 1;
}

/** Everything the scene can be asked for: the 12-month range and the 12 months before it. */
function buildHistory(): AdminFeedbackDataset {
  const { from, to } = feedbackReadSpan(feedbackRangePeriods("12m", FEEDBACK_FIXTURE_TODAY));
  const random = seeded(20260928);
  const responses: AdminFeedbackResponse[] = [];
  const sessions: AdminFeedbackSession[] = [];
  let noteIndex = 0;
  let totalDays = 0;
  while (addCalendarDays(from, totalDays) <= to) totalDays += 1;

  for (let day = 0; day < totalDays; day += 1) {
    const date = addCalendarDays(from, day);
    const weekday = weekdayOf(date);
    // A summer break, as clubs have: no sessions from mid-June to early August.
    const monthDay = date.slice(5);
    if (monthDay >= "06-15" && monthDay < "08-05") continue;

    for (const group of GROUPS) {
      if (group.weekday !== weekday) continue;
      if (group.startsOn !== undefined && date < group.startsOn) continue;
      const present = group.gamers.filter(() => random() < 0.85);
      sessions.push({
        ...group.ref,
        source: "gamer_online",
        sessionDate: date,
        eligibleCount: present.length,
        gedus: group.gedus,
      });

      const lean = group.lean(day / totalDays);
      for (const gamer of present) {
        if (random() >= group.answerRate) continue;
        const answers: Record<string, number> = {};
        for (const [key, chance] of Object.entries(lean)) {
          if (random() < 0.95) answers[key] = rating(random, chance);
        }
        const note = random() < 0.08 ? NOTES[noteIndex++ % NOTES.length] : "";
        responses.push({
          ...group.ref,
          source: "gamer_online",
          sessionDate: date,
          respondent: gamer,
          gedus: group.gedus,
          answers,
          note,
          // Most sessions have their register taken; now and then one does not.
          countsTowardRate: random() < 0.92,
          submittedAt: `${date}T16:${String(10 + (responses.length % 40)).padStart(2, "0")}:00Z`,
        });
      }
    }
  }

  return { from, to, responses, sessions };
}

const HISTORY = buildHistory();

/** The fixture narrowed to the span a page reads, or that span with nothing in it. */
export function feedbackFixture(span: FeedbackPeriod, empty: boolean): AdminFeedbackDataset {
  const { from, to } = span;
  if (empty) return { from, to, responses: [], sessions: [] };
  const within = (row: { sessionDate: string }) => row.sessionDate >= from && row.sessionDate <= to;
  return {
    from,
    to,
    responses: HISTORY.responses.filter(within),
    sessions: HISTORY.sessions.filter(within),
  };
}
