import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduAssignmentCard } from "@/components/gedu/GeduAssignmentCard";
import { buildGeduDashboardFixture } from "@/components/gedu/mock-dashboard-fixtures";
import { formatSessionDateTimeRange } from "@/lib/session-format";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GeduAssignmentCardData } from "@/components/gedu/GeduAssignmentsSectionView";

/**
 * **The card states the product's schedule; the Join states the next session.**
 *
 * The card used to print the next session's own date and time in its most
 * prominent row, immediately above a Join button naming the same evening — the
 * same fact twice, in the row a gedu reads first to work out which of their
 * activities they are looking at. The schedule ("Thursday · 17:00–18:30") is the
 * answer to that question, and it comes from the shared product-schedule
 * formatter, so it reads identically here, on the product's public page and on
 * the admin's.
 *
 * The other half is height. A dashboard is read as a grid, and a grid row
 * stretches — so a card that is short by a line or two is invisible until it is
 * the one alone on the last row, which is precisely where an ended club was
 * turning up looking clipped. Every state therefore renders the same three rows,
 * and the footer holds the Join's height whether it contains a button, a venue,
 * an end date or nothing at all.
 *
 * Rendered to static markup: none of that depends on an effect, and the
 * server's HTML is the frame a gedu meets.
 */

const NOW = new Date("2026-02-11T20:00:00Z");
const TIME_ZONE = "Europe/Helsinki";

/** The footer's reserved height — the Join button's own `size="sm"` height. */
const FOOTER_HEIGHT_CLASS = "min-h-9";

function cardHtml({ assignment, scheduleLines }: GeduAssignmentCardData): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduAssignmentCard
            assignment={assignment}
            scheduleLines={scheduleLines}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** The working dashboard's five cards — every state a card can be in. */
const CARDS = buildGeduDashboardFixture(NOW, "default", "en", TIME_ZONE)
  .assignments;

function cardFor(predicate: (card: GeduAssignmentCardData) => boolean) {
  const found = CARDS.find(predicate);
  if (!found) throw new Error("the default scenario stopped covering a state");
  return found;
}

const endedCard = cardFor((c) => c.assignment.endDate !== null && c.assignment.nextSessionStart === null);
const lockedRemoteCard = cardFor(
  (c) =>
    c.assignment.hasVoiceRoom &&
    c.assignment.nextSessionStart !== null &&
    c.assignment.nextSessionStart.getTime() > NOW.getTime(),
);
const onsiteCard = cardFor(
  (c) => !c.assignment.hasVoiceRoom && c.assignment.siteName !== null,
);

describe("the schedule is the card's timing row", () => {
  it("renders the product's schedule on every state, ended included", () => {
    for (const card of CARDS) {
      const html = cardHtml(card);
      for (const line of card.scheduleLines) {
        expect(html, card.assignment.productName).toContain(line);
      }
      expect(card.scheduleLines.length, card.assignment.productName)
        .toBeGreaterThan(0);
    }
  });

  it("no longer repeats the next session's date and time above the Join", () => {
    const { nextSessionStart, nextSessionEnd } = lockedRemoteCard.assignment;
    expect(nextSessionStart).not.toBeNull();
    expect(nextSessionEnd).not.toBeNull();
    expect(cardHtml(lockedRemoteCard)).not.toContain(
      formatSessionDateTimeRange(
        nextSessionStart!,
        nextSessionEnd!,
        "en",
        TIME_ZONE,
      ),
    );
  });

  it("keeps a row for a product whose schedule is not set yet", () => {
    // The one case with nothing to say, so the row says that rather than
    // collapsing and taking a line off the card's height.
    const html = cardHtml({ ...lockedRemoteCard, scheduleLines: [] });
    expect(html).toContain(messages.gedu.myGroups.noNextSession);
  });
});

describe("every card is the same height whatever its footer holds", () => {
  it("reserves the Join's height in the footer of every state", () => {
    for (const card of CARDS) {
      expect(cardHtml(card), card.assignment.productName).toContain(
        FOOTER_HEIGHT_CLASS,
      );
    }
  });

  /**
   * The three footers, each proved to be the only one on its card: a run that
   * is over names the day it ended, a remote product offers the room, an
   * in-person one names the building.
   */
  it("names the end date on a finished run, in place of a Join", () => {
    const html = cardHtml(endedCard);
    expect(html).toContain("Ended");
    expect(html).not.toContain(messages.voiceButton.joinVoice);
  });

  it("names the venue on an in-person product, with no Join anywhere", () => {
    const html = cardHtml(onsiteCard);
    expect(html).toContain(onsiteCard.assignment.siteName!);
    expect(html).not.toContain(messages.voiceButton.joinVoice);
  });
});

/**
 * The two things in the corner cluster that are not the card's own content: a
 * badge that turns on with the clock, and a badge that is the whole reason a
 * gedu is sweeping the grid. Each has one rule, and each rule was wrong once.
 */
describe("the corner", () => {
  it("holds the Live slot only where the badge could ever land", () => {
    // Reserved on a card with a session ahead of it — invisible rather than
    // absent, because it turns on with the clock and a badge mounting into the
    // flex row would squeeze the product name beside it mid-read.
    const held = cardHtml(lockedRemoteCard);
    expect(held).toContain(messages.gedu.myGroups.liveBadge);
    expect(held).toContain("invisible");

    // Dropped where nothing is left to start: a finished run, and equally a
    // card whose schedule has nothing on it. Space held for something that
    // cannot come is its own defect.
    expect(cardHtml(endedCard)).not.toContain(messages.gedu.myGroups.liveBadge);
    const unscheduled = cardHtml({
      ...lockedRemoteCard,
      assignment: {
        ...lockedRemoteCard.assignment,
        nextSessionStart: null,
        nextSessionEnd: null,
      },
    });
    expect(unscheduled).not.toContain(messages.gedu.myGroups.liveBadge);
  });

  it("makes the attention badge open the card it sits on", () => {
    // It paints *above* the card's stretched link, so a non-interactive badge
    // there is a dead zone on the exact spot the sweep tells a gedu to tap.
    const badged = cardFor((c) => c.assignment.attentionCount > 0);
    const html = cardHtml(badged);
    expect(html).toMatch(/<a[^>]*aria-label="[^"]*attention[^"]*"/);
    expect(html).not.toContain("cursor-default");
  });
});
