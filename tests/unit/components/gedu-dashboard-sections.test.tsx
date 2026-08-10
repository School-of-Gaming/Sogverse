import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduDashboardPageBody } from "@/components/gedu/gedu-dashboard-page-body";
import { buildGeduDashboardFixture } from "@/components/gedu/mock-dashboard-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GeduAssignmentCardData } from "@/components/gedu/GeduAssignmentsSectionView";

/**
 * **The dashboard's headings are the page's shape, and its shape follows what
 * the gedu runs — with exactly one exception.**
 *
 * A gedu with only camps gets one "Camps" section and never learns that clubs
 * or events exist. A gedu with *nothing* has no noun of their own, so the page
 * falls back to the default one: an empty dashboard is headed "Clubs" and
 * carries the same pill entry a populated one would, because an unheaded
 * paragraph floating above the voice room reads as a page that failed to render
 * rather than as a page with nothing in it yet.
 *
 * Both halves are pinned here because they pull against each other: the obvious
 * way to give the empty page a heading is to stop dropping the empty nouns, and
 * that would put three headings on every camp gedu's dashboard.
 *
 * Rendered to static markup rather than driven in jsdom: nothing asserted here
 * depends on an effect or a measurement, and the server's HTML is the frame a
 * gedu actually meets.
 */

/** The instant a card's live/locked state is read against. */
const NOW = new Date("2026-02-11T20:00:00Z");

/**
 * The empty line as it appears in the HTML. React escapes only the markup
 * characters, so the message's curly apostrophe survives verbatim — comparing
 * against the catalogue directly is what keeps this from passing on a page that
 * no longer renders the line at all.
 */
const EMPTY_LINE = messages.dashboardSections.myGroupsEmptyStateGedu;

function dashboardHtml(assignments: readonly GeduAssignmentCardData[]): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* The real providers, seeded rather than mocked: a card reads the
          viewer's zone and a request-stable `now` straight out of them. */}
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <GeduDashboardPageBody
            assignments={assignments}
            verified
            instantRoomCard={<div />}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** A real card out of the preview fixtures, so no shape is invented here. */
function campOnlyAssignments(): GeduAssignmentCardData[] {
  const { assignments } = buildGeduDashboardFixture(
    NOW,
    "default",
    "en",
    "Europe/Helsinki",
  );
  const camps = assignments.filter(
    (card) => card.assignment.productType === "camp",
  );
  expect(camps.length).toBeGreaterThan(0);
  return camps;
}

describe("the gedu dashboard's empty state", () => {
  const html = dashboardHtml([]);

  it("heads the page with the default noun rather than with nothing", () => {
    expect(html).toContain('id="clubs"');
    expect(html).toContain(">Clubs</h2>");
  });

  it("says a group will appear here, in place of the card grid", () => {
    expect(html).toContain(EMPTY_LINE);
  });

  it("gives that section a pill entry, so the nav is not a single chip", () => {
    expect(html).toContain('href="#clubs"');
    expect(html).toContain('href="#instant-voice-room"');
  });

  it("invents no camps or events to sit empty beside it", () => {
    expect(html).not.toContain(">Camps</h2>");
    expect(html).not.toContain(">Events</h2>");
  });
});

describe("a gedu who runs one kind of thing", () => {
  const html = dashboardHtml(campOnlyAssignments());

  it("gets that noun's heading and no others", () => {
    expect(html).toContain(">Camps</h2>");
    expect(html).not.toContain(">Clubs</h2>");
    expect(html).not.toContain(">Events</h2>");
  });

  it("never shows the empty line under a section that has cards", () => {
    expect(html).not.toContain(EMPTY_LINE);
  });
});
