import { test, expect } from "@playwright/test";

// The build this suite serves is never production — `VERCEL_ENV` is unset off
// Vercel — so it is the shape of staging and every preview: reachable by a
// link, invisible to crawlers (`src/lib/seo/deployment.ts`). These hold that
// against real responses, because the header is only worth anything if it is
// on every response a crawler can reach, and only a served build shows which
// responses those are.

test.describe("Crawler posture off production", () => {
  // A page (through the proxy's locale redirect), a metadata route, a public
  // file outside the proxy, a static icon, and an API answer.
  for (const path of [
    "/",
    "/en",
    "/robots.txt",
    "/media/hero-calm-wide-v1.mp4",
    "/icon.svg",
    "/api/no-such-route",
  ]) {
    test(`${path} says noindex, nofollow`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    });
  }

  test("robots.txt admits only the search engines, and points at no sitemap", async ({
    request,
  }) => {
    const body = await (await request.get("/robots.txt")).text();

    expect(body).toMatch(/User-Agent: Googlebot\nUser-Agent: Bingbot\nAllow: \//);
    expect(body).toMatch(/User-Agent: \*\nDisallow: \/\n/);
    expect(body).toMatch(/User-Agent: GPTBot\nDisallow: \/\n/);
    expect(body).toMatch(/User-Agent: Google-Extended\nDisallow: \/\n/);
    expect(body).not.toMatch(/sitemap/i);
  });

  for (const path of ["/sitemap.xml", "/llms.txt"]) {
    test(`${path} is not served`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(404);
    });
  }
});
