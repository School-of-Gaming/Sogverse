/**
 * Four Finnish seasons and a handful of days that matter, as looks a mascot
 * can be dressed in — and one pure function that picks today's.
 *
 * ## Why this is a whole module and not five palette presets
 *
 * Round one had "winter" and "summer" as two-colour overrides, and the verdict
 * was that the palette control appeared to do nothing. It was right: a season
 * that only recolours a shirt is invisible on a character wearing no shirt,
 * and even on one that is, a red hoodie in December is not winter. A season is
 * a **hat, a scarf, something on the ground and a mosquito** — a set of
 * *things*, with colours as the smallest part of it. So a look here is an
 * outfit plus a repaint, and the repaint alone is never the whole answer.
 *
 * ## The boundaries are a product judgement, and here it is
 *
 * Finland has no single official answer. The meteorological definition moves
 * every year and by hundreds of kilometres of latitude — spring reaches Hanko
 * six weeks before it reaches Utsjoki — and the astronomical one puts midsummer
 * at the *start* of summer, which no Finn experiences that way. Neither can
 * drive a website.
 *
 * So these are calendar dates, chosen to match how the year is actually lived
 * and talked about in southern Finland, where most of our families are:
 *
 * - **talvi** — 1 December to 15 March. Starts with the dark and the first
 *   snow, runs through to the thaw. The longest season, and correctly so.
 * - **kevät** — 16 March to 31 May. Meltwater, light coming back, the term
 *   grinding to its end.
 * - **kesä** — 1 June to 31 August. School is out and the clubs move outdoors.
 * - **syksy** — 1 September to 30 November. Term starts, leaves turn, dark
 *   returns.
 *
 * Anyone is free to disagree with 15 March; the point is that the number is
 * written down in one place with a reason, rather than being implied by a
 * comparison buried in a component.
 *
 * ## Timezone
 *
 * Every decision is made against the **Europe/Helsinki** calendar date, via
 * `formatInTimeZone`, because "is it Christmas" is a question about the
 * product's home calendar and not about the viewer's clock or the server's.
 * A viewer in Sydney on the morning of 25 December Helsinki time sees the
 * Christmas look, which is the right answer for a Finnish company's website.
 * The repo's date rules forbid `toISOString().slice(0,10)` for exactly the
 * off-by-one this would otherwise have.
 */

import { formatInTimeZone } from "date-fns-tz";

import type { Outfit } from "./outfit";
import { swatchHex, tintHex, type ColorOverride } from "./palette";

/** The product's home calendar. Every seasonal decision is made against it. */
export const MASCOT_TIMEZONE = "Europe/Helsinki";

export const SEASONS = ["talvi", "kevat", "kesa", "syksy"] as const;
export type SeasonId = (typeof SEASONS)[number];

export const HOLIDAYS = [
  "paasiainen",
  "vappu",
  "juhannus",
  "saaristo",
  "avaruusviikko",
  "halloween",
  "itsenaisyyspaiva",
  "joulu",
] as const;
export type HolidayId = (typeof HOLIDAYS)[number];

/** One dressed-for-the-occasion look. */
export type MascotLook = {
  id: string;
  /** The Finnish name, which is what these are actually called. */
  label: string;
  /** English gloss plus what the look is made of. */
  note: string;
  season: SeasonId;
  holiday?: HolidayId;
  outfit: Outfit;
  colors: ColorOverride;
};

export const SEASON_LOOKS: Record<SeasonId, MascotLook> = {
  talvi: {
    id: "talvi",
    label: "Talvi",
    note: "Winter, 1 Dec – 15 Mar. Earflap hat, scarf, snow underfoot.",
    season: "talvi",
    outfit: { hat: "earflap-hat", torso: "scarf", extra: "snowdrift" },
    colors: { clothing: "#2F6FA8", clothingAccent: "#FFFFFF" },
  },
  kevat: {
    id: "kevat",
    label: "Kevät",
    note: "Spring, 16 Mar – 31 May. Tee, meltwater and the first sprout.",
    season: "kevat",
    outfit: { torso: "tee", extra: "thaw" },
    colors: { clothing: "#4FB477", clothingAccent: "#F4F1C8" },
  },
  kesa: {
    id: "kesa",
    label: "Kesä",
    note: "Summer, 1 Jun – 31 Aug. Sun hat, shades, and the national bird.",
    season: "kesa",
    outfit: { hat: "sunhat", face: "shades", torso: "tee", extra: "mosquito" },
    colors: { clothing: "#2AB6A6", clothingAccent: "#FFF7DC" },
  },
  syksy: {
    id: "syksy",
    label: "Syksy",
    note: "Autumn, 1 Sep – 30 Nov. Beanie, hoodie, leaves coming down.",
    season: "syksy",
    outfit: { hat: "beanie", torso: "hoodie", extra: "leaves" },
    colors: { clothing: "#C1541F", clothingAccent: "#F2A65A" },
  },
};

