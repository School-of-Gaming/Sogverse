import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach, vi } from "vitest";
import { wrapInLayout, BRAND_MARK } from "@/lib/email-templates/layout";
import { pinnedFill } from "@/lib/email-templates/utils";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { BRAND_LOCKUP, BRAND_LOCKUP_TAIL, SENDER_NAME } from "@/lib/constants";
import {
  MAIL_FONT_STACK,
  MAIL_WORD_ENGINE_FONT_STACK,
} from "@/lib/constants/typography";

/**
 * The shell every mail is wrapped in, and specifically the one image any mail
 * this codebase sends carries.
 *
 * **The property under test is what arrives when the image does not.** An
 * emailed image is blocked by default in a large share of inboxes, and the
 * failure mode that makes a company's mail look cheap is a header that was
 * *replaced* by a picture — a red X, a grey box, a hole where the sender's name
 * should be. So the assertions come in pairs: the mark is there, and the text
 * header is untouched beside it; the box is held open, and it is held open by
 * attributes a client honours before it has fetched anything.
 */

const PROD_ORIGIN = "https://sogverse.sog.gg";
const STAGING_ORIGIN = "https://sogverse-staging.sog.gg";

function render(): string {
  return wrapInLayout({ title: "Title", content: "<p>Body</p>" });
}

/** The `<img …>` opening tag, or null when the shell emitted no image at all. */
function markTag(html: string): string | null {
  return /<img\b[^>]*>/.exec(html)?.[0] ?? null;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the brand mark supplements the header", () => {
  it("puts the mark above a lockup it leaves entirely intact", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    const html = render();
    const tag = markTag(html);
    expect(tag).not.toBeNull();
    // Both names, in the order and with the separator the lockup rule fixes —
    // the same assertion that would hold with no image in the mail at all.
    expect(html.replace(/<[^>]+>/g, "")).toContain(BRAND_LOCKUP);
    expect(html.indexOf(tag!)).toBeLessThan(html.indexOf(BRAND_LOCKUP.slice(-8)));
  });

  /**
   * The text header is byte-for-byte what it was before the mark existed. This
   * is the whole promise of the feature stated as an assertion: strip the image
   * out of the mail with the origin set, and you have the mail sent without one.
   */
  it("changes nothing else about the mail it is added to", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const withoutOrigin = render();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    const withMark = render();
    expect(markTag(withMark)).not.toBeNull();
    // Lift the mark's row back out and the two documents are the same one.
    const stripped = withMark.replace(
      /<tr>\s*<td align="center" style="padding-bottom:12px;">\s*<img\b[^>]*>\s*<\/td>\s*<\/tr>/,
      "",
    );
    expect(stripped.replace(/\s+/g, " ")).toBe(withoutOrigin.replace(/\s+/g, " "));
  });

  /**
   * Not a link. Every anchor in a mail comes from a helper (the house-style
   * sweep enforces it), and a logo wrapped in a hand-rolled `<a>` is the usual
   * way that rule gets broken — the mark is decoration on a header, not a place
   * the reader is being sent.
   */
  it("does not wrap the mark in a link", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    expect(render()).not.toMatch(/<a\b[^>]*>\s*<img/);
  });
});

describe("the header's text lockup", () => {
  /**
   * The header is the one place in this directory that does not emit
   * `BRAND_LOCKUP` whole: the two names are set in two colours, so it composes
   * itself from `SENDER_NAME` and `BRAND_LOCKUP_TAIL`. The directory's doc
   * promises a test that the two spans still read as the lockup exactly — this
   * is that test, and it is here because it is an invariant of this shell and
   * of nothing else. The spans have to be adjacent with nothing between them,
   * which is why the assertion is on their concatenation rather than on a
   * `toContain` a stray space would satisfy.
   */
  it("reads as BRAND_LOCKUP exactly, built from two coloured spans", () => {
    const spans =
      /<span class="brand-act"[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)<\/span>/.exec(render());
    expect(spans, "the lockup's two spans are no longer adjacent").not.toBeNull();
    // Every character of the lockup, the en dash above all, still comes from
    // the constants module — nothing about either name is typed in the markup.
    expect(spans![1] + spans![2]).toBe(BRAND_LOCKUP);
    // Brand first, and it is the brand half that carries the brand colour.
    expect(spans![1]).toBe(SENDER_NAME);
    expect(spans![2]).toBe(BRAND_LOCKUP_TAIL);
  });
});

