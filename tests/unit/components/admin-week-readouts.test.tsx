import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import {
  formatAdminTermWeeks,
  formatProductWeeks,
} from "@/lib/products/format-product-term-dates";
import { firstSessionDate, lastSessionDate } from "@/lib/session-dates";
import { formatDateOnly } from "@/lib/utils";
import { SchedulePanel } from "@/components/admin/dashboard/schedule-panel";
import { ComingUpFeed } from "@/components/admin/dashboard/coming-up-feed";
import type {
  ComingUpDay,
  ScheduleWeek,
} from "@/components/admin/dashboard/admin-dashboard-data";

/**
 * **The ISO week readouts on the admin surfaces**, which are one rule applied
 * four times: a week number is *furniture beside a planning date* — muted,
 * tabular, after the date, joined with a middle dot — and never a replacement
 * for the date, never on a family surface, and never beside a record timestamp.
 *
 * The autumn 2026 term is the fixture throughout because it is the shape a
 * Finnish admin actually plans: a Wednesday club whose stored `start_date` is
 * the term's Monday, running to a Friday. That single product exercises every
 * decision at once — a week *range* rather than a single week, a seventeen-week
 * count that day-division would round to sixteen, and a start/end pair two days
 * off the days a family is expected on.
 */

/** Monday 17 August 2026 — the autumn term's first day, ISO week 34. */
const TERM_START = "2026-08-17";
/** Friday 11 December 2026 — the term's last day, ISO week 50. */
const TERM_END = "2026-12-11";
/** 0 = Monday … 6 = Sunday, so a Wednesday club. */
const WEDNESDAY = [2];

/** The `common` translator a component holds, built outside React. */
function common(locale: "en" | "fi") {
  return createTranslator({
    locale,
    messages: locale === "en" ? en : fi,
    namespace: "common",
  });
}

afterEach(cleanup);

describe("the term-dates week readout", () => {
  it("names the week range and the inclusive week count", () => {
    expect(
      formatAdminTermWeeks(
        { start_date: TERM_START, end_date: TERM_END },
        common("en"),
      ),
    ).toBe("wk 34–50 · 17 weeks");
  });

  it("says the same thing in the locale the admins plan in", () => {
    expect(
      formatAdminTermWeeks(
        { start_date: TERM_START, end_date: TERM_END },
        common("fi"),
      ),
    ).toBe("vk 34–50 · 17 viikkoa");
  });

  // Half a readout is worse than none: an open-ended club has no last week to
  // count to, so the fact carries the range alone.
  it("says nothing at all when the term has no end", () => {
    expect(
      formatAdminTermWeeks(
        { start_date: TERM_START, end_date: null },
        common("en"),
      ),
    ).toBeNull();
  });

  it("collapses a span inside one week to a single week number", () => {
    expect(formatProductWeeks("2026-08-17", "2026-08-21", common("en"))).toBe(
      "wk 34",
    );
  });

  /**
   * The ISO year is half of a week's identity, and this is the case that proves
   * it is being compared: 30 December 2025 is week 1 of ISO 2026, 5 January 2027
   * is week 1 of ISO 2027, and a comparison on the bare number would collapse a
   * whole year into the single label "wk 1".
   */
  it("keeps both ends when the same week number belongs to two ISO years", () => {
    expect(formatProductWeeks("2025-12-30", "2027-01-05", common("en"))).toBe(
      "wk 1–1",
    );
  });
});

describe("the first and last session facts", () => {
  /**
   * The defect these two facts exist to make visible: nothing ties
   * `start_date` to the weekly pattern, so a Wednesday club can store the
   * term's Monday, and every surface reading the column tells a family the club
   * starts two days before it does.
   */
  it("snaps the stored term bounds onto days the club actually meets", () => {
    const first = firstSessionDate(TERM_START, WEDNESDAY);
    const last = lastSessionDate(TERM_END, WEDNESDAY);

    expect(first).toBe("2026-08-19");
    expect(last).toBe("2026-12-09");
    expect(
      formatDateOnly(first, "en", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ).toBe("Wednesday, August 19, 2026");
    expect(
      formatDateOnly(last, "en", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ).toBe("Wednesday, December 9, 2026");
  });
});

function week(weekStart: string): ScheduleWeek {
  return { weekStart, chips: [] };
}

function renderSchedulePanel(locale: "en" | "fi"): HTMLElement {
  const { container } = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fi}
    >
      <SchedulePanel
        weeks={[week("2026-08-10"), week(TERM_START), week("2026-08-24")]}
        currentWeekIndex={1}
        comingUp={[]}
        now={new Date("2026-08-17T09:20:00+03:00")}
        timeZone="Europe/Helsinki"
        timeZoneAbbrev={null}
      />
    </NextIntlClientProvider>,
  );
  return container;
}

describe("the dashboard's week header", () => {
  /**
   * The one surface where the week number leads rather than follows: the
   * stepper either side of this label moves a week at a time and the rows below
   * are that week's seven days, so the week is the label's subject.
   */
  it("leads with the week number, then the dates it covers", () => {
    expect(renderSchedulePanel("en").textContent).toContain(
      "wk 34 · 8/17 – 8/23/2026",
    );
  });

  it("leads with the week number in Finnish too", () => {
    expect(renderSchedulePanel("fi").textContent).toContain("vk 34 · 17.8.");
  });
});

describe("the coming-up feed", () => {
  const days: readonly ComingUpDay[] = [
    {
      date: TERM_START,
      cohorts: [
        {
          id: "starts-consumer_club",
          kind: "starts",
          productType: "consumer_club",
          items: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Minecraft Mondays",
              href: "/admin/clubs/11111111-1111-4111-8111-111111111111",
              activeCount: 9,
              seatCount: 12,
            },
          ],
        },
      ],
    },
  ];

  it("appends the week number after the date, never instead of it", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ComingUpFeed days={days} />
      </NextIntlClientProvider>,
    );
    // Date *and* week in one column, in that order — the week number is
    // appended to the date, not substituted for it and not floated into the
    // cohort list beside it.
    const column = container.querySelector("p.tabular-nums");
    expect(column?.textContent).toBe("Mon 8/17 · wk 34");
  });
});
