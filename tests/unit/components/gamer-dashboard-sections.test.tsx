import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GamerDashboardPageBody } from "@/components/gamer/gamer-dashboard-page-body";
import {
  GAMER_DASHBOARD_FIRST_NAME,
  buildGamerDashboardFixture,
} from "@/components/gamer/mock-dashboard-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";

/**
 * **The gamer dashboard ends in Help, and the pill never exceeds four chips.**
 *
 * Both halves are one fact seen twice. The page used to end in a decorative Yty
 * grid whose feature does nothing, and the child had no way to ask anybody for
 * anything; the section that replaced it is the only backend a gamer account can
 * reach from this page. The chip budget is why nothing else may be added beside
 * it: three activity nouns plus Help is the widest the bar gets, and a fifth
 * chip overflowed 360px in three of the five locales.
 *
 * Rendered to static markup rather than driven in jsdom: nothing asserted here
 * depends on an effect or a measurement, and the server's HTML is the frame a
 * child actually meets.
 */

/** The instant the cards' live/locked states are read against. */
const NOW = new Date("2026-02-11T20:00:00Z");

/**
 * How many chips the pill drew.
 *
 * Counted inside the `<nav>` rather than across the document: an enrollment
 * card with no room to reach renders its Join as `href="#"`, so counting every
 * fragment link on the page counts cards as chips.
 */
function chipCount(html: string): number {
  const nav = /<nav\b[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  expect(nav).not.toBeNull();
  return (nav?.[1].match(/href="#/g) ?? []).length;
}

function dashboardHtml(scenario: "typical" | "empty"): string {
  const enrollments = buildGamerDashboardFixture(
    NOW,
    scenario,
    "en",
    "Europe/Helsinki",
  );

  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* The real providers, seeded rather than mocked: a card reads the
          viewer's zone and a request-stable `now` straight out of them. */}
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <GamerDashboardPageBody
            firstName={GAMER_DASHBOARD_FIRST_NAME}
            enrollments={enrollments}
            // A node, exactly as the live shell and the preview scene pass one.
            // What it holds is the form's business, not this page's.
            helpForm={<div />}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

describe("a gamer with every kind of thing booked", () => {
  const html = dashboardHtml("typical");

  it("ends in the Help section, headed in the child's own words", () => {
    expect(html).toContain('id="help"');
    expect(html).toContain(`>${messages.helpSection.gamerHeading}</h2>`);
  });

  it("puts Help last in the pill, after every activity noun", () => {
    expect(html.indexOf('href="#help"')).toBeGreaterThan(
      html.indexOf('href="#clubs"'),
    );
  });

  it("draws exactly the four chips the 360px bar allows", () => {
    // Exact, not a ceiling: the `typical` fixture holds all three activity
    // nouns precisely so this renders the widest bar the page can produce, and
    // a ceiling would pass just as happily on a fixture that lost one of them.
    expect(chipCount(html)).toBe(4);
  });

  it("has no Yty section — that explanation lives on /about now", () => {
    expect(html).not.toContain('id="yty"');
    expect(html).not.toContain('href="#yty"');
  });

  it("offers no support email: a gamer account has no mailbox of its own", () => {
    expect(html).not.toContain(messages.helpSection.contact.emailLabel);
  });
});

describe("a gamer with nothing booked yet", () => {
  const html = dashboardHtml("empty");

  it("still gets the Help section, which is theirs regardless", () => {
    expect(html).toContain('id="help"');
  });
});
