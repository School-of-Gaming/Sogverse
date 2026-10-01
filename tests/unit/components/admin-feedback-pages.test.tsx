import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/../messages/en.json";
import {
  buildFeedbackDetail,
  buildFeedbackDimensionList,
  buildFeedbackOverview,
} from "@/components/admin/feedback/aggregate-feedback";
import { FeedbackDetailPage } from "@/components/admin/feedback/feedback-detail-page";
import { FeedbackListPage } from "@/components/admin/feedback/feedback-list-page";
import { FeedbackOverviewPage } from "@/components/admin/feedback/feedback-overview-page";
import {
  allFive,
  FEEDBACK_CLUB_A2,
  FEEDBACK_CLUB_B,
  FEEDBACK_PERIODS,
  feedbackDataset,
  feedbackResponse,
  feedbackResponses,
  feedbackSession,
} from "../../mocks/admin-feedback";

/**
 * The feedback pages' promises that a refactor could break without any type
 * noticing: the overview opens on no list, a row of one answer is judged like
 * any other while a row with none says so, and a child is never set against
 * the platform.
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

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Helsinki">
      {children}
    </NextIntlClientProvider>,
  );
}

describe("admin feedback pages", () => {
  it("opens the overview on no list of products, groups or Gedus", () => {
    wrap(
      <FeedbackOverviewPage
        range="30d"
        overview={buildFeedbackOverview(dataset, "gamer_online", FEEDBACK_PERIODS)}
      />,
    );
    expect(screen.getByText("positive")).toBeTruthy();
    expect(screen.queryByText("B1")).toBeNull();
    expect(screen.queryByText("Aino")).toBeNull();
  });

  it("judges a group of one answer and says so for a group with none", () => {
    wrap(
      <FeedbackListPage
        range="30d"
        list={buildFeedbackDimensionList(dataset, "gamer_online", FEEDBACK_PERIODS, "group")}
      />,
    );
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
      <FeedbackDetailPage
        range="30d"
        origin={null}
        detail={buildFeedbackDetail(dataset, "gamer_online", FEEDBACK_PERIODS, {
          kind: "gamer",
          id: HELMI.id,
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Helmi");
    expect(screen.queryByText(/Platform/)).toBeNull();
    expect(screen.queryByText(/Below average/)).toBeNull();
  });

  it("lists a group's gamers by name with their answer count", () => {
    wrap(
      <FeedbackDetailPage
        range="30d"
        origin={null}
        detail={buildFeedbackDetail(dataset, "gamer_online", FEEDBACK_PERIODS, {
          kind: "group",
          id: "group-a1",
        })}
      />,
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
});