export const HOLIDAY_LOOKS: Record<HolidayId, MascotLook> = {
  paasiainen: {
    id: "paasiainen",
    label: "Pääsiäinen",
    note: "Easter, Good Friday to Easter Monday. Ears and a painted egg.",
    season: "kevat",
    holiday: "paasiainen",
    outfit: { hat: "bunny-ears", torso: "tee", extra: "egg" },
    colors: { clothing: "#F2C14E", clothingAccent: "#8FD694" },
  },
  vappu: {
    id: "vappu",
    label: "Vappu",
    note: "30 Apr – 1 May. The student cap and balloons, which is the whole day.",
    season: "kevat",
    holiday: "vappu",
    outfit: { hat: "student-cap", torso: "tee", back: "balloons" },
    colors: { clothing: "#F26D9C", clothingAccent: "#FFFFFF" },
  },
  juhannus: {
    id: "juhannus",
    label: "Juhannus",
    note: "Midsummer eve and day. Flower crown and a bonfire.",
    season: "kesa",
    holiday: "juhannus",
    outfit: { hat: "flower-crown", torso: "tee", extra: "bonfire" },
    colors: { clothing: "#3FA34D", clothingAccent: "#FFE9A3" },
  },
  /**
   * Saaristo — the whole of July.
   *
   * The odd one in this table, and worth defending. Every other entry here is
   * a day or a weekend; this is thirty-one of them, and it is filed as a
   * holiday rather than as a season because that is what July is in this
   * country. The statutory summer leave is taken in it, the clubs stop, the
   * cities empty and the coast fills up — *heinäkuu* is the month a Finn is
   * away, and the archipelago is where they went. A generic `kesä` look on the
   * one month nobody is at their desk is the wrong picture of the year.
   *
   * Mechanically it is also the cheapest place to put it: `holidayForDate`
   * already overrides the season, so a whole-month entry needs one line and
   * inherits the Helsinki-calendar handling every other look gets.
   */
  saaristo: {
    id: "saaristo",
    label: "Saaristo",
    note: "July, the whole month. Captain's cap and Breton stripes, out on the water.",
    season: "kesa",
    holiday: "saaristo",
    outfit: { hat: "captain-cap", torso: "sailor-shirt" },
    colors: { clothing: swatchHex("sky"), clothingAccent: tintHex(swatchHex("sky"), 0.9) },
  },
  /**
   * World Space Week, 4-10 October - an international celebration of science
   * and technology observed in over 95 nations, and the week School of Gaming
   * Galactic Oy was never going to sit out. Kyle's correction to "no week of
   * the year is space": there is exactly one, and this is it.
   */
  avaruusviikko: {
    id: "avaruusviikko",
    label: "Avaruusviikko",
    note: "4-10 Oct, World Space Week. Helmets on - the galactic in the company name.",
    season: "syksy",
    holiday: "avaruusviikko",
    outfit: { hat: "space-helmet", torso: "tee" },
    colors: { clothing: swatchHex("indigo"), clothingAccent: tintHex(swatchHex("cyan"), 0.55) },
  },
  halloween: {
    id: "halloween",
    label: "Halloween",
    note: "29–31 Oct. Not a Finnish tradition, and the kids do not care.",
    season: "syksy",
    holiday: "halloween",
    outfit: { hat: "witch-hat", back: "cape", extra: "pumpkin" },
    colors: { clothing: "#2A1B3D", clothingAccent: "#FF8A2B" },
  },
  itsenaisyyspaiva: {
    id: "itsenaisyyspaiva",
    label: "Itsenäisyyspäivä",
    note: "6 Dec. Two candles in the window — the actual tradition, not a flag.",
    season: "talvi",
    holiday: "itsenaisyyspaiva",
    outfit: { torso: "scarf", extra: "candles" },
    colors: { clothing: "#1F4E9C", clothingAccent: "#FFFFFF" },
  },
  joulu: {
    id: "joulu",
    label: "Joulu",
    note: "20–26 Dec. Hat, scarf, and something under the tree.",
    season: "talvi",
    holiday: "joulu",
    outfit: { hat: "santa-hat", torso: "scarf", extra: "gift" },
    colors: { clothing: "#B23A48", clothingAccent: "#FFFFFF" },
  },
};

