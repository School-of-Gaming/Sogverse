import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOrigin } from "@/lib/url";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(host: string | null): Request {
  const headers: Record<string, string> = {};
  if (host !== null) headers.host = host;
  return new Request("https://example.test/", { headers });
}

describe("getOrigin", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("trusts the Host when it matches the canonical NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(getOrigin(makeRequest("sogverse.sog.gg"))).toBe(
      "https://sogverse.sog.gg",
    );
  });

  it("trusts the Host when it matches VERCEL_URL (per-PR preview)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse-staging.sog.gg";
    process.env.VERCEL_URL = "sogverse-git-feat-xyz.vercel.app";

    expect(getOrigin(makeRequest("sogverse-git-feat-xyz.vercel.app"))).toBe(
      "https://sogverse-git-feat-xyz.vercel.app",
    );
  });

  it("trusts the Host when it matches VERCEL_BRANCH_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    process.env.VERCEL_BRANCH_URL = "sogverse-git-main.vercel.app";

    expect(getOrigin(makeRequest("sogverse-git-main.vercel.app"))).toBe(
      "https://sogverse-git-main.vercel.app",
    );
  });

  it("trusts the staging custom domain via NEXT_PUBLIC_SITE_URL on preview env", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse-staging.sog.gg";
    expect(getOrigin(makeRequest("sogverse-staging.sog.gg"))).toBe(
      "https://sogverse-staging.sog.gg",
    );
  });

  it("trusts localhost in non-production builds", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    expect(getOrigin(makeRequest("localhost:3000"))).toBe(
      "http://localhost:3000",
    );

    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when an attacker spoofs the Host header", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(getOrigin(makeRequest("evil.com"))).toBe("https://sogverse.sog.gg");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when the Host is missing", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(getOrigin(makeRequest(null))).toBe("https://sogverse.sog.gg");
  });

  it("does NOT redirect to a Vercel host that isn't ours", () => {
    // VERCEL_URL is unset; an attacker can't spoof their way in just because
    // they crafted a `.vercel.app` Host.
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(
      getOrigin(makeRequest("attacker-app.vercel.app")),
    ).toBe("https://sogverse.sog.gg");
  });

  it("throws when neither a trusted Host nor NEXT_PUBLIC_SITE_URL is configured", () => {
    expect(() => getOrigin(makeRequest("evil.com"))).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });

  /**
   * A server component has `headers()` and no Request, so bare `Headers` is
   * accepted too. Both directions are pinned because only the Host is ever read,
   * and the two forms must therefore be interchangeable — including in the
   * refusal, which is the half that would be silently lost if a `Headers`
   * argument fell through to some other branch.
   */
  it("reads a bare Headers exactly as it reads a Request's", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(getOrigin(new Headers({ host: "sogverse.sog.gg" }))).toBe(
      "https://sogverse.sog.gg",
    );
  });

  it("refuses an untrusted Host on bare Headers too", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    expect(getOrigin(new Headers({ host: "evil.com" }))).toBe(
      "https://sogverse.sog.gg",
    );
  });

  /**
   * Next's `headers()` hands back a read-only adapter that keeps its backing
   * store under a `headers` field. Discriminating on that property's presence
   * mistook it for a Request and read `.get` off the inner store — a runtime
   * TypeError on the verify-email page, the first server component to call
   * this. The discriminator now asks whether the value can `get`.
   */
  it("reads a Headers adapter that carries its own `headers` field", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.sog.gg";
    class AdapterLike extends Headers {
      readonly headers = { host: "sogverse.sog.gg" };
    }
    expect(getOrigin(new AdapterLike({ host: "sogverse.sog.gg" }))).toBe(
      "https://sogverse.sog.gg",
    );
  });
});
