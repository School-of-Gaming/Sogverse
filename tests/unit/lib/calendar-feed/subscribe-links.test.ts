import { describe, it, expect } from "vitest";
import {
  buildSubscribeLinks,
  toWebcalUrl,
} from "@/lib/calendar-feed/subscribe-links";

/**
 * The three vendor gestures, pinned.
 *
 * Every assertion here stands for a way the links silently stop working: a
 * scheme swap that eats the query string, a Google link carrying the https form
 * it rejects, and an unencoded nested URL whose first `&` is read as the host's
 * own next parameter.
 */

const FEED =
  "https://app.example.test/api/calendar/feed/tok.ics?mode=rrule&alarm=15";

describe("toWebcalUrl", () => {
  it("swaps the scheme and keeps the whole query string", () => {
    expect(toWebcalUrl(FEED)).toBe(
      "webcal://app.example.test/api/calendar/feed/tok.ics?mode=rrule&alarm=15",
    );
  });

  it("swaps a plain http scheme too", () => {
    expect(toWebcalUrl("http://localhost:3000/feed")).toBe(
      "webcal://localhost:3000/feed",
    );
  });

  it("touches nothing but the leading scheme", () => {
    expect(toWebcalUrl("https://x.test/a?next=https://y.test")).toBe(
      "webcal://x.test/a?next=https://y.test",
    );
  });
});

describe("buildSubscribeLinks", () => {
  const links = buildSubscribeLinks(FEED, "School of Gaming");
  const webcal = toWebcalUrl(FEED);

  it("hands Apple the webcal address itself", () => {
    expect(links.webcal).toBe(webcal);
  });

  it("puts the encoded webcal form inside Google's cid", () => {
    expect(links.google).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    );
    // Google rejects an https value outright, so the nested URL must be the
    // subscription scheme rather than the address the feed is served from.
    expect(links.google).not.toContain("cid=https");
    // Encoded, so our own `&alarm=15` cannot be read as Google's parameter.
    expect(links.google).not.toContain("&alarm=");
  });

  it("carries an encoded url and name for Outlook", () => {
    const parsed = new URL(links.outlook);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://outlook.live.com/calendar/0/addfromweb",
    );
    expect(parsed.searchParams.get("url")).toBe(webcal);
    expect(parsed.searchParams.get("name")).toBe("School of Gaming");
  });

  it("survives a calendar name carrying spaces and an ampersand", () => {
    const named = buildSubscribeLinks(FEED, "Aino & Eino — sessions");
    const parsed = new URL(named.outlook);
    expect(parsed.searchParams.get("name")).toBe("Aino & Eino — sessions");
    // The feed URL is still whole beside it rather than truncated at the name's
    // own ampersand.
    expect(parsed.searchParams.get("url")).toBe(webcal);
  });
});
