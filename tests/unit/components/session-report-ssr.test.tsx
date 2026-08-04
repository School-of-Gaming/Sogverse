import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionReport } from "@/components/session-feed/SessionReport";
import { reportOverflows } from "@/components/session-feed/report-clamp";

/**
 * **A report has to be complete in the frame the server paints, and it has to
 * stay that way.**
 *
 * The server's HTML is on screen long before any JavaScript runs. A report
 * whose body, fade or "Read more" only exist after hydration is a report that
 * visibly assembles itself under the reader, shoving the rest of the feed down
 * as each piece lands — the layout rule's exact prohibition.
 *
 * Three ways that regresses, and this pins all three:
 *
 * 1. **The renderer gets lazy-loaded.** Only the rich *editor* may be —
 *    ProseMirror is heavy and the common visit never opens one. The markdown
 *    renderer is small and every visit reads reports, so it stays in the page
 *    bundle. Wrapping it in a client-only dynamic import would empty the body
 *    out of this HTML.
 * 2. **The control goes back to waiting for a measurement.** A server cannot
 *    measure, so the offer is decided from the source text — and, since round
 *    eight, *only* from the source text. A post-mount correction reintroduced
 *    here would be a control landing a hydration late all over again.
 * 3. **Server and client stop agreeing.** The decision is a pure function of
 *    the markdown, so the HTML the server writes and the offer the browser
 *    computes on its first render are the same by construction. A hydration
 *    mismatch here is silent in development and a flicker in production.
 *
 * Server-rendering rather than asserting on jsdom is the point: jsdom reports
 * every height as zero, so a browser-shaped test would pass on markup that
 * never reaches a browser correctly.
 */

function serverHtml(markdown: string, clamped = true): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionReport markdown={markdown} clamped={clamped} />
    </NextIntlClientProvider>,
  );
}

/** A real report's shape: a dated title and several paragraphs of prose. */
const LONG_REPORT = `# 9.2.2026 – The castle

We spent the whole of this one on the castle, and it is finally the shape everyone has been arguing about since before the break.

The towers went up first, and the two of them actually match, which you can see from the road.

Elias worked on the gate all evening. It opens on a lever hidden behind the left pillar, and he tested it about forty times before he let anybody else near it.

They spent most of the session on the floor pattern rather than the walls, which sounded like a mistake and turned out not to be.

We ended with everyone standing on top of the north tower looking down at it, which felt like the right way to finish.

Thank you all — the castle stays in the world, so do go and walk around it during the week.`;

/** A list-shaped report — the other way a write-up gets tall. */
const LONG_LIST_REPORT = `# Redstone week: item sorters

We built item sorters from scratch this week, then broke them on purpose.

## The build

- A hopper line feeding four labelled chests
- Comparators reading the filter chests, which is the bit that sorts
- An overflow chest at the end, so nothing is lost when a filter fills up

The overflow was the hard part and Elias solved it on his own.`;

const SHORT_REPORT = `# Mob-proofing night

We lit the paths, walled the gaps and got through a whole session without losing anybody to a creeper.`;

describe("a session report is whole in the server's HTML", () => {
  it("renders the formatted body, not a placeholder for one", () => {
    const html = serverHtml(LONG_REPORT);
    // The prose itself, and the markdown actually parsed into elements rather
    // than shipped as source text.
    expect(html).toContain("the shape everyone has been arguing about");
    expect(html).toContain("<h3");
    expect(html).toContain("<p");
    expect(html).not.toContain("# 9.2.2026");
  });

  it("carries the Read more control and the fade on an overflowing report", () => {
    for (const report of [LONG_REPORT, LONG_LIST_REPORT]) {
      const html = serverHtml(report);
      expect(html).toContain(messages.sessionFeed.readMore);
      expect(html).toContain('aria-expanded="false"');
      // The clamp says it is a clamp from the first frame too, or the reader
      // sees prose ending flush against an invisible edge and stops looking.
      expect(html).toContain("mask-image");
    }
  });

  /**
   * The control precedes the body it opens, in the markup itself. That is the
   * layout rule rather than a stylistic preference: a control *under* a
   * collapsible region is pushed down the page by its own expansion, taking the
   * cursor's target and everything below it with it.
   */
  it("puts the control above the body it expands", () => {
    const html = serverHtml(LONG_REPORT);
    expect(html.indexOf(messages.sessionFeed.readMore)).toBeLessThan(
      html.indexOf("mask-image"),
    );
  });

  it("offers nothing on a report that fits", () => {
    const html = serverHtml(SHORT_REPORT);
    expect(html).toContain("without losing anybody to a creeper");
    expect(html).not.toContain(messages.sessionFeed.readMore);
    expect(html).not.toContain("mask-image");
  });

  /**
   * The exception the feed asks for on its newest past entry. Same long
   * report, no clamp: the whole body, no fade, and nothing to click — because
   * there is nothing hidden to click *for*.
   */
  it("renders an unclamped report whole, with no control and no fade", () => {
    const html = serverHtml(LONG_REPORT, false);
    expect(html).toContain("do go and walk around it during the week");
    expect(html).not.toContain(messages.sessionFeed.readMore);
    expect(html).not.toContain("mask-image");
  });

  /**
   * The identity that makes all of the above safe: what the server painted is
   * exactly what the client's first render decides for itself. Both ends call
   * the same pure function on the same string, and this asserts the HTML agrees
   * with it rather than assuming it does.
   */
  it("paints exactly what the shared decision says, for every fixture", () => {
    for (const report of [LONG_REPORT, LONG_LIST_REPORT, SHORT_REPORT, ""]) {
      const offered = reportOverflows(report);
      const html = serverHtml(report);
      expect(html.includes(messages.sessionFeed.readMore), report).toBe(
        offered,
      );
      expect(html.includes("mask-image"), report).toBe(offered);
      // And byte-identical between two renders of the same input, which is
      // what "the browser computes the same thing" reduces to.
      expect(serverHtml(report)).toBe(html);
    }
  });
});
