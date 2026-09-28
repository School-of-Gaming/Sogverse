import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SessionCancelledLine } from "@/components/session-feed/SessionCancelledLine";

/**
 * The cancelled line both feeds draw: a date still ahead wears the warning
 * tone, a date already behind stays muted.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

afterEach(cleanup);

const labels = {
  date: "Tue 29 Sept",
  timeRange: "16:30–18:00",
  timeZoneAbbrev: null,
};

function renderLine(upcoming: boolean) {
  const { container, getByText } = render(
    <SessionCancelledLine labels={labels} upcoming={upcoming} />,
  );
  const line = container.firstElementChild;
  if (!(line instanceof HTMLElement)) throw new Error("no line rendered");
  return {
    line,
    date: getByText(labels.date),
    tag: getByText("sessionBadge.cancelled"),
    time: getByText(labels.timeRange),
  };
}

describe("SessionCancelledLine", () => {
  it("draws an upcoming cancellation in the warning tone", () => {
    const { line, date, tag, time } = renderLine(true);
    expect(line.dataset.tone).toBe("warning");
    expect(line.className).toContain("border-warning");
    expect(tag.className).toContain("text-warning");
    expect(tag.className).toContain("border-warning");
    expect(tag.querySelector("svg")).not.toBeNull();
    expect(date.className).toContain("font-semibold");
    expect(time.className).toContain("line-through");
  });

  it("keeps a past cancellation muted", () => {
    const { line, date, tag, time } = renderLine(false);
    expect(line.dataset.tone).toBe("muted");
    expect(line.className).not.toContain("warning");
    expect(tag.className).not.toContain("warning");
    expect(tag.className).toContain("text-muted-foreground");
    expect(date.className).not.toContain("font-semibold");
    expect(time.className).toContain("line-through");
  });
});
