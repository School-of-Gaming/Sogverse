import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enDashboardSections from "@/../messages/en/dashboardSections.json";
import enFamily from "@/../messages/en/family.json";
import enHelpSection from "@/../messages/en/helpSection.json";
import enProductType from "@/../messages/en/productType.json";
import enActivityCard from "@/../messages/en/activityCard.json";
import enSessionBadge from "@/../messages/en/sessionBadge.json";
import enFamilyEnrollment from "@/../messages/en/familyEnrollment.json";
import enParent from "@/../messages/en/parent.json";
import enTopicPrep from "@/../messages/en/topicPrep.json";
import { NO_TOPIC_PREP_READY } from "@/components/topic-prep/topic-prep-cookie";
import { ParentDashboardPageBody } from "@/components/parent/parent-dashboard-page-body";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants/account-limits";
import {
  AuthProvider,
  NowProvider,
  QueryProvider,
  TimezoneProvider,
} from "@/providers";
import type { ParentDashboardParticipant } from "@/components/parent/parent-dashboard-page-body";

const messages = {
  dashboardSections: enDashboardSections,
  family: enFamily,
  helpSection: enHelpSection,
  productType: enProductType,
  activityCard: enActivityCard,
  sessionBadge: enSessionBadge,
  familyEnrollment: enFamilyEnrollment,
  parent: enParent,
  topicPrep: enTopicPrep,
};

/**
 * **The add-a-child affordance stops being offered at the cap.**
 *
 * The limit is a UI-only one: the API and the database will happily link one
 * child past it, so nothing downstream refuses the request — the page not
 * offering it *is* the enforcement. The tile strip this dashboard absorbed used
 * to hold that rule, and when it went, the rule had to come with it or a capped
 * parent would meet an error message where a button used to be.
 *
 * Both directions are pinned, because only the pair says anything: a page that
 * never draws the tile passes the first assertion, and a page that always draws
 * it passes the second.
 *
 * Rendered to static markup — nothing here depends on an effect or a
 * measurement, and the server's HTML is the frame a parent actually meets.
 */

/** The instant the cards' live/locked states are read against. */
const NOW = new Date("2026-02-11T20:00:00Z");

/** The signed-in parent. A real UUID, since a viewer id is one everywhere else. */
const VIEWER_ID = "c6d9a0f2-7a4b-4f1e-8f0c-1b2d3e4f5a6b";

/** The tile's label, read from the catalogue so a copy change can't hide a
 *  regression behind a passing test. */
const ADD_GAMER = messages.family.addGamer;

function dashboardHtml(
  gamers: readonly ParentDashboardParticipant[],
  billingCard: React.ReactElement | null = <div />,
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* Auth alongside the zone and the clock: an enrollment card keys the
          prep guide's dismissal by the viewer's own id, because a parent and a
          child routinely share one browser. */}
      <QueryProvider>
        <AuthProvider initialUser={{ id: VIEWER_ID, email: undefined }}>
          <TimezoneProvider initialTimezone="Europe/Helsinki">
            <NowProvider initialNow={NOW}>
              <ParentDashboardPageBody
                gamers={gamers}
                prepDismissed={NO_TOPIC_PREP_READY}
                billingCard={billingCard}
                helpForm={<div />}
                onAddGamer={() => {}}
              />
            </NowProvider>
          </TimezoneProvider>
        </AuthProvider>
      </QueryProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * Real UUIDs, hardcoded: every child section carries an identicon, and a
 * readable stand-in renders a degenerate one. One per child the cap allows.
 */
const CHILD_IDS = [
  "ca69035f-a39e-42b8-a027-51d09d1dd32a",
  "764cd1e8-ff5a-426a-bf66-367afef257ee",
  "62a33838-0250-4657-8993-19a1f5e12409",
  "4cf16d40-6953-4cec-98a2-cd3a75a9b321",
  "4619cca1-7bb5-4d43-9238-20593bb83b71",
  "592e34cd-6f81-4a5d-b65c-e72efcf82329",
  "d7420745-c167-48aa-b890-805dc15e385d",
  "ff43cd32-f2f5-4edc-899c-6f6c0ff9d427",
  "0ca1fc30-d389-455b-baf9-21aaeceb99ae",
  "b7f2ffb9-fe92-4053-a6a7-5f5e15c63ddd",
  "7c92fd75-d085-41a7-bdfd-e2d3de394954",
  "d4ba61e3-d08d-4146-b7c0-9a45d0bbc0ee",
  "49182dd3-9f7f-46ae-8fc7-35be6c5ad50a",
  "b51cd896-2749-4811-82b1-3f4abdcc88b6",
  "3249a60d-032c-4a78-a447-a33a0239c83b",
] as const;

/**
 * A family exactly at the cap. What each child is signed up for has no bearing
 * on the add affordance, so every one of them is signed up for nothing.
 */
function fixtureGamers(): ParentDashboardParticipant[] {
  const gamers = CHILD_IDS.slice(0, MAX_GAMERS_PER_PARENT).map((id, i) => ({
    id,
    firstName: `Child ${i + 1}`,
    enrollments: [],
  }));
  expect(gamers).toHaveLength(MAX_GAMERS_PER_PARENT);
  return gamers;
}

describe("the parent dashboard's add-a-child affordance", () => {
  it("offers the tile while the parent is under the cap", () => {
    const html = dashboardHtml(fixtureGamers().slice(0, -1));

    expect(html).toContain(ADD_GAMER);
  });

  it("withdraws it once the parent is at the cap", () => {
    const html = dashboardHtml(fixtureGamers());

    expect(html).not.toContain(ADD_GAMER);
  });

  it("offers it at full strength to a parent with no children at all", () => {
    const html = dashboardHtml([]);

    expect(html).toContain(ADD_GAMER);
    // The no-children card, not the quiet tile — the empty state is a section
    // of its own and the add button is the page's whole next step there.
    expect(html).toContain(messages.familyEnrollment.noGamers);
  });
});

/**
 * **A parent with no billing account has no billing section** — no heading, no
 * pill entry, no card — because the portal would open on nothing. The pair is
 * pinned for the same reason as above: a page that never draws the section
 * passes the first assertion alone.
 */
describe("the parent dashboard's billing section", () => {
  const BILLING = messages.dashboardSections.billing;

  it("is drawn, heading and pill entry included, when there is a card", () => {
    const html = dashboardHtml([], <div data-testid="billing-card" />);

    expect(html).toContain('id="billing"');
    expect(html).toContain("billing-card");
    expect(html).toContain(BILLING);
  });

  it("is absent altogether when there is no card", () => {
    const html = dashboardHtml([], null);

    expect(html).not.toContain('id="billing"');
    expect(html).not.toContain(BILLING);
  });
});
