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
import { feedbackRangePeriods, feedbackReadSpan } from "@/components/admin/feedback/feedback-range";
import {
  FEEDBACK_FIXTURE_FEATURED,
  FEEDBACK_FIXTURE_TODAY,
  feedbackFixture,
} from "@/components/admin/feedback/mock-feedback-fixtures";

/**
 * The feedback pages' promises that a refactor could break without any type
 * noticing: the overview opens on no list, a row too thin to judge states no
 * percentage, and a child is never set against the platform.
 */

const periods = feedbackRangePeriods("90d", FEEDBACK_FIXTURE_TODAY);
const dataset = feedbackFixture(feedbackReadSpan(periods), false);

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
        range="90d"
        overview={buildFeedbackOverview(dataset, "gamer_online", periods)}
      />,
    );
    expect(screen.getByText("positive")).toBeTruthy();
    expect(screen.queryByText("Thursday builders")).toBeNull();
    expect(screen.queryByText("Mikael Korhonen")).toBeNull();
  });

  it("states no percentage for a group with too few answers", () => {
    wrap(
      <FeedbackListPage
        range="90d"
        list={buildFeedbackDimensionList(dataset, "gamer_online", periods, "group")}
      />,
    );
    const row = screen.getByText("Saturday starters").closest("a");
    expect(row).not.toBeNull();
    if (row === null) return;
    expect(within(row).getByText(/Too few answers/)).toBeTruthy();
    expect(row.textContent).not.toMatch(/%/);
  });

  it("never sets a gamer against the platform", () => {
    wrap(
      <FeedbackDetailPage
        range="90d"
        origin={null}
        detail={buildFeedbackDetail(dataset, "gamer_online", periods, {
          kind: "gamer",
          id: FEEDBACK_FIXTURE_FEATURED.gamer,
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
        range="90d"
        origin={null}
        detail={buildFeedbackDetail(dataset, "gamer_online", periods, {
          kind: "group",
          id: FEEDBACK_FIXTURE_FEATURED.group,
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
    expect(names).toEqual([...names].sort((a, b) => (a ?? "").localeCompare(b ?? "")));
    expect(section.textContent).not.toMatch(/%/);
  });
});
