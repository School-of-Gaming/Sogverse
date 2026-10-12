import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import { SessionHolidayLine } from "@/components/session-feed";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";

/**
 * The holiday line both feeds draw: the break's name in the reader's locale
 * (theirs, else English, else the first written) and its bare dates in the
 * compact form every holiday list uses — one date for a one-day break, and the
 * year only where the break crosses one or falls outside the current year.
 */
const NAMES = [
  { locale: "en", name: "Autumn break" },
  { locale: "fi", name: "Syysloma" },
];

/** 12 October 2026, so a break this year is drawn without its year. */
const NOW = new Date("2026-10-12T09:00:00Z");

function renderLine(
  locale: "en" | "fi",
  props: Parameters<typeof SessionHolidayLine>[0],
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fi}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionHolidayLine {...props} />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

describe("SessionHolidayLine", () => {
  it("names a multi-day break and its compact range", () => {
    renderLine("en", { names: NAMES, startDate: "2026-10-13", endDate: "2026-10-17" });
    expect(screen.getByText("No session · Autumn break, Oct 13 – 17")).toBeTruthy();
  });

  it("names one date for a one-day break", () => {
    renderLine("en", { names: NAMES, startDate: "2026-12-24", endDate: "2026-12-24" });
    expect(screen.getByText("No session · Autumn break, Dec 24")).toBeTruthy();
  });

  it("carries the year on a break outside the current one", () => {
    renderLine("en", { names: NAMES, startDate: "2027-02-22", endDate: "2027-02-26" });
    expect(screen.getByText("No session · Autumn break, Feb 22 – 26, 2027")).toBeTruthy();
  });

  it("picks the reader's own locale where it is written, in that locale's range form", () => {
    renderLine("fi", { names: NAMES, startDate: "2026-10-13", endDate: "2026-10-17" });
    expect(screen.getByText("Ei kerhokertaa · Syysloma, 13.–17.10.")).toBeTruthy();
  });

  it("falls back to English where the reader's locale is not written", () => {
    renderLine("fi", {
      names: [
        { locale: "en", name: "Winter break" },
        { locale: "sv", name: "Sportlov" },
      ],
      startDate: "2027-02-22",
      endDate: "2027-02-26",
    });
    expect(screen.getByText(/^Ei kerhokertaa · Winter break, /)).toBeTruthy();
  });

  it("falls back to the first name written when neither is there", () => {
    renderLine("en", {
      names: [{ locale: "sv", name: "Sportlov" }],
      startDate: "2027-02-22",
      endDate: "2027-02-26",
    });
    expect(screen.getByText(/^No session · Sportlov, /)).toBeTruthy();
  });
});
