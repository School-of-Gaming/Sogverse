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
 * paragraph floating above the Tools section reads as a page that failed to
 * render rather than as a page with nothing in it yet.
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

function dashboardHtml(
  assignments: readonly GeduAssignmentCardData[],
  { certified = true }: { certified?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* The real providers, seeded rather than mocked: a card reads the
          viewer's zone and a request-stable `now` straight out of them. */}
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <GeduDashboardPageBody
            assignments={assignments}
            certified={certified}
            // Signed and checked, so neither next-step band is on the page:
            // this file is about how the activity sections are composed, and a
            // band above them is one more thing in the markup it asserts
            // against.
            contractAccepted
            criminalRecordCheckPassed
            toolsCard={<div />}
            instantRoomCard={<div />}
            // Marked rather than anonymous: whether the section still renders
            // the node it was handed is the assertion below, and an unmarked
            // `<div />` is indistinguishable from the page's own markup.
            helpForm={<div id="help-form" />}
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
    expect(html).toContain('href="#tools"');
  });

  it("names Tools once and last, with no section of its own for the room", () => {
    expect(html).not.toContain('href="#instant-voice-room"');
    expect(html.indexOf('href="#tools"')).toBeGreaterThan(
      html.indexOf('href="#clubs"'),
    );
  });

  it("invents no camps or events to sit empty beside it", () => {
    expect(html).not.toContain(">Camps</h2>");
    expect(html).not.toContain(">Events</h2>");
  });
});

/**
 * **Help & feedback is a sibling of Tools, not a card inside it — which is the
 * whole reason it survives the certification gate.**
 *
 * The gedu who most needs a way to ask what happens next is the one waiting for
 * an admin to certify them, and their dashboard has nothing else on it. A card
 * inside Tools would have been hidden by the same flag that hides the two
 * moderator tools, so the shape is the guarantee and it is pinned here: the
 * uncertified page keeps the section, its chip, the message form and the answer
 * to the very question they are waiting on, and still withholds the tools.
 */
describe("a gedu still awaiting certification", () => {
  const html = dashboardHtml([], { certified: false });

  it("still gets the Help & feedback section and its pill chip", () => {
    expect(html).toContain('id="help"');
    expect(html).toContain('href="#help"');
    // The heading carries an ampersand, which React escapes on the way out —
    // compare against the catalogue's own words rather than a retyped literal.
    expect(html).toContain(
      `>${messages.helpSection.heading.replace("&", "&amp;")}</h2>`,
    );
  });

  it("still gets the message form, which is the point of the section", () => {
    expect(html).toContain('id="help-form"');
  });

  it("still answers what certification means, which is what they are waiting on", () => {
    expect(html).toContain(messages.gedu.helpFaq.items.certification.question);
  });

  it("is still refused the tools themselves", () => {
    expect(html).toContain(messages.tools.uncertified.body);
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
