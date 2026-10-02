import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/../messages/en.json";
import type { FeedbackRead } from "@/components/admin/feedback/aggregate-feedback";
import type { AdminFeedbackDataset } from "@/services/session-feedback/admin-feedback.contracts";
import { FeedbackDetailPage } from "@/components/admin/feedback/feedback-detail-page";
import { FeedbackListPage } from "@/components/admin/feedback/feedback-list-page";
import { FeedbackOverviewPage } from "@/components/admin/feedback/feedback-overview-page";
import { FeedbackResponsesPage } from "@/components/admin/feedback/feedback-responses-page";
import {
  installFakeIntersectionObserver,
  latestIntersectionObserver,
} from "../../mocks/intersection-observer";
import {
  allFive,
  FEEDBACK_CLUB_A2,
  FEEDBACK_CLUB_B,
  FEEDBACK_HISTORY,
  feedbackDataset,
  feedbackResponse,
  feedbackResponses,
  feedbackSession,
} from "../../mocks/admin-feedback";

/**
 * The feedback pages' promises that a refactor could break without any type
 * noticing: the overview opens on no list, a row of one answer is judged like
 * any other while a row with none says so, and a child is never set against
 * the platform, and every page reads the whole history with nothing to compare
 * it with but the platform.
 */

const HELMI = { id: "gamer-helmi", name: "Helmi" };
const ONNI = { id: "gamer-onni", name: "Onni" };

const dataset = feedbackDataset(
  [
    ...feedbackResponses(6, { answers: allFive(5) }),
    feedbackResponse({ respondent: ONNI, answers: allFive(4) }),
    feedbackResponse({ respondent: HELMI, answers: allFive(5), note: "So fun!" }),
    feedbackResponse({ ...FEEDBACK_CLUB_B, answers: allFive(1), note: "Nobody listened to me." }),
  ],
  [feedbackSession({ ...FEEDBACK_CLUB_A2, eligibleCount: 5 })],
);

/** A page's read: three months of history. */
function read(data: AdminFeedbackDataset): FeedbackRead {
  return { source: "gamer_online", dataset: data, history: FEEDBACK_HISTORY };
}

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Helsinki">
      {children}
    </NextIntlClientProvider>,
  );
}

/**
 * A `ResizeObserver` that reports a 640px box as soon as it observes one: the
 * timeline draws nothing until it is measured, and jsdom measures nothing.
 */
class MeasuredResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const [width, height] = [640, 208];
    const contentRect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
    const entry: ResizeObserverEntry = {
      target,
      contentRect: { ...contentRect, toJSON: () => contentRect },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    this.callback([entry], this);
  }
  unobserve() {}
  disconnect() {}
}

