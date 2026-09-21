import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduCoverCard } from "@/components/gedu/GeduCoverCard";
import { buildGeduDashboardFixture } from "@/components/gedu/mock-dashboard-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GeduCoverSummary } from "@/lib/gedu-assignment-rollup";

/**
 * **A cover card is not an assignment card with a date on it.**
 *
 * The two share a grid, so what has to hold is that a reader can tell them
 * apart at a glance and that the card sends a sub to the *right group's*
 * workspace. Three things carry that and are pinned here: the card names itself
 * a cover, it states one dated session rather than a cadence, and its link
 * carries the group id — which is the whole reason the workspace route grew a
 * `?groupId=` at all, because a sub has no assignment row for one to be
 * resolved from.
 *
 * The badge is the fourth: a sub's write-up is as owed as anybody's, so the
 * corner mark is the one every other card wears.
 *
 * Rendered to static markup — nothing asserted here depends on an effect, and
 * the server's HTML is the frame a gedu meets.
 */

const NOW = new Date("2026-02-11T20:00:00Z");
const TIME_ZONE = "Europe/Helsinki";

function cardHtml(cover: GeduCoverSummary): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduCoverCard cover={cover} />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * The working dashboard's own covers, so no shape is invented here — and it
 * carries one of each state, soonest first: an open cover tomorrow, and one six
 * days out whose workspace has not opened.
 */
function fixtureCovers(): GeduCoverSummary[] {
  const { covers } = buildGeduDashboardFixture(NOW, "default", "en", TIME_ZONE);
  if (covers.length < 2) {
    throw new Error("the default scenario stopped carrying both cover states");
  }
  return covers;
}

function fixtureCover(): GeduCoverSummary {
  return fixtureCovers()[0];
}

function fixtureLockedCover(): GeduCoverSummary {
  return fixtureCovers()[1];
}

const copy = messages.gedu.cover;

/** The literal words before the first placeholder, so copy edits are caught. */
const OPENS_AT = copy.accessOpens.split("{")[0].trim();

/** A real destination, so "the link is gone" is a claim with something to lose. */
const WORKSPACE = {
  pathname: "/gedu/clubs/[id]",
  params: { id: "product-1" },
  query: { groupId: "sibling-group" },
} as const;

describe("GeduCoverCard", () => {
  it("names itself a cover, beside the product and the group", () => {
    const cover = fixtureCover();
    const html = cardHtml(cover);
    expect(html).toContain(copy.cardEyebrow);
    expect(html).toContain(cover.productName);
    expect(html).toContain(cover.groupName ?? "");
  });

  // A badge is a div, and a browser closes a paragraph at the first div inside
  // it — so the server's markup and the client's tree part ways and the whole
  // dashboard fails hydration. Rendering to a string never parses, so nothing
  // else here would notice.
  it("nests no div inside a paragraph, open or locked", () => {
    for (const cover of fixtureCovers()) {
      expect(cardHtml(cover)).not.toMatch(/<p[\s>](?:(?!<\/p>)[^])*<div/);
    }
  });

  it("locks a cover whose workspace has not opened yet", () => {
    // The whole of the locked state, asserted on one render: a sub is told
    // which session and when they get in, and neither way in leads anywhere.
    // A live link would land them on the workspace's "not assigned" empty
    // state — a sub who IS covering, told they are not.
    const cover: GeduCoverSummary = {
      ...fixtureLockedCover(),
      openHref: WORKSPACE,
      // Forced on, though the live read cannot produce it: a locked cover is a
      // session that has not run. It is what makes the badge's own link
      // assertable at all.
      attentionCount: 1,
    };
    expect(cover.accessOpensAt).not.toBeNull();
    expect(cover.accessOpensAt!.getTime()).toBeGreaterThan(NOW.getTime());

    const html = cardHtml(cover);
    // Still reads as the session it is about.
    expect(html).toContain(cover.productName);
    expect(html).toContain(OPENS_AT);
    // Neither the card nor the corner badge goes anywhere.
    expect(html).not.toContain("/gedu/clubs/product-1");
    expect(html).toContain(
      copy.cardLockedLabel.replace("{product}", cover.productName),
    );
    // No Join, on a remote cover that would otherwise render one: there is no
    // room to promise before the workspace opens, and a card must not say the
    // same thing two ways.
    expect(html).not.toMatch(/<button/);
  });

  it("links the same cover once its workspace has opened", () => {
    const opened: GeduCoverSummary = {
      ...fixtureLockedCover(),
      openHref: WORKSPACE,
      accessOpensAt: new Date(NOW.getTime() - 60_000),
    };
    const html = cardHtml(opened);
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).toContain("groupId=sibling-group");
    expect(html).not.toContain(OPENS_AT);
  });

  it("states the covered session's date and clock face", () => {
    const cover = fixtureCover();
    expect(cover.startsAt).not.toBeNull();
    const html = cardHtml(cover);
    // The day, in the viewer's zone — the same conversion every other clock
    // face on this page makes.
    const weekday = new Intl.DateTimeFormat("en", {
      weekday: "short",
      timeZone: TIME_ZONE,
    }).format(cover.startsAt!);
    expect(html).toContain(weekday);
  });

  it("renders the group-bearing workspace link it is handed", () => {
    // The roll-up is what puts the group on the href (pinned in its own suite);
    // what this card owes is rendering that href rather than dropping its
    // query. The preview fixture's own cover is deliberately inert — it has no
    // scene behind it — so the destination is supplied here.
    const cover: GeduCoverSummary = {
      ...fixtureCover(),
      openHref: {
        pathname: "/gedu/clubs/[id]",
        params: { id: "product-1" },
        query: { groupId: "sibling-group" },
      },
    };
    const html = cardHtml(cover);
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).toContain("groupId=sibling-group");
  });

  it("wears the attention badge at a non-zero count and nothing at zero", () => {
    const cover = fixtureCover();
    // A cover owes the one session it covers, so its count is 0 or 1 — and 1 is
    // the state the badge exists for.
    expect(cover.attentionCount).toBe(1);
    // The badge's accessible name is the whole sentence; asserting on it rather
    // than on the digit is what keeps this from passing on a card that happens
    // to print a 1 somewhere else.
    expect(cardHtml(cover)).toContain("1 session needs attention");
    expect(cardHtml({ ...cover, attentionCount: 0 })).not.toContain(
      "needs attention",
    );
  });

  it("falls back to the bare date when the schedule no longer projects it", () => {
    // An orphaned cover — the request keys on (group, date) and an admin moved
    // the schedule's weekday afterwards. The card is history rather than a
    // fault and must still render.
    const orphan: GeduCoverSummary = {
      ...fixtureCover(),
      startsAt: null,
      endsAt: null,
      accessOpensAt: null,
      coveredDate: "2026-02-17",
      openHref: WORKSPACE,
    };
    const html = cardHtml(orphan);
    expect(html).toContain("Feb");
    expect(html).toContain("17");
    // And it stays LINKED. An orphaned date has no start to count 48 hours back
    // from, so there is no lock to apply — the database falls open on one for
    // the same reason, because the sub may still owe that session a write-up.
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).not.toContain(OPENS_AT);
  });
});
