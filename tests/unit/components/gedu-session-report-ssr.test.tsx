import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionReport } from "@/components/gedu/session-feed/SessionReport";

/**
 * **A report has to be complete in the frame the server paints.**
 *
 * Everything else about the clamp is measured in the browser, and measuring is
 * fine — a layout effect resolves before the client's first paint. What is not
 * fine is that the *server's* HTML is on screen long before any of that runs: a
 * report whose body, fade or "Read more" only exist after hydration is a report
 * that visibly assembles itself under the reader, shoving the rest of the feed
 * down as each piece lands. That is the layout rule's exact prohibition.
 *
 * Two ways that regresses, and this pins both:
 *
 * 1. **The renderer gets lazy-loaded.** Only the rich *editor* may be —
 *    ProseMirror is heavy and the common visit never opens one. The markdown
 *    renderer is small and every visit reads reports, so it stays in the page
 *    bundle. Wrapping it in a client-only dynamic import would empty the body
 *    out of this HTML.
 * 2. **The control goes back to waiting for a measurement.** A server cannot
 *    measure, so the offer is seeded from the source text and corrected after
 *    mount. Reverting that seeding puts the button a hydration late again.
 *
 * Server-rendering it here rather than asserting on jsdom is the point: jsdom
 * reports every height as zero, so a browser-shaped test would pass on markup
 * that never reaches a browser correctly.
 */

function serverHtml(markdown: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionReport markdown={markdown} />
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
    const html = serverHtml(LONG_REPORT);
    expect(html).toContain(messages.gedu.sessionFeed.readMore);
    expect(html).toContain('aria-expanded="false"');
    // The clamp says it is a clamp from the first frame too, or the reader sees
    // prose ending flush against an invisible edge and stops looking.
    expect(html).toContain("mask-image");
  });

  it("offers nothing on a report that fits", () => {
    const html = serverHtml(SHORT_REPORT);
    expect(html).toContain("without losing anybody to a creeper");
    expect(html).not.toContain(messages.gedu.sessionFeed.readMore);
    expect(html).not.toContain("mask-image");
  });
});