/** Every look, seasons first — the order the season strip renders them in. */
export const MASCOT_LOOKS: readonly MascotLook[] = [
  ...SEASONS.map((s) => SEASON_LOOKS[s]),
  ...HOLIDAYS.map((h) => HOLIDAY_LOOKS[h]),
];

export function lookById(id: string): MascotLook | undefined {
  return MASCOT_LOOKS.find((look) => look.id === id);
}

/** The season a Helsinki calendar date falls in. See the boundaries above. */
export function seasonForDate(month: number, day: number): SeasonId {
  if (month === 12 || month <= 2) return "talvi";
  if (month === 3) return day <= 15 ? "talvi" : "kevat";
  if (month <= 5) return "kevat";
  if (month <= 8) return "kesa";
  return "syksy";
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm.
 *
 * Pure integer arithmetic on the year — no Date involved, so no timezone can
 * touch it. Returns a UTC-pinned day number, which is the only safe currency
 * for the two-days-before to one-day-after window Easter actually occupies.
 */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

const DAY_MS = 86_400_000;

/**
 * Juhannus: midsummer day is the Saturday falling between 20 and 26 June, and
 * the eve — which is the day Finland actually stops — is the Friday before.
 *
 * The weekday is read off a UTC-pinned date rather than a local one, because
 * UTC has no daylight saving and a calendar weekday is not a question about
 * anybody's clock.
 */
function juhannusEve(year: number): number {
  for (let day = 19; day <= 25; day += 1) {
    const stamp = Date.UTC(year, 5, day);
    if (new Date(stamp).getUTCDay() === 5) return stamp;
  }
  // Unreachable: one of 19–25 June is always a Friday.
  return Date.UTC(year, 5, 19);
}

/** The holiday a Helsinki calendar date falls on, if any. */
export function holidayForDate(year: number, month: number, day: number): HolidayId | undefined {
  if (month === 12 && day === 6) return "itsenaisyyspaiva";
  if (month === 12 && day >= 20 && day <= 26) return "joulu";
  if ((month === 4 && day === 30) || (month === 5 && day === 1)) return "vappu";
  if (month === 10 && day >= 29) return "halloween";
  // World Space Week is fixed by the UN as 4-10 October; no collision - the
  // month's only other entry starts on the 29th.
  if (month === 10 && day >= 4 && day <= 10) return "avaruusviikko";
  // The whole of July. Placed among the fixed dates rather than after them
  // because it cannot collide with any of them: juhannus is always in June,
  // and Easter can reach 25 April but never July.
  if (month === 7) return "saaristo";

  const today = Date.UTC(year, month - 1, day);
  const eve = juhannusEve(year);
  if (today >= eve && today <= eve + DAY_MS) return "juhannus";

  // Good Friday through Easter Monday. Checked last so a fixed date always
  // wins a collision — Easter can reach 25 April but never 1 May.
  const easter = easterSunday(year);
  if (today >= easter - 2 * DAY_MS && today <= easter + DAY_MS) return "paasiainen";

  return undefined;
}

/**
 * Today's look: the holiday if there is one, otherwise the season.
 *
 * `now` is an argument rather than a call to `new Date()` inside, so a server
 * render and the hydration that follows it can be handed the same instant. A
 * component that resolves its own "now" on both sides of the boundary is a
 * hydration mismatch waiting for the one request that straddles midnight.
 */
export function lookForDate(now: Date, timeZone: string = MASCOT_TIMEZONE): MascotLook {
  const stamp = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [year, month, day] = stamp.split("-").map(Number);
  const holiday = holidayForDate(year, month, day);
  return holiday === undefined ? SEASON_LOOKS[seasonForDate(month, day)] : HOLIDAY_LOOKS[holiday];
}