/**
 * The shell's shape, and which half of it is the base.
 *
 * The mail is laid out for a phone and the card is what a wide viewport adds,
 * rather than the other way round. That direction is the whole reason the shell
 * is allowed to carry a media query at all: a client that ignores `<style>` —
 * Outlook on Windows, and the Gmail app signed in to a non-Google account — has
 * to be left with a correct layout, and a card in the base with a query that
 * removed it would fail exactly where it matters, on the phone most of these
 * are read on. So the assertions come in pairs here too: the base has no card,
 * and the query draws one.
 */
describe("the card is the wide viewport's addition, not the phone's loss", () => {
  /** The contents of the shell's one stylesheet. */
  function styleBlock(html: string): string {
    return /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  }

  /** The one media query in it, with everything inside. It is last in the block. */
  function wideQuery(html: string): string {
    const block = styleBlock(html);
    const at = block.indexOf("@media");
    expect(at, "the shell carries no media query").toBeGreaterThan(-1);
    return block.slice(at);
  }

  /**
   * The class names, read off the markup rather than typed here, so the test
   * asserts that the selector and the cell still name the same thing. The panel
   * cell is recognisable precisely because it carries *no* style attribute —
   * which is the property under test.
   */
  function panelClass(html: string): string {
    return /<td class="([\w-]+)">\s*<div style="color:/.exec(html)![1];
  }

  function gutterClass(html: string): string {
    return /<td class="([\w-]+)" align="center" style="padding:24px 16px;">/.exec(html)![1];
  }

  it("gives the content cell no fill, no border, no corner and no padding", () => {
    const html = render();
    expect(
      panelClass(html),
      "the content cell carries an inline style — the phone layout has no card",
    ).toBeTruthy();
    // The card colour exists in the document exactly once, inside the query.
    const body = html.slice(html.indexOf("<body"));
    expect(body).not.toContain(DARK_THEME.card);
  });

  /**
   * 360px is the mobile design floor, and the arithmetic that made this change
   * worth doing: one 16px gutter a side leaves a 328px content column, where
   * the 20px gutter plus a 32px card padding used to leave 254px.
   */
  it("spends one 16px gutter a side, and nothing else, on a phone", () => {
    const html = render();
    expect(gutterClass(html)).toBeTruthy();
    expect(html).toContain('style="max-width:560px;width:100%;"');
  });

  it("draws the card back above the breakpoint, from the one media query", () => {
    const html = render();
    const query = wideQuery(html);

    // 560px of column plus a 20px gutter a side: the narrowest viewport that
    // fits the card at its full width.
    expect(/@media only screen and \(min-width: (\d+)px\)/.exec(query)![1]).toBe("600");

    expect(query).toContain(`.${panelClass(html)}`);
    expect(query).toContain(`.${gutterClass(html)}`);
    for (const declaration of [
      // Pinned like every other background here, and !important on both halves
      // because the rule is overriding cells that state their own styles.
      `background-color:${DARK_THEME.card} !important`,
      `background-image:linear-gradient(${DARK_THEME.card},${DARK_THEME.card}) !important`,
      `border: 1px solid ${DARK_THEME.border} !important`,
      `border-radius: ${RADIUS.lg} !important`,
      "padding: 32px !important",
      "padding: 40px 20px !important",
    ]) {
      expect(query, `the wide layout lost: ${declaration}`).toContain(declaration);
    }
  });

  /**
   * The rule the shell's stylesheet is exempted under, stated as a test: strip
   * the block and what is left has to be a correct mail, not a mail waiting for
   * a stylesheet. Everything the reader needs is inline — the ground, the mark,
   * the lockup and its brand colour, the world rule, the gutter, the column,
   * the content and the footer — and nothing that mattered went with the block.
   */
  it("is a whole phone layout with the <style> block stripped out", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    const stripped = render().replace(/<style>[\s\S]*?<\/style>/, "");

    expect(stripped).not.toContain("@media");
    // The header, both halves: the mark, and the lockup it never replaces.
    expect(markTag(stripped)).not.toBeNull();
    expect(stripped.replace(/<[^>]+>/g, "")).toContain(BRAND_LOCKUP);
    // The brand colour reaches the lockup inline, so the pin's absence costs
    // the mail nothing outside Gmail's own renderer.
    expect(stripped).toContain(`color:${BRAND.act};letter-spacing:0.5px;`);
    // The ground, on the body and on the outer table — counted by splitting
    // rather than by a built regex, because the fill's own text is full of
    // parentheses.
    expect(stripped.split(pinnedFill(DARK_THEME.bg)).length - 1).toBe(2);
    // The world rule under the lockup.
    expect(stripped).toContain(pinnedFill(BRAND.world));
    // The phone's gutter and the column it holds.
    expect(stripped).toContain('style="padding:24px 16px;"');
    expect(stripped).toContain('style="max-width:560px;width:100%;"');
    // The content, in the body ink, and the footer under it.
    expect(stripped).toContain("<p>Body</p>");
    expect(stripped).toContain(`color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;`);
    expect(stripped).toContain(`color:${DARK_THEME.mutedFg}`);
  });
});

