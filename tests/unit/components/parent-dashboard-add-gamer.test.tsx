import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ParentDashboardPageBody } from "@/components/parent/parent-dashboard-page-body";
import { buildParentDashboardFixture } from "@/components/parent/mock-dashboard-fixtures";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { ParentDashboardGamer } from "@/components/parent/parent-dashboard-page-body";

/**
 * **The add-a-child affordance stops being offered at the cap.**
 *
 * The limit is a UI-only one: the API and the database will happily link an
 * eighth child, so nothing downstream refuses the request — the page not
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

/** The tile's label, read from the catalogue so a copy change can't hide a
 *  regression behind a passing test. */
const ADD_GAMER = messages.family.addGamer;

function dashboardHtml(gamers: readonly ParentDashboardGamer[]): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <ParentDashboardPageBody
            gamers={gamers}
            billingCard={<div />}
            onAddGamer={() => {}}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** Real children out of the preview fixtures, so no shape is invented here. */
function fixtureGamers(): ParentDashboardGamer[] {
  const { gamers } = buildParentDashboardFixture(
    NOW,
    "seven-gamers",
    "en",
    "Europe/Helsinki",
  );
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
