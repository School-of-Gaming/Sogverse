import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

/**
 * **The holiday calendar picker on a club's product form.**
 *
 * One row per calendar, ticked for the ones the club follows, each naming the
 * calendar's next break measured from the club's today. Ticking and unticking
 * write the selection back as ids, which the build tests then carry to the
 * wire.
 *
 * Translations echo their key and values, so nothing here depends on wording
 * in `messages/`.
 */
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
}));

const mockUseHolidayCalendars = vi.fn();
vi.mock("@/services/holiday-calendars/holiday-calendars.queries", () => ({
  useHolidayCalendars: () => mockUseHolidayCalendars(),
}));

import { HolidayCalendarPicker } from "@/components/admin/holiday-calendars/holiday-calendar-picker";
import { formatDateRange } from "@/lib/utils";
import type {
  HolidayCalendarSummary,
} from "@/services/holiday-calendars/holiday-calendars.service";

const HELSINKI = "0b6c7d2e-4f1a-4c3b-9e8d-2a1b3c4d5e6f";
const ESPOO = "8e2f1a3b-5c4d-4e6f-a7b8-c9d0e1f2a3b4";
const TODAY = "2026-10-12";

const CALENDARS: HolidayCalendarSummary[] = [
  {
    id: ESPOO,
    name: "Espoo schools",
    // Every break is over by today, so the row says none is coming.
    breaks: [
      {
        id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
        startDate: "2026-02-16",
        endDate: "2026-02-22",
        names: [{ locale: "en", name: "Winter break" }],
      },
    ],
    productCount: 0,
  },
  {
    id: HELSINKI,
    name: "Helsinki schools",
    breaks: [
      {
        id: "d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a",
        startDate: "2026-06-01",
        endDate: "2026-08-09",
        names: [{ locale: "en", name: "Summer break" }],
      },
      {
        id: "e3f4a5b6-c7d8-4e9f-0a1b-2c3d4e5f6a7b",
        startDate: "2026-10-12",
        endDate: "2026-10-18",
        names: [
          { locale: "fi", name: "Syysloma" },
          { locale: "en", name: "Autumn break" },
        ],
      },
    ],
    productCount: 3,
  },
];

function renderPicker(initial: string[]) {
  let latest = initial;
  function Harness() {
    const [value, setValue] = useState<string[]>(initial);
    latest = value;
    return (
      <HolidayCalendarPicker value={value} onChange={setValue} today={TODAY} />
    );
  }
  render(<Harness />);
  return { current: () => latest };
}

describe("HolidayCalendarPicker", () => {
  it("names each calendar's next break, a break under way included", () => {
    mockUseHolidayCalendars.mockReturnValue({ data: CALENDARS, isError: false });
    renderPicker([]);

    // The autumn break starts today, so it is the next one, in the reader's
    // language; the summer break is over.
    expect(
      screen.getByText(
        `nextBreak name=Autumn break dates=${formatDateRange("2026-10-12", "2026-10-18", "en")}`,
      ),
    ).toBeTruthy();
    expect(screen.getByText("noUpcomingBreak")).toBeTruthy();
  });

  it("ticks the calendars the club follows and writes picks back as ids", () => {
    mockUseHolidayCalendars.mockReturnValue({ data: CALENDARS, isError: false });
    const { current } = renderPicker([HELSINKI]);

    const helsinki = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Helsinki schools",
    });
    const espoo = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Espoo schools",
    });
    expect(helsinki.checked).toBe(true);
    expect(espoo.checked).toBe(false);

    fireEvent.click(espoo);
    expect(current()).toEqual([HELSINKI, ESPOO]);

    fireEvent.click(helsinki);
    expect(current()).toEqual([ESPOO]);
  });

  it("draws no rows until the list answers", () => {
    mockUseHolidayCalendars.mockReturnValue({ data: undefined, isError: false });
    renderPicker([HELSINKI]);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("empty")).toBeNull();
  });

  it("says so when there are no calendars", () => {
    mockUseHolidayCalendars.mockReturnValue({ data: [], isError: false });
    renderPicker([]);
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("reports a failed first read and keeps the selection", () => {
    mockUseHolidayCalendars.mockReturnValue({ data: undefined, isError: true });
    const { current } = renderPicker([HELSINKI]);
    expect(screen.getByText("listUnavailable")).toBeTruthy();
    expect(current()).toEqual([HELSINKI]);
  });
});