describe("the blocked-image render is the one being designed for", () => {
  it("holds the box open with attributes, not only with CSS", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    const tag = markTag(render())!;
    // Attributes, for the clients that never apply the style; the style, for the
    // ones that scale it. A client honouring either one reserves the same box,
    // so nothing below the header moves when the fetch succeeds or fails.
    expect(tag).toContain(`width="${BRAND_MARK.width}"`);
    expect(tag).toContain(`height="${BRAND_MARK.height}"`);
    expect(tag).toContain(`width:${BRAND_MARK.width}px`);
    expect(tag).toContain(`height:${BRAND_MARK.height}px`);
  });

  /**
   * The alt is empty on purpose: the text lockup directly beneath the image is
   * the accessible brand name, so the mark is decorative — a blocked render
   * shows exactly the pre-mark header with no stray repeated word, and a
   * screen reader hears the name once, from the lockup.
   */
  it("carries an empty alt, so the blocked render is the pre-mark header", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    expect(markTag(render())).toContain('alt=""');
  });

  /**
   * `border:0` / `text-decoration:none` remove the frame and underline that
   * clients draw around an image that failed to load.
   */
  it("strips the broken-image chrome", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    const tag = markTag(render())!;
    expect(tag).toContain("border:0");
    expect(tag).toContain("text-decoration:none");
    // Kills the inline baseline gap under the image, which would otherwise read
    // as a seam between the mark and the lockup.
    expect(tag).toContain("display:block");
  });
});

