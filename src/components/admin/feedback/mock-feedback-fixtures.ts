import { addCalendarDays, weekdayOf } from "@/lib/calendar-date";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
} from "@/services/session-feedback/admin-feedback.contracts";
import { feedbackRangeBounds, type FeedbackRange } from "./feedback-range";

/**
 * Fixtures for the admin feedback preview scene.
 *
 * **Three scenarios, each a page the others cannot be.** A year of answers, a
 * range nobody answered in, and a read that failed — the last two are not a
 * filter away from the first, so each earns its link.
 *
 * The year is generated rather than written out, from a fixed seed, because the
 * page is about trends and a trend needs a few hundred answers to be one. The
 * generator is deterministic: the same fixture on every reload, so a screenshot
 * taken twice is the same picture. It is built to hold the stories the page
 * exists to surface — a group whose sense of belonging slides over the summer,
 * a Gedu whose sessions are loved, a club that runs every week and hears
 * almost nothing back, and a handful of notes, one of which an admin would want
 * to read today.
 */
export const ADMIN_FEEDBACK_SCENARIOS = ["year", "empty", "load-failed"] as const;

export type AdminFeedbackPreviewScenario =
  (typeof ADMIN_FEEDBACK_SCENARIOS)[number];

export function isAdminFeedbackScenario(
  value: string,
): value is AdminFeedbackPreviewScenario {
  return (ADMIN_FEEDBACK_SCENARIOS as readonly string[]).includes(value);
}

/** The day the fixture year ends on — the scene's "today". */
export const FEEDBACK_FIXTURE_TODAY = "2026-09-28";

const GEDUS = {
  aino: { id: "preview-gedu-aino", name: "Aino Virtanen" },
  mikael: { id: "preview-gedu-mikael", name: "Mikael Korhonen" },
  sofia: { id: "preview-gedu-sofia", name: "Sofia Lindqvist" },
  oskari: { id: "preview-gedu-oskari", name: "Oskari Mäkelä" },
} as const;

interface FixtureGroup {
  ref: AdminFeedbackGroupRef;
  weekday: number;
  gedus: AdminFeedbackGedu[];
  gamers: { id: string; name: string }[];
  /** The share of present gamers who answer. */
  answerRate: number;
  /** Each theme's lean, as the chance an answer lands at 4–5. */
  lean: (progress: number) => Record<string, number>;
}

function gamers(prefix: string, names: string[]) {
  return names.map((name) => ({
    id: `preview-gamer-${prefix}-${name.toLowerCase()}`,
    name,
  }));
}

const GROUPS: FixtureGroup[] = [
  {
    ref: {
      groupId: "preview-group-builders-tue",
      groupName: "Tuesday builders",
      productId: "preview-product-minecraft-club",
      productName: "Minecraft building club",
      productType: "consumer_club",
      isRemote: true,
    },
    weekday: 1,
    gedus: [{ ...GEDUS.aino, role: "primary" }],
    gamers: gamers("tue", ["Eetu", "Linnea", "Onni", "Venla", "Leo"]),
    answerRate: 0.7,
    lean: () => ({ learned: 0.8, fun: 0.9, geduKnowledgeable: 0.92, geduKind: 0.95, groupListens: 0.8 }),
  },
  {
    ref: {
      groupId: "preview-group-builders-thu",
      groupName: "Thursday builders",
      productId: "preview-product-minecraft-club",
      productName: "Minecraft building club",
      productType: "consumer_club",
      isRemote: true,
    },
    weekday: 3,
    gedus: [
      { ...GEDUS.mikael, role: "primary" },
      { ...GEDUS.oskari, role: "assistant" },
    ],
    gamers: gamers("thu", ["Aada", "Elias", "Helmi", "Niilo", "Siiri", "Toivo"]),
    answerRate: 0.6,
    // Belonging slides as the year goes on — the story the trend should tell.
    lean: (progress) => ({
      learned: 0.7,
      fun: 0.8,
      geduKnowledgeable: 0.75,
      geduKind: 0.8,
      groupListens: 0.8 - progress * 0.45,
    }),
  },
  {
    ref: {
      groupId: "preview-group-roblox-wed",
      groupName: "Wednesday creators",
      productId: "preview-product-roblox-club",
      productName: "Roblox game design club",
      productType: "consumer_club",
      isRemote: true,
    },
    weekday: 2,
    gedus: [{ ...GEDUS.sofia, role: "primary" }],
    gamers: gamers("wed", ["Ilona", "Kasper", "Lumi", "Vilho"]),
    answerRate: 0.8,
    lean: (progress) => ({
      learned: 0.6 + progress * 0.25,
      fun: 0.85,
      geduKnowledgeable: 0.85,
      geduKind: 0.9,
      groupListens: 0.75,
    }),
  },
  {
    ref: {
      groupId: "preview-group-tampere-mon",
      groupName: "Hervanta Monday",
      productId: "preview-product-tampere-club",
      productName: "Tampere online club",
      productType: "municipality_club",
      isRemote: true,
    },
    weekday: 0,
    gedus: [{ ...GEDUS.oskari, role: "primary" }],
    gamers: gamers("mon", ["Aleksi", "Emma", "Jooa", "Minea", "Pihla", "Rasmus"]),
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

function buildYear(): AdminFeedbackDataset {
  const { from, to } = feedbackRangeBounds("12m", FEEDBACK_FIXTURE_TODAY);
  const random = seeded(20260928);
  const responses: AdminFeedbackResponse[] = [];
  const sessions: AdminFeedbackSession[] = [];
  const totalDays = 365;
  let noteIndex = 0;

  for (let day = 0; day < totalDays; day += 1) {
    const date = addCalendarDays(from, day);
    if (date > to) break;
    const weekday = weekdayOf(date);
    // A summer break, as clubs have: no sessions from mid-June to early August.
    const monthDay = date.slice(5);
    if (monthDay >= "06-15" && monthDay < "08-05") continue;

    for (const group of GROUPS) {
      if (group.weekday !== weekday) continue;
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
          submittedAt: `${date}T16:${String(10 + responses.length % 40).padStart(2, "0")}:00Z`,
        });
      }
    }
  }

  return { from, to, responses, sessions };
}

const YEAR = buildYear();

/** The fixture year narrowed to the session days a range covers. */
export function feedbackFixture(
  scenario: Exclude<AdminFeedbackPreviewScenario, "load-failed">,
  range: FeedbackRange,
): AdminFeedbackDataset {
  const { from, to } = feedbackRangeBounds(range, FEEDBACK_FIXTURE_TODAY);
  if (scenario === "empty") return { from, to, responses: [], sessions: [] };
  const within = (row: { sessionDate: string }) =>
    row.sessionDate >= from && row.sessionDate <= to;
  return {
    from,
    to,
    responses: YEAR.responses.filter(within),
    sessions: YEAR.sessions.filter(within),
  };
}
