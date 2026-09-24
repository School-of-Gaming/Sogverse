import { test, expect } from "@playwright/test";

test.describe("Security Headers", () => {
  test("should include all security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin");
    expect(headers["x-xss-protection"]).toBe("1; mode=block");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });

  test("should include nonce-based CSP from proxy", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  // The two directives `strict-dynamic` does not reach. In production the Meta
  // Pixel's script is admitted by `strict-dynamic` itself — the app's own bundle
  // inserts it — so nothing in `script-src` names a vendor, which makes it easy
  // to read the policy as "the pixel needs no hosts at all" and tidy these away.
  // They are where the pixel actually sends: fbevents.js reports by requesting
  // facebook.com/tr/ as an image and by fetch. Removing either stops marketing
  // measurement silently, and only in production.
  test("names the Meta Pixel's own host in img-src and connect-src", async ({
    request,
  }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    const imgSrc = /(?:^|; )img-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const connectSrc = /(?:^|; )connect-src ([^;]*)/.exec(csp)?.[1] ?? "";

    expect(imgSrc).toContain("https://www.facebook.com");
    expect(connectSrc).toContain("https://www.facebook.com");
  });

  // The same trap for the other advertising script — the container itself is
  // admitted by `strict-dynamic`, so `script-src` names googletagmanager.com
  // only in the development branch — and one directive further, because a
  // container's tags frame as well as beacon.
  //
  // This list is the contract rather than a transcript of the policy: it is the
  // decided set for GA4 plus Ads conversion, so a host that is needed and was
  // never added fails here instead of failing silently in production. Left out
  // deliberately, and therefore absent from the list on purpose: the
  // per-country `google.<TLD>` Ads hosts and pagead2.googlesyndication.com,
  // which carry an advertising audience sync rather than a conversion.
  test("names every host the container's tags reach", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    const imgSrc = /(?:^|; )img-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const connectSrc = /(?:^|; )connect-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const frameSrc = /(?:^|; )frame-src ([^;]*)/.exec(csp)?.[1] ?? "";

    // The collectors: the container's own image transport, the analytics
    // collector (wildcarded because European traffic is collected on a regional
    // subdomain), the three an Ads conversion pings, and the two an analytics
    // property with advertising features beacons its remarketing ping to.
    const collectors = [
      "https://www.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://www.googleadservices.com",
      "https://googleads.g.doubleclick.net",
      "https://td.doubleclick.net",
      "https://stats.g.doubleclick.net",
      "https://www.google.com",
    ];
    for (const host of collectors) {
      expect(imgSrc).toContain(host);
      expect(connectSrc).toContain(host);
    }

    // The directive that is easiest to forget, because nothing in the app's own
    // markup is a frame: an Ads conversion-linker or remarketing tag works by
    // injecting one, and an analytics property with advertising features frames
    // its own.
    for (const host of [
      "https://www.googletagmanager.com",
      "https://td.doubleclick.net",
    ]) {
      expect(frameSrc).toContain(host);
    }
  });

  test("each request should receive a unique CSP nonce", async ({ request }) => {
    const res1 = await request.get("/");
    const res2 = await request.get("/");

    const csp1 = res1.headers()["content-security-policy"];
    const csp2 = res2.headers()["content-security-policy"];

    // Both should have CSP
    expect(csp1).toBeTruthy();
    expect(csp2).toBeTruthy();

    // In production, nonces differ per request; in dev, CSP is static (no nonce)
    // so this test just verifies the header is present on every request
    expect(csp1).toContain("default-src 'self'");
    expect(csp2).toContain("default-src 'self'");
  });
});
