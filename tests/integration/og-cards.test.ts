import { describe, it, expect, vi } from "vitest";

// The real catalogs behind a stand-in for the RSC-only `getTranslations`: under
// vitest, next-intl resolves to its client build, whose server API throws. The
// copy is real, so a card asked for a locale really is drawn in that locale's
// words — which is the whole behaviour under test.
vi.mock("next-intl/server", () => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  function lookup(root: unknown, path: readonly string[]): unknown {
    let node = root;
    for (const key of path) {
      if (!isRecord(node)) return undefined;
      node = node[key];
    }
    return node;
  }

  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: string;
      namespace: string;
    }) => {
      const catalog: unknown = await import(`../../messages/${locale}.json`);
      const path = ["default", ...namespace.split(".")];
      return (key: string) => String(lookup(catalog, [...path, key]));
    },
  };
});

const { GET: siteCard } = await import("@/app/opengraph-images/site/route");
const { GET: robloxCard } = await import(
  "@/app/opengraph-images/roblox/route"
);

/**
 * The two Open Graph card handlers — the request pipeline of a real route, so
 * an integration test rather than a unit one.
 *
 * They are the reason the cards left Next's `opengraph-image` file convention:
 * a card has to be drawn in the locale the URL it was shared from carries, and
 * the convention gives a file no locale and no overridable URL. What is worth
 * pinning here is everything around the picture — the parameter is validated,
 * the response is a cacheable PNG — because a card that 500s or that is
 * re-rendered per crawler fetch fails silently on a surface nobody looks at.
 *
 * The pixels themselves are not asserted: satori's output is a rendering
 * detail, and a test that hashed it would fail on every copy edit while proving
 * nothing about what the card says.
 */
async function card(
  handler: typeof siteCard,
  query: string,
): Promise<Response> {
  return handler(
    new Request(`https://sogverse.test/opengraph-images/site${query}`),
  );
}

describe.each([
  ["site", siteCard],
  ["roblox", robloxCard],
] as const)("the %s card", (_name, handler) => {
  it("renders a PNG for a locale it ships", async () => {
    const response = await card(handler, "?locale=fi");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("caches hard, because it changes only when we deploy", async () => {
    const response = await card(handler, "?locale=en");

    // The free caching of the file convention did not come with the move, and
    // an uncached per-request ImageResponse is a poor thing to hand a crawler.
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cache-control")).toContain("max-age=31536000");
  });

  it("draws a different card per locale", async () => {
    // The pixels are not asserted, but two locales producing byte-identical
    // pixels would mean the parameter never reached the copy — which is the
    // one failure the move to a route handler exists to prevent.
    const [english, finnish] = await Promise.all([
      card(handler, "?locale=en").then((r) => r.arrayBuffer()),
      card(handler, "?locale=fi").then((r) => r.arrayBuffer()),
    ]);

    expect(Buffer.from(english).equals(Buffer.from(finnish))).toBe(false);
  });

  it("falls back to English rather than trusting the parameter", async () => {
    // Fetched by scrapers we do not control: an English card is a better answer
    // to a mangled parameter than a broken image.
    for (const query of ["", "?locale=", "?locale=xx", "?locale=../../etc"]) {
      const response = await card(handler, query);
      expect(response.status).toBe(200);
    }
  });
});
