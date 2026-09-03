import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteCookie, setCookie } from "@/lib/cookies";

/**
 * ============================================================================
 * The cookie helpers: what gets written, attribute for attribute.
 * ============================================================================
 *
 * These are tested by capturing the strings handed to `document.cookie` rather
 * than by reading the jar back, and that is the only way the interesting case
 * *can* be tested: a jsdom document on `localhost` will refuse a
 * `domain=.sog.gg` write, so a jar-based assertion would prove nothing about
 * the write we actually care about.
 *
 * The case that matters is the delete walk. Meta's `_fbp` / `_fbc` and TikTok's
 * `_ttp` are set on the **registrable domain**, while our pages are served from
 * a subdomain — so an expiry at the document's own host matches none of them,
 * and a withdrawal that looks like it worked leaves every pixel cookie in
 * place. This pins that the walk goes all the way up.
 */

/** Every string written to `document.cookie` since the last reset. */
let writes: string[];

function stubHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    // jsdom keeps Location's accessors on the prototype, so the two fields the
    // helpers read are stated outright rather than spread off the real one.
    value: { protocol: "http:", hostname },
  });
}

beforeEach(() => {
  writes = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value: string) => {
      writes.push(value);
    },
  });
  stubHostname("localhost");
});

afterEach(() => {
  // Hand the accessor back to jsdom so nothing leaks into the next file.
  Reflect.deleteProperty(document, "cookie");
});

describe("setCookie", () => {
  it("writes at the root path with a year's life and no Secure over http", () => {
    setCookie("locale", "fi");

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("locale=fi");
    expect(writes[0]).toContain("path=/");
    expect(writes[0]).toContain(`max-age=${365 * 24 * 60 * 60}`);
    expect(writes[0]).toContain("SameSite=Lax");
    // Not a hedge: a Secure cookie is silently dropped on http://localhost,
    // which is every dev session and every test, so an unconditional flag
    // would make these preferences look as if they never persisted.
    expect(writes[0]).not.toContain("Secure");
  });

  it("adds Secure when the document is served over https", () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { protocol: "https:", hostname: "app.sog.gg" },
    });

    setCookie("locale", "fi");

    expect(writes[0]).toContain("Secure");
  });

  it("takes a caller's own retention", () => {
    setCookie("sog_consent", "{}", { maxAge: 180 * 24 * 60 * 60 });

    expect(writes[0]).toContain(`max-age=${180 * 24 * 60 * 60}`);
  });

  it("url-encodes the value", () => {
    setCookie("sog_consent", '{"v":1}');

    expect(writes[0]).toContain(encodeURIComponent('{"v":1}'));
  });
});

describe("deleteCookie", () => {
  it("expires with no domain, then at every domain up to the registrable one", () => {
    stubHostname("app.sog.gg");

    deleteCookie("_fbp");

    expect(writes).toHaveLength(3);
    expect(writes[0]).not.toContain("domain=");
    expect(writes[1]).toContain("domain=.app.sog.gg");
    // The one that actually clears Meta's cookie: both pixels set theirs on the
    // registrable domain, not on the subdomain our pages are served from.
    expect(writes[2]).toContain("domain=.sog.gg");
    for (const write of writes) {
      expect(write).toContain("_fbp=;");
      expect(write).toContain("path=/");
      expect(write).toContain("max-age=0");
    }
  });

  it("stops at two labels rather than reaching a bare TLD", () => {
    stubHostname("a.b.c.example.com");

    deleteCookie("_ttp");

    const domains = writes.slice(1);
    expect(domains).toHaveLength(4);
    expect(domains[domains.length - 1]).toContain("domain=.example.com");
    expect(writes.join(" ")).not.toContain("domain=.com");
  });

  it("writes only the domainless expiry on a single-label host", () => {
    stubHostname("localhost");

    deleteCookie("_ttp");

    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain("domain=");
  });
});
