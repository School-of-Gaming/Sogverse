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

  it("draws the whole history over a labelled scale, its readings also given as text", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    const chart = screen.getByRole("group", { name: "Positive answers by week" });
    for (const label of ["0%", "25%", "50%", "75%", "100%", "Jul 2026", "Aug", "Sep"]) {
      expect(within(chart).getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/^Since /)).toBeNull();
    expect(within(chart).getByText("Sep 28, 2026 – Sep 30, 2026 · No answers")).toBeTruthy();
    expect(within(chart).getByText("Sep 7, 2026 – Sep 13, 2026 · 89% positive · 9 answers")).toBeTruthy();
  });

  it("names the chart's focusable surface and describes it with the readings", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    const surface = screen.getByRole("application", { name: "Positive answers by week" });
    expect(surface.getAttribute("tabindex")).toBe("0");
    const readings = document.getElementById(surface.getAttribute("aria-describedby") ?? "");
    expect(readings?.tagName).toBe("UL");
    expect(readings?.textContent).toContain("Sep 7, 2026 – Sep 13, 2026 · 89% positive · 9 answers");
  });

  it("names the month the history starts in, though it starts mid-month", () => {
    wrap(
      <FeedbackOverviewPage
        read={{ ...read(dataset), history: { from: "2026-03-10", to: "2026-05-20" } }}
      />,
    );
    const chart = screen.getByRole("group", { name: "Positive answers by week" });
    for (const label of ["Mar 2026", "Apr", "May"]) {
      expect(within(chart).getByText(label)).toBeTruthy();
    }
  });

  it("names the platform's line in a legend on a group's page, and draws none for a gamer", () => {
    const { unmount } = wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "group", id: "group-a1" }} />,
    );
    const chart = screen.getByRole("group", { name: "Positive answers by week" });
    expect(within(chart).getByText("Platform")).toBeTruthy();
    expect(within(chart).getByText("Club A · A1")).toBeTruthy();
    unmount();

    wrap(<FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "gamer", id: HELMI.id }} />);
    const gamerChart = screen.getByRole("group", { name: "Positive answers by week" });
    expect(within(gamerChart).queryByText("Platform")).toBeNull();
  });

  it("draws the chart on the overview and detail pages only", () => {
    const chart = { name: "Positive answers by week" };
    const { unmount } = wrap(<FeedbackListPage read={read(dataset)} dimension="product" />);
    expect(screen.queryByRole("group", chart)).toBeNull();
    unmount();
    wrap(<FeedbackResponsesPage read={read(dataset)} />);
    expect(screen.queryByRole("group", chart)).toBeNull();
  });

  it("states a statement's negative share before its positive one, as the meter reads", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    const line = screen.getByText("I had fun.").closest("li");
    expect(line?.textContent).toMatch(/negative.*positive/);
  });

  it("judges a product of one answer like any other", () => {
    wrap(<FeedbackListPage read={read(dataset)} dimension="product" />);
    const rows = screen.getAllByRole("link").filter((link) => link.closest("li") !== null);
    expect(rows.map((row) => within(row).getByText(/^Club [AB]$/).textContent)).toEqual(["Club B", "Club A"]);
    const [weak] = rows;
    expect(weak.textContent).toMatch(/0%/);
    expect(within(weak).getByText(/Below average/)).toBeTruthy();
  });

  it("opens on three doors: products, Gedus and gamers", () => {
    wrap(<FeedbackOverviewPage read={read(dataset)} />);
    const explore = screen.getByRole("heading", { name: "Explore" }).closest("section");
    if (explore === null) throw new Error("No explore section");
    const doors = within(explore).getAllByRole("link");
    expect(doors.map((door) => door.querySelector("p")?.textContent)).toEqual(["Products", "Gedus", "Gamers"]);
    expect(doors.map((door) => door.getAttribute("href"))).toEqual([
      expect.stringMatching(/\/admin\/feedback\/products$/),
      expect.stringMatching(/\/admin\/feedback\/gedus$/),
      expect.stringMatching(/\/admin\/feedback\/responses$/),
    ]);
  });

  it("breaks a multi-group product down by group, each named with its product, saying so for one with none", () => {
    wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "product", id: "product-a" }} />,
    );
    const section = screen.getByRole("heading", { name: "Groups" }).closest("section");
    if (section === null) throw new Error("No groups section");
    const rows = within(section).getAllByRole("link");
    expect(rows.map((row) => within(row).getByText(/^Club A · A\d$/).textContent)).toEqual([
      "Club A · A1",
      "Club A · A2",
    ]);
    expect(rows[0].getAttribute("href")).toMatch(/\/admin\/feedback\/groups\/group-a1\?from=product%3Aproduct-a$/);
    expect(within(rows[1]).getByText("No answers")).toBeTruthy();
    expect(rows[1].textContent).not.toMatch(/%/);
    expect(screen.queryByRole("heading", { name: "Gamers who answered" })).toBeNull();
  });

  it("gives a single-group product no groups breakdown, listing its gamers instead", () => {
    wrap(
      <FeedbackDetailPage read={read(dataset)} origin={null} scope={{ kind: "product", id: "product-b" }} />,
    );
    expect(screen.queryByRole("heading", { name: "Groups" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Gedus" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gamers who answered" })).toBeTruthy();
  });

  it("links a response's group by the one rule: a single-group product as itself, else 'Product · Group'", () => {
    wrap(<FeedbackResponsesPage read={read(dataset)} />);
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    const clubB = screen.getAllByRole("link", { name: "Club B" });
    expect(clubB[0].getAttribute("href")).toMatch(/\/admin\/feedback\/products\/product-b\?from=responses$/);
    const clubA = screen.getAllByRole("link", { name: "Club A · A1" });
    expect(clubA[0].getAttribute("href")).toMatch(/\/admin\/feedback\/groups\/group-a1\?from=responses$/);
    expect(screen.queryByRole("link", { name: "B1" })).toBeNull();
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
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Club A · A1");
    expect(screen.getByRole("link", { name: "Back to the product" }).getAttribute("href")).toMatch(
      /\/admin\/feedback\/products\/product-a$/,
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
      feedbackResponse({ respondent: { id: "g-negative", name: "Lumi" }, answers: { fun: 2 }, sessionDate: "2026-09-19" }),
      feedbackResponse({
        respondent: { id: "g-both", name: "Bea" },
        answers: { ...allFive(4), groupListens: 1 },
        note: "Nobody listened.",
        sessionDate: "2026-09-02",
      }),
    ]);

    /** A response's row group: its row of answers and, when it has one, its note's row. */
    function responseOf(name: string): HTMLElement {
      const group = screen.getByRole("link", { name }).closest<HTMLElement>("[role='rowgroup']");
      if (group === null) throw new Error(`No response for ${name}`);
      return group;
    }

    it("opens on what is worth reading, negative with a note first, then negative, then a note", () => {
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

    it("draws each answer as the gamer's bar with its word, a negative one marked, and quotes the note", () => {
      wrap(
        <FeedbackResponsesPage read={read(said)} />,
      );
      const card = responseOf("Bea");
      const meters = within(card).getAllByRole("img");
      expect(meters.map((meter) => meter.getAttribute("aria-label"))).toEqual(["Yes", "Yes", "Yes", "Yes", "No"]);
      // A meter fills from the first segment through the level: four of five for "Yes".
      expect(meters[0].querySelectorAll(".bg-act")).toHaveLength(4);
      const negative = within(card).getByText("No", { selector: "span[aria-hidden]" });
      expect(negative.className).toMatch(/text-warning/);
      expect(negative.querySelector("svg")).not.toBeNull();
      expect(within(card).getByText("Nobody listened.")).toBeTruthy();

      const skipped = within(responseOf("Lumi")).getAllByRole("img", { name: "Skipped" });
      expect(skipped).toHaveLength(4);
      expect(skipped[0].querySelectorAll(".bg-act")).toHaveLength(0);
    });

    it("names the statements once, as headings carrying the sentence, over a row per response and its note", () => {
      wrap(<FeedbackResponsesPage read={read(said)} />);
      fireEvent.click(screen.getByRole("button", { name: "All (4)" }));
      const table = screen.getByRole("table", { name: "What gamers said" });

      const headers = within(table).getAllByRole("columnheader");
      expect(headers).toHaveLength(6);
      const statementHeaders = headers.slice(1).map((header) => {
        const label = header.querySelector<HTMLElement>("[tabindex='0']");
        if (label === null) throw new Error("A statement heading has nothing to focus");
        return label;
      });
      expect(statementHeaders.map((label) => label.textContent)).toEqual([
        "Learned",
        "Fun",
        "Gedu knew",
        "Gedu kind",
        "Listened",
      ]);
      const sentenceOf = (label: HTMLElement) =>
        document.getElementById(label.getAttribute("aria-describedby") ?? "")?.textContent;
      expect(sentenceOf(statementHeaders[0])).toBe("I learned something new.");
      expect(sentenceOf(statementHeaders[4])).toBe("My group listens to and understands me.");

      // The sentence opens from the heading cell it sits inside, until Escape hides it.
      const tooltip = within(headers[1]).getByRole("tooltip", { hidden: true });
      const opener = () => tooltip.parentElement?.className ?? "";
      expect(opener()).toMatch(/group-hover:visible/);
      fireEvent.focus(statementHeaders[0]);
      fireEvent.keyDown(statementHeaders[0], { key: "Escape" });
      expect(opener()).not.toMatch(/group-hover:visible|group-focus-within:visible/);
      fireEvent.blur(statementHeaders[0]);
      expect(opener()).toMatch(/group-focus-within:visible/);
      fireEvent.mouseEnter(headers[1]);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(opener()).not.toMatch(/group-hover:visible/);
      fireEvent.mouseLeave(headers[1]);
      expect(opener()).toMatch(/group-hover:visible/);

      // The heading row group, then one per response.
      expect(within(table).getAllByRole("rowgroup")).toHaveLength(5);

      const bea = within(responseOf("Bea")).getAllByRole("row");
      expect(bea).toHaveLength(2);
      const [answers, note] = bea;
      const cells = within(answers).getAllByRole("cell");
      expect(cells).toHaveLength(6);
      // Below lg each answer cell names its own statement, the heading row being hidden.
      expect(within(cells[5]).getByText("Listened").className).toMatch(/lg:hidden/);
      expect(within(cells[5]).getByText("No", { selector: "span[aria-hidden]" }).className).toMatch(/text-warning/);
      const noteCell = within(note).getByRole("cell");
      expect(noteCell.getAttribute("aria-colspan")).toBe("6");
      expect(noteCell.textContent).toBe("Nobody listened.");

      expect(within(responseOf("Quinn")).getAllByRole("row")).toHaveLength(1);
    });

    it("reveals twenty more as the reader scrolls to the end, and starts over on a switch", () => {
      installFakeIntersectionObserver();
      const crowd = feedbackDataset(feedbackResponses(45, { answers: allFive(1) }));
      wrap(
        <FeedbackResponsesPage read={read(crowd)} />,
      );
      // Five meters to a response.
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
