import { describe, it, expect, beforeAll, vi } from "vitest";
import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { ProductOverviewCard } from "@/components/public/products/product-overview-card";
import { loadMessages } from "@/i18n/messages";
import { holidayBreakRows } from "@/lib/holiday-breaks";
import { formatCompactDateRange } from "@/lib/date-format";

/**
 * **The "Holiday breaks" row of the "Good to know" card**, which the product
 * page and the purchase confirmation both draw: which of a club's breaks it
 * lists, the words it draws each in, and that it is absent when it would be
 * empty. The card is the subject rather than the bare list, because the card is
 * where the choice is made and where an empty list has to leave no heading.
 *
 * The strings are the real English ones walked out of the catalog, as the
 * card's own suite does, so a wrong label shows up as the wrong word.
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
      return node.replace(/\{(\w+)\}/g, (whole, name: string) =>
        values && name in values ? String(values[name]) : whole,
      );
    },
}));

/** Today is 4 January 2027, in Helsinki as everywhere. */
vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
  useNow: () => new Date("2027-01-04T08:00:00Z"),
}));

beforeAll(async () => {
  messages.current = await loadMessages("en");
});

const TODAY = "2027-01-04";

type CardProduct = ComponentProps<typeof ProductOverviewCard>["product"];

/** A Monday-afternoon online club running one spring term. */
const CLUB: CardProduct = {
  product_type: "consumer_club",
  start_date: "2027-01-11",
  end_date: "2027-05-31",
  timezone: "Europe/Helsinki",
  schedule_slots: [{ weekday: 0, start_time: "16:00:00", duration_minutes: 60 }],
  is_remote: true,
  locations: null,
  min_age: 8,
  max_age: 12,
  for_gamers: true,
  for_parents: false,
  spoken_language_code: "fi",
};

/** Breaks as the read returns them, parsed through the app's own schema. */
function breaks(
  rows: {
    id: string;
    from: string;
    to: string;
    withdrew?: boolean;
    names?: { locale: string; name: string }[];
  }[],
) {
  return holidayBreakRows.parse(
    rows.map(({ id, from, to, withdrew = true, names }) => ({
      id,
      start_date: from,
      end_date: to,
      names: names ?? [{ locale: "en", name: `Break ${id}` }],
      withdrawn_sessions: withdrew
        ? [{ session_date: from, starts_at: `${from}T14:00:00Z`, ends_at: `${from}T15:00:00Z` }]
        : [],
    })),
  );
}

function renderCard(
  holidayBreaks: ReturnType<typeof breaks>,
  overrides: Partial<CardProduct> = {},
) {
  return render(
    <ProductOverviewCard product={{ ...CLUB, ...overrides }} holidayBreaks={holidayBreaks} />,
  );
}

/** The lines under the "Holiday breaks" label — the schedule may be a list too. */
function listItems(container: HTMLElement): (string | null)[] {
  const label = [...container.querySelectorAll("dt")].find(
    (dt) => dt.textContent === "Holiday breaks",
  );
  const row = label?.parentElement;
  return row ? [...row.querySelectorAll("li")].map((li) => li.textContent) : [];
}

describe("the Holiday breaks row", () => {
  it("lists a dated club's breaks still to come that take a session, each with its compact range", () => {
    const { container } = renderCard(
      breaks([
        { id: "past", from: "2026-12-21", to: "2027-01-01", names: [{ locale: "en", name: "Christmas break" }] },
        { id: "a", from: "2027-02-22", to: "2027-02-26", names: [{ locale: "en", name: "Winter break" }] },
        { id: "b", from: "2027-03-05", to: "2027-03-05", withdrew: false, names: [{ locale: "en", name: "Teacher day" }] },
        { id: "c", from: "2027-04-01", to: "2027-04-01", names: [{ locale: "en", name: "Easter" }] },
      ]),
      // A club that began last autumn, so its term holds a break already over.
      { start_date: "2026-08-10" },
    );

    expect(container.textContent).toContain("Holiday breaks");
    expect(listItems(container)).toEqual([
      `Winter break${formatCompactDateRange("2027-02-22", "2027-02-26", "en", TODAY)}`,
      // One day names one date.
      `Easter${formatCompactDateRange("2027-04-01", "2027-04-01", "en", TODAY)}`,
    ]);
    // A break that is over is not listed, however much of the term it took.
    expect(container.textContent).not.toContain("Christmas break");
    // A break that removed no session is not one this club takes.
    expect(container.textContent).not.toContain("Teacher day");
  });

  it("lists every break an open-ended club has still to come, more than three included", () => {
    const { container } = renderCard(
      breaks([
        { id: "past", from: "2026-12-21", to: "2027-01-01" },
        { id: "one", from: "2027-02-22", to: "2027-02-26" },
        { id: "two", from: "2027-04-01", to: "2027-04-05" },
        { id: "three", from: "2027-10-18", to: "2027-10-22" },
        { id: "four", from: "2027-12-20", to: "2028-01-05" },
      ]),
      { end_date: null },
    );

    expect(listItems(container)).toHaveLength(4);
    const text = container.textContent;
    for (const id of ["one", "two", "three", "four"]) {
      expect(text).toContain(`Break ${id}`);
    }
    expect(text).not.toContain("Break past");
  });

  it("names a break in English where the reader's locale is not written, else the first written", () => {
    const { container } = renderCard(
      breaks([
        {
          id: "a",
          from: "2027-02-22",
          to: "2027-02-26",
          names: [
            { locale: "fi", name: "Talviloma" },
            { locale: "en", name: "Winter break" },
          ],
        },
        { id: "b", from: "2027-04-01", to: "2027-04-05", names: [{ locale: "sv", name: "Påsklov" }] },
      ]),
    );

    expect(container.textContent).toContain("Winter break");
    expect(container.textContent).not.toContain("Talviloma");
    expect(container.textContent).toContain("Påsklov");
  });

  it("draws no row at all when nothing is listed", () => {
    const { container } = renderCard(
      breaks([{ id: "a", from: "2027-02-22", to: "2027-02-26", withdrew: false }]),
    );

    expect(container.textContent).not.toContain("Holiday breaks");
    expect(container.textContent).not.toContain("Break a");
  });

  it("draws none on a surface that passes no breaks", () => {
    const { container } = render(<ProductOverviewCard product={CLUB} />);

    expect(container.textContent).not.toContain("Holiday breaks");
  });
});
