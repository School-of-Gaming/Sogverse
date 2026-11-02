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

  // The Reddit Pixel, both halves of it. Its transport is alb.reddit.com — an
  // image beacon and a fetch — and missing it stops Reddit's measurement as
  // silently as Meta's. Its two other hosts are absent on purpose:
  // pixel-config.reddit.com serves the Events Manager configuration that can
  // add URL- and click-triggered event rules, auto-match form fields and
  // scrape page metadata, and ads.reddit.com is where its event setup tool
  // loads from. Refusing those fetches is the only switch the app has over a
  // web form nobody here reviews, so adding either is a decision, not a fix.
  test("names the Reddit Pixel's transport and refuses its remote configuration", async ({
    request,
  }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    const imgSrc = /(?:^|; )img-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const connectSrc = /(?:^|; )connect-src ([^;]*)/.exec(csp)?.[1] ?? "";

    expect(imgSrc).toContain("https://alb.reddit.com");
    expect(connectSrc).toContain("https://alb.reddit.com");
    expect(csp).not.toContain("pixel-config.reddit.com");
    expect(csp).not.toContain("ads.reddit.com");
    // Nor a wildcard that would admit them by the back door.
    expect(csp).not.toContain("*.reddit.com");
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
  // per-country `google.<TLD>` hosts (the analytics tag's ga-audiences ping)
  // and pagead2.googlesyndication.com, which carry an advertising audience sync
  // rather than an analytics event or a conversion.
  test("names every host the container's tags reach", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    const imgSrc = /(?:^|; )img-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const connectSrc = /(?:^|; )connect-src ([^;]*)/.exec(csp)?.[1] ?? "";
    const frameSrc = /(?:^|; )frame-src ([^;]*)/.exec(csp)?.[1] ?? "";

    // The collectors: the container's own image transport, the two analytics
    // collector domains (European traffic is collected on a regional
    // subdomain of analytics.google.com), the three an Ads conversion pings,
    // and the two an analytics property with advertising features beacons its
    // remarketing ping to.
    const collectors = [
      "https://www.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
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

  // A nonce repeated across requests is one an attacker can read off one page
  // and reuse in a script injected into the next, so the policy is only as good
  // as this difference.
  test("each request should receive a unique CSP nonce", async ({ request }) => {
    const nonceOf = async () => {
      const response = await request.get("/");
      const csp = response.headers()["content-security-policy"] ?? "";
      return /'nonce-([^']+)'/.exec(csp)?.[1];
    };

    const first = await nonceOf();
    const second = await nonceOf();

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
  // The public folder's video: served from the build's own origin, cacheable
  // for a year because a changed file always ships under a new versioned name,
  // and never handled by the proxy — which would both locale-redirect it and,
  // for a signed-in requester near token expiry, put a session cookie on a
  // response a shared cache is allowed to keep. No proxy means no CSP header,
  // which is how the response shows the proxy never ran.
  test("serves /media/ immutable and outside the proxy", async ({ request }) => {
    const response = await request.get("/media/hero-calm-wide-v1.mp4", { maxRedirects: 0 });
    const headers = response.headers();

    expect(response.status()).toBe(200);
    expect(headers["content-type"]).toBe("video/mp4");
    expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["content-security-policy"]).toBeUndefined();
  });
});
