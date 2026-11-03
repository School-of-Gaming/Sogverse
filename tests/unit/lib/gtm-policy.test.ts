import { describe, expect, it } from "vitest";
import { containerPolicy } from "@/lib/gtm-policy";

/**
 * ============================================================================
 * The template policy: what a tag in the container may do.
 * ============================================================================
 *
 * The loader admits every template, because Meta's and Reddit's tags are only
 * shipped as templates and Google has no per-template id. So this function is
 * the fence on what a template — a gallery one or one written in the Tag
 * Manager UI — may load, where it may send, and which globals it may touch.
 *
 * The URLs below are the ones the two vendors' published templates use, read
 * from their source: Meta's injects `fbevents.js` and, behind a gate on Meta's
 * side, a parameter-builder bundle from two public CDNs; Reddit's injects
 * `pixel.js?pixel_id=…`. A refusal makes the template's call throw.
 */

const CONTAINER = "GTM-5WS8TXL4";

function allows(permission: string, data: unknown): boolean {
  return containerPolicy(CONTAINER, permission, data);
}

describe("inject_script", () => {
  it("admits Meta's library, as its template asks for it", () => {
    expect(
      allows("inject_script", {
        url: "https://connect.facebook.net/en_US/fbevents.js",
      }),
    ).toBe(true);
    expect(
      allows("inject_script", {
        url: "https://connect.facebook.net/fi_FI/fbevents.js",
      }),
    ).toBe(true);
  });

  it("admits Reddit's generic library", () => {
    expect(
      allows("inject_script", {
        url: "https://www.redditstatic.com/ads/pixel.js",
      }),
    ).toBe(true);
  });

  // The copy Reddit's template asks for carries the Events Manager
  // configuration inline, past the CSP fence on the configuration host. The
  // app's own stub loads the generic copy instead, so refusing this one costs
  // no event.
  it("refuses Reddit's library when it is asked for by pixel id", () => {
    expect(
      allows("inject_script", {
        url: "https://www.redditstatic.com/ads/pixel.js?pixel_id=a2_abc123",
      }),
    ).toBe(false);
  });

  it("refuses Meta's parameter builder from either public CDN", () => {
    for (const url of [
      "https://cdn.jsdelivr.net/npm/meta-capi-param-builder-clientjs/dist/clientParamBuilder.bundle.js",
      "https://unpkg.com/meta-capi-param-builder-clientjs/dist/clientParamBuilder.bundle.js",
    ]) {
      expect(allows("inject_script", { url })).toBe(false);
    }
  });

  it("refuses any other file on Meta's or Reddit's script hosts", () => {
    for (const url of [
      "https://connect.facebook.net/signals/config/1234567890",
      "https://connect.facebook.net/en_US/sdk.js",
      "https://connect.facebook.net/en_US/fbevents.js?v=next",
      "https://www.redditstatic.com/ads/other.js",
      "https://www.redditstatic.com/ads/pixel.js#x",
    ]) {
      expect(allows("inject_script", { url })).toBe(false);
    }
  });

  it("admits Google's own script hosts", () => {
    for (const url of [
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123",
      "https://www.google-analytics.com/analytics.js",
      "https://www.googleadservices.com/pagead/conversion_async.js",
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/",
    ]) {
      expect(allows("inject_script", { url })).toBe(true);
    }
  });

  it("refuses every other host, and anything that is not an HTTPS URL", () => {
    for (const url of [
      "https://analytics.tiktok.com/i18n/pixel/events.js",
      "https://snap.licdn.com/li.lms-analytics/insight.min.js",
      "https://www.googletagmanager.com.evil.example/gtm.js",
      "https://google.evil.example/x.js",
      "http://www.googletagmanager.com/gtag/js",
      "/own-origin.js",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(allows("inject_script", { url })).toBe(false);
    }
  });

  it("refuses a call with no URL at all", () => {
    expect(allows("inject_script", {})).toBe(false);
    expect(allows("inject_script", null)).toBe(false);
    expect(allows("inject_script", { url: 42 })).toBe(false);
  });
});

describe("send_pixel and inject_hidden_iframe", () => {
  it("admit Google's hosts, its country domains included", () => {
    for (const permission of ["send_pixel", "inject_hidden_iframe"]) {
      for (const url of [
        "https://www.google.com/pagead/1p-conversion/1/",
        "https://www.google.fi/ads/ga-audiences",
        "https://www.google.co.uk/pagead/1p-user-list/1/",
        "https://td.doubleclick.net/td/rul/1",
        "https://region1.analytics.google.com/g/collect",
        "https://www.googletagmanager.com/static/service_worker/1/sw_iframe.html",
      ]) {
        expect(allows(permission, { url })).toBe(true);
      }
    }
  });

  it("admit the two vendors' own transports", () => {
    expect(allows("send_pixel", { url: "https://www.facebook.com/tr/?id=1" })).toBe(
      true,
    );
    expect(allows("send_pixel", { url: "https://alb.reddit.com/rp.gif" })).toBe(
      true,
    );
  });

  // Reddit's configuration host is the one the CSP refuses; a beacon to it is
  // not the configuration fetch, but nothing a template needs goes there.
  it("refuse every other host, a vendor's other hosts included", () => {
    for (const permission of ["send_pixel", "inject_hidden_iframe"]) {
      for (const url of [
        "https://pixel-config.reddit.com/pixels/a2_x/config",
        "https://ads.reddit.com/x",
        "https://evil.example/collect",
        "https://facebook.com.evil.example/tr",
        "https://www.google.evil.example/x",
        "/relative",
      ]) {
        expect(allows(permission, { url })).toBe(false);
      }
    }
  });
});

describe("access_globals", () => {
  // The keys Meta's and Reddit's templates declare, read from their permission
  // tables, plus Google's own queue and its front door.
  it("admits the vendors' globals and Google's queue, for every operation", () => {
    for (const key of [
      "fbq",
      "fbq.callMethod.apply",
      "fbq.queue.push",
      "fbq.disablePushState",
      "_fbq",
      "_fbq_gtm_ids",
      "_fbq_param_builder_status",
      "rdt",
      "rdt.sendEvent.apply",
      "rdt.callQueue",
      "rdt.pixelId",
      "dataLayer",
      "gtag",
    ]) {
      for (const operation of ["read", "write", "execute"]) {
        expect(
          allows("access_globals", {
            key,
            read: operation === "read",
            write: operation === "write",
            execute: operation === "execute",
          }),
        ).toBe(true);
      }
    }
  });

  // Calling `eval` or writing markup into the page is arbitrary JavaScript by
  // another name — exactly what the blocklist keeps out as Custom HTML.
  it("refuses every other global", () => {
    for (const key of [
      "eval",
      "Function",
      "fetch",
      "navigator.sendBeacon",
      "document.body.innerHTML",
      "location",
      "localStorage.setItem",
      "fbqx",
      "rdtx",
    ]) {
      expect(
        allows("access_globals", {
          key,
          read: false,
          write: false,
          execute: true,
        }),
      ).toBe(false);
    }
  });

  it("refuses a call with no key", () => {
    expect(allows("access_globals", { read: true })).toBe(false);
  });

  // Seen in a published container's permission table: the item a Google tag
  // carries when its GA4 property is linked to Google Ads.
  it("admits the one global Google's GA4-to-Ads link item calls", () => {
    expect(
      allows("access_globals", {
        key: "__gsaExp.id",
        read: false,
        write: false,
        execute: true,
      }),
    ).toBe(true);
  });
});

describe("get_cookies", () => {
  // The container hands the policy `{ name }`, the cookie being read.
  it("admits the vendors' ids and Google's analytics and click cookies", () => {
    for (const name of [
      "_fbp",
      "_fbc",
      "_rdt_uuid",
      "_ga",
      "_ga_ABC123XYZ",
      "_gcl_aw",
      "_gcl_au",
      "_gac_UA-1234-1",
    ]) {
      expect(allows("get_cookies", { name })).toBe(true);
    }
  });

  // The Supabase session cookies are readable by page script, and an admitted
  // beacon host is somewhere a template could send one.
  it("refuses every other cookie, the session first among them", () => {
    for (const name of [
      "sb-abcdefghijklmnop-auth-token",
      "sb-abcdefghijklmnop-auth-token.0",
      "sog_consent",
      "sog_attribution",
      "_gat",
      "_gaxyz",
      "_fbp_extra",
      "_rdt_cid",
      "",
    ]) {
      expect(allows("get_cookies", { name })).toBe(false);
    }
  });

  it("refuses a call with no name", () => {
    expect(allows("get_cookies", {})).toBe(false);
    expect(allows("get_cookies", null)).toBe(false);
  });
});

describe("everything else", () => {
  // Only the Custom JavaScript variable, the Custom HTML tag and the JavaScript
  // Variable hold these, and all three are blocklisted already.
  it("refuses the three unsafe permissions", () => {
    expect(allows("unsafe_run_arbitrary_javascript", {})).toBe(false);
    expect(allows("unsafe_inject_arbitrary_html", {})).toBe(false);
    expect(allows("unsafe_access_globals", { key: "fbq" })).toBe(false);
  });

  // Google's own tags exercise these, and a policy that refused them would stop
  // measurement where nothing here could see it.
  it("allows every permission it does not narrow", () => {
    for (const permission of [
      "read_event_data",
      "read_container_data",
      "configure_google_tags",
      "load_google_tags",
      "read_data_layer",
      "logging",
      "get_url",
      "set_cookies",
    ]) {
      expect(allows(permission, {})).toBe(true);
    }
  });

  // The container probes a newly registered `'all'` policy with this, to learn
  // whether it refuses everything.
  it("allows the container's registration probe", () => {
    expect(allows("unknown", {})).toBe(true);
  });
});
