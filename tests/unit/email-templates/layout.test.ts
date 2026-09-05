import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach, vi } from "vitest";
import { wrapInLayout, BRAND_MARK } from "@/lib/email-templates/layout";
import { BRAND_LOCKUP, BRAND_LOCKUP_TAIL, SENDER_NAME } from "@/lib/constants";

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
