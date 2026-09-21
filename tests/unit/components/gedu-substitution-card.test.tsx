import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduSubstitutionCard } from "@/components/gedu/GeduSubstitutionCard";
import { buildGeduDashboardFixture } from "@/components/gedu/mock-dashboard-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GeduSubstitutionSummary } from "@/lib/gedu-assignment-rollup";

/**
 * **A substitution card is not an assignment card with a date on it.**
 *
 * The two share a grid, so what has to hold is that a reader can tell them
 * apart at a glance and that the card sends a sub to the *right group's*
 * workspace. Three things carry that and are pinned here: the card names itself
 * a substitution, it states one dated session rather than a cadence, and its link
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

function cardHtml(substitution: GeduSubstitutionSummary): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduSubstitutionCard substitution={substitution} />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * The working dashboard's own substitutions, so no shape is invented here — and it
 * carries one of each state, soonest first: an open substitution tomorrow, and one six
 * days out whose workspace has not opened.
 */
function fixtureCovers(): GeduSubstitutionSummary[] {
  const { substitutions } = buildGeduDashboardFixture(NOW, "default", "en", TIME_ZONE);
  if (substitutions.length < 2) {
    throw new Error("the default scenario stopped carrying both substitution states");
  }
  return substitutions;
}

function fixtureCover(): GeduSubstitutionSummary {
  return fixtureCovers()[0];
}

function fixtureLockedSubstitution(): GeduSubstitutionSummary {
  return fixtureCovers()[1];
}

const copy = messages.gedu.substitution;

/** The literal words before the first placeholder, so copy edits are caught. */
const OPENS_AT = copy.accessOpens.split("{")[0].trim();

/** A real destination, so "the link is gone" is a claim with something to lose. */
const WORKSPACE = {
  pathname: "/gedu/clubs/[id]",
  params: { id: "product-1" },
  query: { groupId: "sibling-group" },
} as const;