describe("the mark's origin", () => {
  it("is the canonical per-environment site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_ORIGIN);
    expect(markTag(render())).toContain(`src="${PROD_ORIGIN}${BRAND_MARK.path}"`);

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${STAGING_ORIGIN}/`);
    // Trailing slash and all: staging mail points at staging, and the join is
    // done by the URL parser rather than by string concatenation.
    expect(markTag(render())).toContain(`src="${STAGING_ORIGIN}${BRAND_MARK.path}"`);
  });

  /**
   * No origin, no image — never a relative or half-built `src`. This is the same
   * degradation as a blocked image, one level up: the reader gets the text
   * header the mail has always carried instead of a box pointing at nothing.
   */
  it("emits no image at all rather than a src it cannot complete", () => {
    for (const value of ["", "not-a-url"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      const html = render();
      expect(markTag(html), `origin ${JSON.stringify(value)} produced an image`).toBeNull();
      expect(html).toContain(BRAND_LOCKUP.slice(-8));
    }
  });

  /**
   * A loopback origin is unreachable by construction for every recipient, and a
   * *failed* fetch is worse than a blocked one: Gmail's proxy draws its
   * broken-image glyph inside the reserved box (observed in a real inbox, from
   * a dev-machine send via the admin testing tool). So localhost takes the
   * no-origin branch and a dev-sent mail degrades to the clean text header.
   */
  it("treats a loopback origin as no origin", () => {
    for (const value of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      const html = render();
      expect(markTag(html), `origin ${JSON.stringify(value)} produced an image`).toBeNull();
      expect(html).toContain(BRAND_LOCKUP.slice(-8));
    }
  });
});

/**
 * The asset and the markup are one decision, and this is where they are held
 * together. The file is served straight from `public/`, so nothing in the build
 * would notice it going missing, being regenerated at the wrong size, or losing
 * the transparency the header's gradient shows through.
 */
describe("the asset behind the markup", () => {
  // Resolved from this file rather than from `process.cwd()`, and deliberately
  // *not* through `new URL(…, import.meta.url)`: Vite rewrites that form into an
  // asset-module lookup, and a file under `public/` is not a module — the
  // rewritten expression resolves to `undefined` and the read fails on a path
  // that has nothing to do with the one written here.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this file's own directory joined to BRAND_MARK.path, a module constant; reading the file the markup points at is the point of the check
  const png = readFileSync(join(repoRoot, "public", ...BRAND_MARK.path.split("/")));

  /** Width and height out of a PNG's IHDR chunk, which is always the first one. */
  function pngSize(bytes: Buffer): { width: number; height: number } {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  it("is a PNG — not the SVG, which no mail client renders", () => {
    expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });

  it("is exactly twice the size it is displayed at, so retina gets a sharp mark", () => {
    expect(pngSize(png)).toEqual({
      width: BRAND_MARK.width * 2,
      height: BRAND_MARK.height * 2,
    });
  });

  /**
   * Colour type 6 is RGBA. The badge is drawn on nothing, so the header's hero
   * gradient shows through around it instead of a rectangle cut out of it — a
   * flattened re-export would put a dark box in the middle of the glow.
   */
  it("keeps its alpha channel", () => {
    expect(png.readUInt8(25)).toBe(6);
  });

  /** Small enough that no client refuses it and no reader waits for it. */
  it("stays small", () => {
    expect(png.byteLength).toBeLessThan(20_000);
  });
});

/**
 * The face reaches desktop Outlook, which reads no stack.
 *
 * Outlook on Windows renders through Word, which takes the first family in a
 * `font-family` and answers one it cannot resolve with Times New Roman rather
 * than with the next entry — and the primary stack opens with two names that
 * exist only on Apple platforms, so every mail would arrive serif on that
 * client. The shell answers it with an `mso`-conditional block, and both halves
 * of that are asserted: the block carries the derived Windows-resolvable stack,
 * and the body still inherits the primary one, because the conditional block is
 * an addition for one engine and never a replacement for the declaration every
 * other client reads.
 */
describe("the mail face reaches the Word engine", () => {
  const head = (html: string): string => html.slice(0, html.indexOf("</head>"));

  it("declares the Windows-resolvable stack to desktop Outlook alone", () => {
    const block = /<!--\[if mso\]>([\s\S]*?)<!\[endif\]-->/.exec(head(render()));
    expect(block, "the shell's head carries no mso-conditional block").not.toBeNull();
    expect(block![1]).toContain("<style>");
    expect(block![1]).toContain(
      `font-family:${MAIL_WORD_ENGINE_FONT_STACK} !important`,
    );
    // The body is where a mail's text starts, and the templates set text in the
    // rest of these — a rule reaching only `body` is a rule Word ignores on
    // every cell and paragraph beneath it. The selector list is read as its own
    // elements rather than searched as a string, so `a` cannot be satisfied by
    // the `a` inside `table`.
    const selectors = /<style>([^{]*)\{/
      .exec(block![1])![1]
      .split(",")
      .map((selector) => selector.trim());
    for (const element of ["body", "td", "p", "a"]) {
      expect(selectors, `the mso block does not reach <${element}>`).toContain(
        element,
      );
    }
  });

  it("still sets the primary stack on the body, for every other client", () => {
    const body = /<body[^>]*>/.exec(render());
    expect(body![0]).toContain(`font-family:${MAIL_FONT_STACK}`);
  });
});
