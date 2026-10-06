import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { Markdown } from "@/components/ui/markdown";
import { authoredLinkKind, type MarkdownUseCase } from "@/lib/authored-markdown";
import type { SupportedLocale } from "@/lib/constants/locales";

/**
 * **Where a link in authored markdown opens.** A link to our own site opens in
 * the same tab; a link to another site opens in a new one and says so, to the
 * eye and to a screen reader. One rule, in the shared renderer, for every use
 * case that keeps links — and a use case that keeps none still keeps none.
 */
const SITE = "https://sogverse.sog.gg";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function renderLink(
  href: string,
  variant: MarkdownUseCase = "article",
  locale: SupportedLocale = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Markdown variant={variant}>{`Read [the page](${href}).`}</Markdown>
    </NextIntlClientProvider>,
  ).container;
}

function anchor(container: HTMLElement): HTMLAnchorElement {
  const a = container.querySelector("a");
  if (a === null) throw new Error("no anchor was drawn");
  return a;
}

describe("a link in authored markdown", () => {
  it.each([
    ["a relative path", "/shop", "/en/shop"],
    ["a relative path with a locale and a fragment", "/fi/kauppa#clubs", "/en/shop#clubs"],
    ["an absolute address on our own site", `${SITE}/library`, "/en/library"],
  ])("opens %s in the same tab, unmarked", (_name, href, shown) => {
    const a = anchor(renderLink(href));
    expect(a.getAttribute("href")).toBe(shown);
    expect(a.getAttribute("target")).toBeNull();
    expect(a.getAttribute("rel")).toBe("noreferrer");
    expect(a.querySelector("svg")).toBeNull();
    expect(a.textContent).toBe("the page");
  });

  it.each([
    ["another site", "https://example.com/guide"],
    ["a subdomain of ours", "https://evil.sogverse.sog.gg/x"],
    ["our host on another port", "https://sogverse.sog.gg:8443/x"],
    ["a protocol-relative address", "//example.com/x"],
    ["plain http to another site", "http://example.com"],
  ])("opens %s in a new tab, and says so", (_name, href) => {
    const a = anchor(renderLink(href));
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names the new tab to a screen reader, and draws its icon for the eye alone", () => {
    renderLink("https://example.com/guide");
    // The accessible name is the label and the translated marker, and the
    // icon adds nothing to it. (jsdom's name computation drops the space the
    // marker's text opens with; a browser keeps it.)
    const link = screen.getByRole("link", {
      name: /^the page\s*\(opens in a new tab\)$/,
    });
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(link.querySelector(".sr-only")?.textContent).toBe(
      " (opens in a new tab)",
    );
  });

  it("hands a mailto: link to the mail app, with no new tab to mark", () => {
    const a = anchor(renderLink("mailto:hi@sog.gg"));
    expect(a.getAttribute("href")).toBe("mailto:hi@sog.gg");
    expect(a.getAttribute("target")).toBeNull();
    expect(a.querySelector("svg")).toBeNull();
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["data", "data:text/html,hi"],
    ["a character-reference spelling of a script", "java&#115;cript:alert(1)"],
  ])("degrades %s to its label", (_name, href) => {
    const container = renderLink(href);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("Read the page.");
  });

  it.each(["/shop", `${SITE}/library`, "https://example.com", "mailto:hi@sog.gg"])(
    "keeps no link at all in the feed, whatever it points at (%s)",
    (href) => {
      const container = renderLink(href, "feed");
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("svg")).toBeNull();
      expect(container.textContent).toContain("Read the page.");
    },
  );

  it.each([
    ["a locale-less internal path", "/shop/123", "/fi/kauppa/123"],
    ["a path pinned to another language", "/sv/butik/123?x=1#y", "/fi/kauppa/123?x=1#y"],
    ["an absolute address on our own site", `${SITE}/fr/a-propos`, "/fi/meista"],
    ["the root", "/", "/fi"],
  ])("shows %s in the page's language", (_name, href, shown) => {
    expect(anchor(renderLink(href, "landing", "fi")).getAttribute("href")).toBe(shown);
  });

  it.each([
    ["another site", "https://example.com/fi/kauppa"],
    ["a mailto: address", "mailto:hi@sog.gg"],
    ["a same-page fragment", "#faq"],
    ["a path no route matches", "/llms.txt"],
    ["a slug address, kept in its own language", "/sv/bibliotek/guide"],
  ])("leaves %s as written", (_name, href) => {
    expect(anchor(renderLink(href, "landing", "fi")).getAttribute("href")).toBe(href);
  });

  it("holds the same rule in the marketing use case", () => {
    expect(anchor(renderLink("/shop", "marketing")).getAttribute("target")).toBeNull();
    expect(
      anchor(renderLink("https://example.com", "marketing")).getAttribute("target"),
    ).toBe("_blank");
  });
});

describe("authoredLinkKind", () => {
  it("treats every absolute web address as another site's when the site's own is not configured", () => {
    expect(authoredLinkKind(`${SITE}/library`, undefined)).toBe("other-site");
    expect(authoredLinkKind("/library", undefined)).toBe("own-site");
  });

  it("compares hosts, not spellings", () => {
    expect(authoredLinkKind("HTTPS://SOGVERSE.SOG.GG/x", SITE)).toBe("own-site");
    expect(authoredLinkKind("http://sogverse.sog.gg/x", SITE)).toBe("own-site");
  });

  it.each([
    ["our host as the userinfo of another", "https://sogverse.sog.gg@evil.com/x"],
    ["a backslash the browser reads as a slash", "/\\evil.com"],
    ["our host as a label of another", "https://sogverse.sog.gg.evil.com"],
  ])("is not fooled by %s", (_name, href) => {
    expect(authoredLinkKind(href, SITE)).toBe("other-site");
  });

  it("keeps a bare fragment on our own site", () => {
    expect(authoredLinkKind("#frag", SITE)).toBe("own-site");
  });

  it("sends the non-web schemes to their apps", () => {
    expect(authoredLinkKind("mailto:hi@sog.gg", SITE)).toBe("other-scheme");
    expect(authoredLinkKind("xmpp:hi@sog.gg", SITE)).toBe("other-scheme");
  });
});