describe("GeduSubstitutionCard", () => {
  it("names itself a substitution, beside the product and the group", () => {
    const substitution = fixtureCover();
    const html = cardHtml(substitution);
    expect(html).toContain(copy.cardEyebrow);
    expect(html).toContain(substitution.productName);
    expect(html).toContain(substitution.groupName ?? "");
  });

  // A badge is a div, and a browser closes a paragraph at the first div inside
  // it — so the server's markup and the client's tree part ways and the whole
  // dashboard fails hydration. Rendering to a string never parses, so nothing
  // else here would notice.
  it("nests no div inside a paragraph, open or locked", () => {
    for (const substitution of fixtureCovers()) {
      expect(cardHtml(substitution)).not.toMatch(/<p[\s>](?:(?!<\/p>)[^])*<div/);
    }
  });

  it("locks a substitution whose workspace has not opened yet", () => {
    // The whole of the locked state, asserted on one render: a sub is told
    // which session and when they get in, and neither way in leads anywhere.
    // A live link would land them on the workspace's "not assigned" empty
    // state — a sub who IS substituting, told they are not.
    const substitution: GeduSubstitutionSummary = {
      ...fixtureLockedSubstitution(),
      openHref: WORKSPACE,
      // Forced on, though the live read cannot produce it: a locked substitution is a
      // session that has not run. It is what makes the badge's own link
      // assertable at all.
      attentionCount: 1,
    };
    expect(substitution.accessOpensAt.getTime()).toBeGreaterThan(NOW.getTime());

    const html = cardHtml(substitution);
    // Still reads as the session it is about.
    expect(html).toContain(substitution.productName);
    expect(html).toContain(OPENS_AT);
    // Neither the card nor the corner badge goes anywhere.
    expect(html).not.toContain("/gedu/clubs/product-1");
    expect(html).toContain(
      copy.cardLockedLabel.replace("{product}", substitution.productName),
    );
    // No Join, on a remote substitution that would otherwise render one: there is no
    // room to promise before the workspace opens, and a card must not say the
    // same thing two ways.
    expect(html).not.toMatch(/<button/);
  });

  it("links the same substitution once its workspace has opened", () => {
    const opened: GeduSubstitutionSummary = {
      ...fixtureLockedSubstitution(),
      openHref: WORKSPACE,
      accessOpensAt: new Date(NOW.getTime() - 60_000),
    };
    const html = cardHtml(opened);
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).toContain("groupId=sibling-group");
    expect(html).not.toContain(OPENS_AT);
  });

  it("states the substituted session's date and clock face", () => {
    const substitution = fixtureCover();
    expect(substitution.startsAt).not.toBeNull();
    const html = cardHtml(substitution);
    // The day, in the viewer's zone — the same conversion every other clock
    // face on this page makes.
    const weekday = new Intl.DateTimeFormat("en", {
      weekday: "short",
      timeZone: TIME_ZONE,
    }).format(substitution.startsAt!);
    expect(html).toContain(weekday);
  });

  it("renders the group-bearing workspace link it is handed", () => {
    // The roll-up is what puts the group on the href (pinned in its own suite);
    // what this card owes is rendering that href rather than dropping its
    // query. The preview fixture's own substitution is deliberately inert — it has no
    // scene behind it — so the destination is supplied here.
    const substitution: GeduSubstitutionSummary = {
      ...fixtureCover(),
      openHref: {
        pathname: "/gedu/clubs/[id]",
        params: { id: "product-1" },
        query: { groupId: "sibling-group" },
      },
    };
    const html = cardHtml(substitution);
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).toContain("groupId=sibling-group");
  });

  it("wears the attention badge at a non-zero count and nothing at zero", () => {
    const substitution = fixtureCover();
    // A substitution owes the one session it covers, so its count is 0 or 1 — and 1 is
    // the state the badge exists for.
    expect(substitution.attentionCount).toBe(1);
    // The badge's accessible name is the whole sentence; asserting on it rather
    // than on the digit is what keeps this from passing on a card that happens
    // to print a 1 somewhere else.
    expect(cardHtml(substitution)).toContain("1 session needs attention");
    expect(cardHtml({ ...substitution, attentionCount: 0 })).not.toContain(
      "needs attention",
    );
  });

  /**
   * An orphaned substitution — the request keys on (group, date) and an admin
   * moved the schedule's weekday afterwards, so the date names a day the
   * schedule no longer projects.
   *
   * It has no start, but it is **not** unlocked: the SQL counts its 48 hours
   * back from product-local midnight of the substitution date, and the card has
   * to lock and unlock at exactly that instant or it links into a workspace
   * every gate behind it still refuses.
   */
  function orphan(substitutionDate: string): GeduSubstitutionSummary {
    return {
      ...fixtureCover(),
      startsAt: null,
      endsAt: null,
      substitutionDate,
      // Product-local midnight of the date, less 48 hours — the roll-up's own
      // arithmetic, restated as a literal so this case does not pass by
      // agreeing with a bug in it.
      accessOpensAt: new Date(
        new Date(`${substitutionDate}T00:00:00+02:00`).getTime() -
          48 * 60 * 60 * 1000,
      ),
      openHref: WORKSPACE,
    };
  }

  it("falls back to the bare date when the schedule no longer projects it", () => {
    // The card is history rather than a fault and must still render, naming the
    // day it is about even with no clock face to put beside it.
    const html = cardHtml(orphan("2026-02-17"));
    expect(html).toContain("Feb");
    expect(html).toContain("17");
  });

  it("locks an orphaned date whose product-local midnight is still 48 hours off", () => {
    // Two weeks out, which is exactly the case the null reading got wrong: it
    // drew an open, linked card for a workspace the database refuses.
    const html = cardHtml(orphan("2026-02-25"));
    expect(html).toContain(OPENS_AT);
    expect(html).not.toContain("/gedu/clubs/product-1");
  });

  it("links an orphaned date once its own 48 hours have come", () => {
    // Now is 11 Feb 20:00 UTC, so midnight-less-48h on the 13th is already
    // behind us — and the sub may still owe that afternoon a write-up.
    const html = cardHtml(orphan("2026-02-13"));
    expect(html).toContain("/gedu/clubs/product-1");
    expect(html).not.toContain(OPENS_AT);
  });
});
