import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CancelledAheadLine } from "@/components/session-feed/CancelledAheadLine";

/**
 * The line a My SOG card carries for the cancelled sessions it passes over
 * before its next one. Keys echo, so an assertion names the copy the line
 * reached for and the values it handed that copy.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    };
    return t;
  },
  useLocale: () => "en-GB",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

afterEach(cleanup);

describe("CancelledAheadLine", () => {
  it("renders nothing when nothing ahead is cancelled", () => {
    const { container } = render(<CancelledAheadLine starts={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("names one cancelled session in the viewer's zone", () => {
    // 22:30 UTC Monday is already Tuesday in Helsinki.
    const { container } = render(
      <CancelledAheadLine starts={[new Date("2026-09-28T22:30:00Z")]} />,
    );
    expect(container.textContent).toBe(
      `activityCard.cancelledAhead(${JSON.stringify({
        count: 1,
        dates: "Tue 29 Sept",
      })})`,
    );
  });

  it("lists a few by name, as one sentence", () => {
    const { container } = render(
      <CancelledAheadLine
        starts={[
          new Date("2026-09-29T14:00:00Z"),
          new Date("2026-10-06T14:00:00Z"),
        ]}
      />,
    );
    expect(container.textContent).toBe(
      `activityCard.cancelledAhead(${JSON.stringify({
        count: 2,
        dates: "Tue 29 Sept and Tue 6 Oct",
      })})`,
    );
  });

  it("names the first and counts the rest when many are cancelled", () => {
    const starts = [0, 1, 2, 3, 4].map(
      (day) => new Date(Date.UTC(2026, 9, 5 + day, 7)),
    );
    const { container } = render(<CancelledAheadLine starts={starts} />);
    expect(container.textContent).toBe(
      `activityCard.cancelledAheadMore(${JSON.stringify({
        first: "Mon 5 Oct",
        more: 4,
      })})`,
    );
  });
});
