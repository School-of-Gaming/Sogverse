import { describe, it, expect, beforeAll, vi } from "vitest";
import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { ProductOverviewCard } from "@/components/public/products/product-overview-card";
import { loadMessages } from "@/i18n/messages";

/**
 * **The "Good to know" card, as a family reads it.**
 *
 * Three surfaces render this one card — the shop detail page, the purchase
 * confirmation, the admin product page — and a fourth *mirrors* it in an email
 * through the same shared rules. That is what makes it worth a test of its own:
 * the card is where those rules are turned into the four cells a reader sees,
 * and every one of the four is a composition rather than a lookup. A club's
 * term range is folded into the schedule by one rule; the "Where" line picks a
 * label and a shape from the location row by another; the audience and the age
 * range share a single cell so the grid stays a filled 2×2 on every product.
 *
 * **The translations are the real English strings, not echoed keys.** Half of
 * what is being checked here is *which* label a cell chose — "Where" against
 * "Format", "Age range" against "Audience" — and with keys echoed those
 * assertions would read `info.where` and pass whatever the card decided. The
 * messages are loaded once and the mock walks them, so a wrong branch shows up
 * as the wrong word.
 */
const messages = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) => {
      let node: unknown = messages.current;
      for (const part of `${namespace}.${key}`.split(".")) {
        if (typeof node !== "object" || node === null) break;
        node = Object.getOwnPropertyDescriptor(node, part)?.value;
      }
      if (typeof node !== "string") throw new Error(`missing ${namespace}.${key}`);
      // The one ICU shape these keys use: `{min}` / `{max}` placeholders.
      return node.replace(/\{(\w+)\}/g, (whole, name: string) =>
        values && name in values ? String(values[name]) : whole,
      );
    },
}));

/**
 * The viewer's zone and a stable "now".
 *
 * Both are real providers in the app and both are pinned here for the same
 * reason `now` is an argument everywhere else in this codebase: the schedule
 * line names the *next* occurrence's clock face, so a card reading a live clock
 * would be a test that passed on the day it was written.
 */
vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
  useNow: () => new Date("2027-01-04T08:00:00Z"),
}));

beforeAll(async () => {
  messages.current = await loadMessages("en");
});

type CardProduct = ComponentProps<typeof ProductOverviewCard>["product"];

/**
 * A Monday-afternoon consumer club at a school in Espoo, running one spring
 * term — the ordinary shape, and the one every fact has something to say about.
 */
const CLUB: CardProduct = {
  product_type: "consumer_club",
  start_date: "2027-01-11",
  end_date: "2027-05-31",
  timezone: "Europe/Helsinki",
  schedule_slots: [{ weekday: 0, start_time: "16:00:00", duration_minutes: 60 }],
  is_remote: false,
  locations: {
    id: "loc-tapiolan-koulu",
    name: "Tapiolan koulu",
    name_i18n: null,
    type: "site",
    parent: {
      id: "loc-espoo",
      name: "Espoo",
      name_i18n: { sv: "Esbo" },
      type: "municipality",
    },
  },
  min_age: 8,
  max_age: 12,
  for_gamers: true,
  for_parents: false,
  spoken_language_code: "fi",
};

function renderCard(overrides: Partial<CardProduct> = {}) {
  return render(<ProductOverviewCard product={{ ...CLUB, ...overrides }} />);
}

describe("the four Good to know facts", () => {
  it("states the schedule with the club's own term range under it", () => {
    const { container } = renderCard();
    const text = container.textContent;

    expect(text).toContain("Good to know");
    expect(text).toContain("Schedule");
    expect(text).toContain("Mon");
    expect(text).toContain("16:00–17:00");
    // The term range is the fold that makes this a rule rather than a call: it
    // is nowhere in a club's weekly schedule line, and a surface printing the
    // line alone prints a club with no dates on it.
    expect(text).toContain("2027");
    expect(text).toMatch(/Jan(uary)?/);
    expect(text).toMatch(/May/);
  });

  it("names the site and its municipality under a Where label", () => {
    const { container } = renderCard();
    const text = container.textContent;

    expect(text).toContain("Where");
    expect(text).not.toContain("Format");
    expect(text).toContain("Tapiolan koulu");
    // The municipality is the half a `parent` join can silently drop, which is
    // why the formatter's row type demands the key rather than accepting its
    // absence.
    expect(text).toContain("Espoo");
  });

  it("states a gamers-only product's ages, labelled as a range", () => {
    const { container } = renderCard();
    const text = container.textContent;

    // Gamers-only is the assumed default, so the cell is the range alone: an
    // audience word there would be a row every product grew for no news.
    expect(text).toContain("Age range");
    expect(text).toContain("Ages 8–12");
    expect(text).not.toContain("Audience");
  });

  it("names the spoken language by its flag chip", () => {
    const { container } = renderCard();

    expect(container.textContent).toContain("Language");
    // The chip is the code beside a flag, and the flag is titled with it.
    expect(container.textContent).toContain("FI");
    expect(container.querySelector("svg title")?.textContent).toBe("FI");
  });
});

describe("a product with no site to name", () => {
  /**
   * Remote flips both halves of the same cell: the label stops being a place
   * ("Where") and becomes a delivery method ("Format"), and the value stops
   * being a site and becomes the one word that answers it.
   */
  it("labels the cell Format and answers Online", () => {
    const { container } = renderCard({ is_remote: true, locations: null });
    const text = container.textContent;

    expect(text).toContain("Format");
    expect(text).toContain("Online");
    expect(text).not.toContain("Where");
    expect(text).not.toContain("Tapiolan koulu");
  });
});
