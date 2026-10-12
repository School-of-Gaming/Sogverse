import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import { SessionHolidayLine } from "@/components/session-feed";
import { formatDateOnly, formatDateRange } from "@/lib/utils";

/**
 * The holiday line both feeds draw: the break's name in the reader's locale
 * (theirs, else English, else the first written) and its bare dates, one date
 * for a one-day break.
 */
const NAMES = [
  { locale: "en", name: "Autumn break" },
  { locale: "fi", name: "Syysloma" },
];

function renderLine(
  locale: "en" | "fi",
  props: Parameters<typeof SessionHolidayLine>[0],
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fi}>
      <SessionHolidayLine {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SessionHolidayLine", () => {
  it("names a multi-day break and its range", () => {
    renderLine("en", { names: NAMES, startDate: "2026-10-13", endDate: "2026-10-17" });
    const range = formatDateRange("2026-10-13", "2026-10-17", "en");
    expect(range).toContain("–");
    expect(screen.getByText(`No session · Autumn break, ${range}`)).toBeTruthy();
  });

  it("names one date for a one-day break", () => {
    renderLine("en", { names: NAMES, startDate: "2026-12-24", endDate: "2026-12-24" });
    const date = formatDateOnly("2026-12-24", "en");
    expect(screen.getByText(`No session · Autumn break, ${date}`)).toBeTruthy();
  });

  it("picks the reader's own locale where it is written", () => {
    renderLine("fi", { names: NAMES, startDate: "2026-10-13", endDate: "2026-10-17" });
    const range = formatDateRange("2026-10-13", "2026-10-17", "fi");
    expect(screen.getByText(`Ei kertaa · Syysloma, ${range}`)).toBeTruthy();
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
    expect(screen.getByText(/^Ei kertaa · Winter break, /)).toBeTruthy();
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
