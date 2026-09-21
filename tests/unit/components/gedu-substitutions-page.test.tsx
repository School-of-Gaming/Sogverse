import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduSubstitutionPoolSectionView } from "@/components/gedu/GeduSubstitutionPoolSectionView";
import { GeduSubstitutionsPageBody } from "@/components/gedu/gedu-substitutions-page-body";
import {
  buildGeduSubstitutionsFixture,
  type GeduSubstitutionsScenario,
} from "@/components/gedu/mock-substitutions-fixtures";
import { buttonVariants } from "@/components/ui/button";
import { NowProvider, TimezoneProvider } from "@/providers";

/**
 * ============================================================================
 * The Substitutions page: what it shows, in what order, and what it marks
 * ============================================================================
 *
 * Three things about this page are decisions rather than consequences, and each
 * is invisible to every other test:
 *
 * - **The open queue comes first and is ordered by how close each session is.**
 *   That is the page's whole job — finding somebody before the session runs
 *   without one — and a grid read in two dimensions makes the order easy to
 *   lose in a tidy-up.
 * - **A session inside the next day is marked, and one further out is not.**
 *   The mark is the app's existing warning status, so what has to hold is
 *   *which* cards wear it, and it is driven by a seeded clock rather than by
 *   real time.
 * - **Offering wears the act colour.** It was the world colour, which is the
 *   brand's other half and not what a press is drawn in. Asserted against the
 *   Button primitive's own output, so a token rename moves both together.
 */

const TIME_ZONE = "Europe/Helsinki";

/**
 * Tuesday 17 March 2026, 11:00 in Helsinki — before that month's DST step, so
 * the fixture's own clock faces are not straddling one.
 *
 * The fixture is derived from this instant and the page is rendered against it,
 * which is what makes "inside the next day" a fact this file controls rather
 * than one it waits for.
 */
const NOW = new Date("2026-03-17T09:00:00Z");

function renderPage(scenario: GeduSubstitutionsScenario) {
  const fixture = buildGeduSubstitutionsFixture(NOW, scenario, "en", TIME_ZONE);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduSubstitutionsPageBody
            // The real section view over the real fixture rows, with the two
            // writes inert — the same split the preview scene takes.
            pool={
              <GeduSubstitutionPoolSectionView
                rows={fixture.pool}
                committingRequestId={null}
                error={null}
                onOffer={inertWrite}
                onWithdraw={noop}
              />
            }
            substitutions={fixture.substitutions}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

function noop() {}

/** The offer's write, never settled: no test here presses through it. */
function inertWrite(): Promise<void> {
  return new Promise(() => {});
}

const copy = messages.gedu.substitution;

describe("the substitutions page, populated", () => {
  it("renders both sections, open queue first", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    expect(text).toContain(copy.poolHeading);
    expect(text).toContain(copy.mineHeading);
    expect(text.indexOf(copy.poolHeading)).toBeLessThan(
      text.indexOf(copy.mineHeading),
    );
  });

  it("orders the open cards soonest first", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    const order = [
      "Minecraft Redstone Club",
      "Roblox Studio Camp",
      "Fortnite Creative Club",
      "Winter LAN Afternoon",
      "Creator Studio Club",
      "Fortnite Builders Club",
    ].map((name) => {
      const at = text.indexOf(name);
      expect(at, name).toBeGreaterThan(-1);
      return at;
    });

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("marks only the sessions inside the next day", () => {
    const { container } = renderPage("populated");
    const fixture = buildGeduSubstitutionsFixture(NOW, "populated", "en", TIME_ZONE);

    // Two of the six, by construction: one a couple of hours out and one twenty
    // hours out, against four that are a day or more away.
    const due = fixture.pool.filter(
      (row) =>
        row.startsAt !== null &&
        row.startsAt.getTime() - NOW.getTime() < 24 * 60 * 60 * 1000,
    );
    expect(due).toHaveLength(2);

    // The status ink the warning mark is drawn in — the app's own token, spent
    // on the glyph. Nothing else on this page wears it.
    expect(container.querySelectorAll(".text-warning")).toHaveLength(2);
  });

  it("draws the offer in the act colour, not the world one", () => {
    const { container } = renderPage("populated");

    const offer = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === copy.poolOfferAction,
    );
    expect(offer).toBeDefined();

    // Whatever the primary variant emits that the world-coloured one does not.
    // Derived from the primitive rather than typed out, so the assertion
    // follows a rename of the class instead of failing on one.
    const classesOf = (value: string) => value.split(/\s+/).filter(Boolean);
    const secondary = new Set(classesOf(buttonVariants({ variant: "secondary" })));
    const primaryOnly = classesOf(buttonVariants({ variant: "default" })).filter(
      (className) => !secondary.has(className),
    );
    // Label only: the glyph went because the words are the whole control, and
    // the two resting states of this one button have to read alike.
    expect(offer!.querySelector("svg")).toBeNull();
    expect(primaryOnly.length).toBeGreaterThan(0);
    for (const className of primaryOnly) {
      expect(offer!.className, className).toContain(className);
    }
    for (const className of secondary) {
      if (primaryOnly.includes(className)) continue;
      // Only the classes the two variants disagree on: the shared base is on
      // every button and proves nothing either way.
      if (classesOf(buttonVariants({ variant: "default" })).includes(className)) {
        continue;
      }
      expect(offer!.className).not.toContain(className);
    }
  });

  it("offers the withdrawal on the card already offered on", () => {
    const { container } = renderPage("populated");
    const labels = [...container.querySelectorAll("button")].map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toContain(copy.poolWithdrawAction);
    expect(labels.filter((l) => l === copy.poolWithdrawAction)).toHaveLength(1);
  });

  it("shows what the gedu has already taken, locked card included", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    expect(text).toContain(copy.cardEyebrow);
    // The locked state's line — a substitution is on the page from approval,
    // and its workspace opens 48 hours out.
    expect(text).toContain(copy.accessOpens.split("{")[0].trim());
  });

  /**
   * A `<p>` may not contain a `<div>`: the browser closes the paragraph at the
   * block child, so the server's HTML and the client's tree disagree and React
   * throws a hydration error. This branch shipped exactly that bug once.
   */
  it("puts no block element inside a paragraph", () => {
    const { container } = renderPage("populated");
    expect(container.querySelectorAll("p div")).toHaveLength(0);
    expect(container.querySelectorAll("p p")).toHaveLength(0);
  });
});

describe("the substitutions page, with nothing outstanding", () => {
  it("answers both sections in one line each", () => {
    const { container } = renderPage("empty");
    const text = container.textContent;

    expect(text).toContain(copy.poolAllClear);
    expect(text).toContain(copy.mineAllClear);
  });

  it("still carries the page's own chrome, which waits on nothing", () => {
    const { container } = renderPage("empty");
    const text = container.textContent;

    expect(text).toContain(copy.pageTitle);
    expect(text).toContain(copy.poolHeading);
    expect(text).toContain(copy.mineHeading);
    expect(text).toContain(copy.back);
  });
});