describe("admin feedback pages", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", MeasuredResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the overview on no list of products, groups or Gedus, and no change since before", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    expect(screen.getByText("positive")).toBeTruthy();
    expect(screen.getByText("89%")).toBeTruthy();
    expect(screen.queryByText("B1")).toBeNull();
    expect(screen.queryByText("Aino")).toBeNull();
    expect(screen.queryByText(/previous|point/i)).toBeNull();
  });

  it("draws the whole history over a labelled scale, read a point at a time from the keyboard", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    const chart = screen.getByRole("group", { name: "Positive answers by week" });
    for (const label of ["0%", "25%", "50%", "75%", "100%", "Jul 2026", "Aug", "Sep"]) {
      expect(within(chart).getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Since Jul 1, 2026")).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(1);

    const points = screen.getByRole("slider", { name: "Week being read" });
    expect(points.getAttribute("aria-valuetext")).toBe("Sep 28, 2026 – Sep 30, 2026 · No answers");
    fireEvent.keyDown(points, { key: "ArrowLeft" });
    fireEvent.keyDown(points, { key: "ArrowLeft" });
    fireEvent.keyDown(points, { key: "ArrowLeft" });
    expect(points.getAttribute("aria-valuetext")).toBe("Sep 7, 2026 – Sep 13, 2026 · 89% positive · 9 answers");
  });

  it("judges a group of one answer and says so for a group with none", () => {
    wrap(<FeedbackListPage read={read(dataset)} dimension="group" />);
    const rows = screen.getAllByRole("link").filter((link) => link.closest("li") !== null);
    expect(rows.map((row) => within(row).getByText(/^(A1|A2|B1)$/).textContent)).toEqual([
      "B1",
      "A1",
      "A2",
    ]);
    const [weak, , silent] = rows;
    expect(weak.textContent).toMatch(/0%/);
    expect(within(weak).getByText(/Below average/)).toBeTruthy();
    expect(within(silent).getByText("No answers")).toBeTruthy();
    expect(silent.textContent).not.toMatch(/%/);
  });

  it("never sets a gamer against the platform", () => {
    wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "gamer", id: HELMI.id }} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Helmi");
    expect(screen.queryByText(/Platform/)).toBeNull();
    expect(screen.queryByText(/Below average/)).toBeNull();
  });

  it("a group's gamer links carry the group as their origin", () => {
    wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "group", id: "group-a1" }} />,
    );
    expect(screen.getByRole("link", { name: "Back to groups" }).getAttribute("href")).toMatch(
      /\/admin\/feedback\/groups$/,
    );
    const helmi = screen.getAllByRole("link").find((link) => link.firstChild?.textContent === "Helmi");
    expect(helmi?.getAttribute("href")).toMatch(/\/admin\/feedback\/gamers\/gamer-helmi\?from=group%3Agroup-a1$/);
  });

  it("lists a group's gamers by name with their answer count", () => {
    wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "group", id: "group-a1" }} />,
    );
    const heading = screen.getByRole("heading", { name: "Gamers who answered" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    if (section === null) return;
    const names = within(section)
      .getAllByRole("link")
      .map((link) => link.firstChild?.textContent);
    expect(names).toContain("Helmi");
    expect(names).toEqual([...names].sort((a, b) => (a ?? "").localeCompare(b ?? "")));
    expect(section.textContent).not.toMatch(/%/);
  });

  describe("what gamers said", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const said = feedbackDataset([
      feedbackResponse({ respondent: { id: "g-note", name: "Noa" }, answers: allFive(5), note: "Loved it.", sessionDate: "2026-09-20" }),
      feedbackResponse({ respondent: { id: "g-quiet", name: "Quinn" }, answers: allFive(4), sessionDate: "2026-09-21" }),
      feedbackResponse({ respondent: { id: "g-low", name: "Lumi" }, answers: { fun: 2 }, sessionDate: "2026-09-19" }),
      feedbackResponse({
        respondent: { id: "g-both", name: "Bea" },
        answers: { ...allFive(4), groupListens: 1 },
        note: "Nobody listened.",
        sessionDate: "2026-09-02",
      }),
    ]);

    function cardOf(name: string): HTMLElement {
      const item = screen.getByRole("link", { name }).closest("li");
      if (item === null) throw new Error(`No card for ${name}`);
      return item;
    }

    it("opens on what is worth reading, low with a note first, then low, then a note", () => {
      wrap(
        <FeedbackResponsesPage read={read(said)} />,
      );
      expect(screen.getByRole("button", { name: "Worth reading (3)" }).getAttribute("aria-pressed")).toBe("true");
      const names = screen
        .getAllByRole("link")
        .map((link) => link.textContent)
        .filter((name) => ["Noa", "Quinn", "Lumi", "Bea"].includes(name));
      expect(names).toEqual(["Bea", "Lumi", "Noa"]);

      fireEvent.click(screen.getByRole("button", { name: "All (4)" }));
      expect(screen.getByRole("link", { name: "Quinn" })).toBeTruthy();
    });

    it("draws each answer as the gamer's bar with its word, a low one marked, and quotes the note", () => {
      wrap(
        <FeedbackResponsesPage read={read(said)} />,
      );
      const card = cardOf("Bea");
      const meters = within(card).getAllByRole("img");
      expect(meters.map((meter) => meter.getAttribute("aria-label"))).toEqual(["Yes", "Yes", "Yes", "Yes", "No"]);
      // A meter fills from the first segment through the level: four of five for "Yes".
      expect(meters[0].querySelectorAll(".bg-act")).toHaveLength(4);
      const low = within(card).getByText("No", { selector: "span[aria-hidden]" });
      expect(low.className).toMatch(/text-warning/);
      expect(low.querySelector("svg")).not.toBeNull();
      expect(within(card).getByText("Nobody listened.")).toBeTruthy();

      const skipped = within(cardOf("Lumi")).getAllByRole("img", { name: "Skipped" });
      expect(skipped).toHaveLength(4);
      expect(skipped[0].querySelectorAll(".bg-act")).toHaveLength(0);
    });

    it("reveals twenty more as the reader scrolls to the end, and starts over on a switch", () => {
      installFakeIntersectionObserver();
      const crowd = feedbackDataset(feedbackResponses(45, { answers: allFive(1) }));
      wrap(
        <FeedbackResponsesPage read={read(crowd)} />,
      );
      // Five meters to a card.
      const count = () => document.querySelectorAll("[role='img']").length / 5;
      expect(count()).toBe(20);
      act(() => latestIntersectionObserver()?.deliver());
      expect(count()).toBe(40);
      act(() => latestIntersectionObserver()?.deliver());
      expect(count()).toBe(45);

      fireEvent.click(screen.getByRole("button", { name: "All (45)" }));
      expect(count()).toBe(20);
    });
  });
});
