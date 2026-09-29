import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CalendarX } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import { CancelledAheadNotice } from "@/components/session-feed/CancelledAheadNotice";

/**
 * The warning panel a My SOG card carries for the cancelled sessions it passes
 * over before its next one. Rendered against the real catalogues, so the plural
 * branches and the bold tag inside them are exercised as a reader meets them.
 */

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

afterEach(cleanup);

function renderNotice(
  starts: readonly Date[],
  locale: "en" | "fi" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? messages : fi}
      timeZone="Europe/Helsinki"
    >
      <CancelledAheadNotice starts={starts} />
    </NextIntlClientProvider>,
  );
}

function boldRuns(container: HTMLElement) {
  return [...container.querySelectorAll("strong")].map((el) => el.textContent);
}

describe("CancelledAheadNotice", () => {
  it("renders nothing when nothing ahead is cancelled", () => {
    const { container } = renderNotice([]);
    expect(container.innerHTML).toBe("");
  });

  it("names one cancelled session in the viewer's zone, the date in bold", () => {
    // 22:30 UTC Monday is already Tuesday in Helsinki.
    const { container, getByRole } = renderNotice([
      new Date("2026-09-28T22:30:00Z"),
    ]);
    expect(getByRole("status").textContent).toBe("Tue, Sep 29 is cancelled.");
    expect(boldRuns(container)).toEqual(["Tue, Sep 29"]);
  });

  it("wears the cancellation's calendar-cross in the warning hue, not the triangle", () => {
    const { getByRole } = renderNotice([new Date("2026-09-29T14:00:00Z")]);
    const reference = render(<CalendarX />).container.querySelector("svg");

    const glyphs = getByRole("status").querySelectorAll(":scope > svg");
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].innerHTML).toBe(reference?.innerHTML);
    expect(glyphs[0].getAttribute("class")).toContain("text-warning");
    expect(glyphs[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("lists a few by name, as one sentence", () => {
    const { container, getByRole } = renderNotice([
      new Date("2026-09-29T14:00:00Z"),
      new Date("2026-10-06T14:00:00Z"),
    ]);
    expect(getByRole("status").textContent).toBe(
      "Tue, Sep 29 and Tue, Oct 6 are cancelled.",
    );
    expect(boldRuns(container)).toEqual(["Tue, Sep 29 and Tue, Oct 6"]);
  });

  it("names the first and counts the rest when many are cancelled", () => {
    const starts = [0, 1, 2, 3, 4].map(
      (day) => new Date(Date.UTC(2026, 9, 5 + day, 7)),
    );
    const { container, getByRole } = renderNotice(starts);
    expect(getByRole("status").textContent).toBe(
      "Mon, Oct 5 and 4 more sessions are cancelled.",
    );
    expect(boldRuns(container)).toEqual(["Mon, Oct 5"]);
  });

  it("carries the bold tag through a translated plural branch", () => {
    const { container } = renderNotice(
      [new Date("2026-09-29T14:00:00Z")],
      "fi",
    );
    expect(boldRuns(container)).toHaveLength(1);
    expect(container.textContent).toMatch(/^Peruttu: .+\.$/);
  });
});
