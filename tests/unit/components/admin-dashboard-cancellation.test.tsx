import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import { SchedulePanel } from "@/components/admin/dashboard/schedule-panel";
import type {
  ComingUpDay,
  DateCancellation,
  ScheduleChip,
} from "@/components/admin/dashboard/admin-dashboard-data";

/**
 * How the admin dashboard draws a date its groups cancelled: every group — the
 * chip and the coming-up line stay, labelled, and the session is out of the
 * week's count; some groups — a note, and the session still counts. A club's
 * start or end line names the session that is off rather than reading as the
 * club being cancelled.
 */

const WEEK_START = "2026-08-17";

function chip(
  id: string,
  weekday: number,
  cancellation: DateCancellation,
): ScheduleChip {
  return {
    id,
    productId: id,
    productName: `Club ${id}`,
    productType: "consumer_club",
    weekday,
    startTime: "17:00",
    durationMinutes: 90,
    activeCount: 9,
    seatCount: 12,
    needsAttention: false,
    cancellation,
    href: { pathname: "/admin/consumer-clubs/[id]", params: { id } },
  };
}

function renderPanel(
  chips: readonly ScheduleChip[],
  comingUp: readonly ComingUpDay[] = [],
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SchedulePanel
        weeks={[{ weekStart: WEEK_START, chips }]}
        currentWeekIndex={0}
        comingUp={comingUp}
        now={new Date("2026-08-17T09:20:00+03:00")}
        timeZone="Europe/Helsinki"
        timeZoneAbbrev={null}
      />
    </NextIntlClientProvider>,
  );
}

function chipLink(container: HTMLElement, name: string): HTMLElement {
  const link = [...container.querySelectorAll("a")].find((anchor) =>
    anchor.textContent.includes(name),
  );
  if (link === undefined) throw new Error(`No link for ${name}`);
  return link;
}

afterEach(cleanup);

describe("a cancelled date on the week rows", () => {
  it("keeps a fully cancelled session on its row, muted and labelled", () => {
    const { container } = renderPanel([chip("off", 2, { kind: "all" })]);

    const link = chipLink(container, "Club off");
    expect(within(link).getByText("Cancelled")).toBeTruthy();
    expect(link.className).toContain("text-muted-foreground");
  });

  it("notes a partly cancelled session and leaves it looking like one that runs", () => {
    const { container } = renderPanel([
      chip("half", 1, { kind: "some", cancelled: 1, groups: 2 }),
    ]);

    const link = chipLink(container, "Club half");
    expect(link.textContent).toContain("1 of 2 groups cancelled");
    expect(link.textContent).not.toContain("Cancelled");
    expect(link.className).not.toContain("text-muted-foreground");
  });

  it("says nothing about a session no group cancelled", () => {
    const { container } = renderPanel([chip("on", 0, { kind: "none" })]);

    expect(chipLink(container, "Club on").textContent).not.toMatch(/cancelled/i);
  });

  it("counts partly cancelled sessions and leaves fully cancelled ones out", () => {
    const { container } = renderPanel([
      chip("on", 0, { kind: "none" }),
      chip("half", 1, { kind: "some", cancelled: 1, groups: 2 }),
      chip("off", 2, { kind: "all" }),
    ]);

    expect(container.textContent).toContain("2 sessions");
    expect(container.textContent).not.toContain("3 sessions");
  });
});

describe("a cancelled date on the coming-up feed", () => {
  function day(
    date: string,
    id: string,
    cancellation: DateCancellation,
    kind: ComingUpDay["cohorts"][number]["kind"] = "runs",
  ): ComingUpDay {
    return {
      date,
      cohorts: [
        {
          id: `${date}-${kind}-event`,
          kind,
          productType: "event",
          items: [
            {
              id,
              name: `Event ${id}`,
              href: { pathname: "/admin/events/[id]", params: { id } },
              activeCount: 20,
              seatCount: 40,
              cancellation,
            },
          ],
        },
      ],
    };
  }

  it("keeps a cancelled single-date run in its dated place, muted and labelled", () => {
    const { container } = renderPanel(
      [],
      [day("2026-08-19", "lan", { kind: "all" })],
    );

    const link = chipLink(container, "Event lan");
    expect(within(link).getByText("cancelled")).toBeTruthy();
    expect(link.className).toContain("text-muted-foreground");
  });

  it("names the first or last session on a start or end line, which reads as normal", () => {
    const { container } = renderPanel(
      [],
      [
        day("2026-08-19", "open", { kind: "all" }, "starts"),
        day("2026-08-21", "close", { kind: "all" }, "ends"),
      ],
    );

    const starts = chipLink(container, "Event open");
    expect(within(starts).getByText("first session cancelled")).toBeTruthy();
    expect(starts.className).not.toContain("text-muted-foreground");

    const ends = chipLink(container, "Event close");
    expect(within(ends).getByText("last session cancelled")).toBeTruthy();
    expect(ends.className).not.toContain("text-muted-foreground");
  });

  it("notes a partly cancelled date on an ordinary line", () => {
    const { container } = renderPanel(
      [],
      [day("2026-08-20", "cup", { kind: "some", cancelled: 2, groups: 3 })],
    );

    const link = chipLink(container, "Event cup");
    expect(link.textContent).toContain("2 of 3 groups cancelled");
    expect(link.className).not.toContain("text-muted-foreground");
  });
});
