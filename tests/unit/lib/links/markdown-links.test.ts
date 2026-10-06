import { describe, expect, it, vi } from "vitest";
import { canonicalizeMarkdownLinks } from "@/lib/links/markdown-links";
import type { SlugResolver } from "@/lib/links/own-site";

const SITE = "https://sogverse.sog.gg";
const ID = "3f1c2a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69";
const resolver: SlugResolver = async (_template, locale, slug) =>
  locale === "fi" && slug === "opas" ? ID : null;

const canonical = (markdown: string) =>
  canonicalizeMarkdownLinks(markdown, resolver, SITE);

describe("canonicalizeMarkdownLinks", () => {
  it("rewrites only the destination of an own-site link", async () => {
    await expect(
      canonical("See **the [shop](/fi/kauppa/123 \"Shop\")** _now_.\n"),
    ).resolves.toEqual({
      markdown: 'See **the [shop](/shop/123 "Shop")** _now_.\n',
      deadLinks: [],
    });
  });

  it("rewrites an absolute own-site link, keeping its query and fragment", async () => {
    const { markdown } = await canonical(`[a](${SITE}/sv/butik/1?x=1#y)`);
    expect(markdown).toBe("[a](/shop/1?x=1#y)");
  });

  it("stores a slug address at its id", async () => {
    const { markdown } = await canonical("Read [the guide](/fi/kirjasto/opas).");
    expect(markdown).toBe(`Read [the guide](/library/${ID}).`);
  });

  it("leaves external, mailto, same-page and unusable links byte for byte", async () => {
    const source = [
      "[ext](https://example.com/fi/kauppa) [www](https://www.sogverse.sog.gg/fi/kauppa)",
      "[mail](mailto:hi@sog.gg) [top](#top) [bad](javascript:alert(1))",
      "<https://example.com/x> ![img](/fi/kauppa)",
    ].join("\n");
    await expect(canonical(source)).resolves.toEqual({ markdown: source, deadLinks: [] });
  });

  it("reports every dead own-site link with its words, in order, and changes nothing for it", async () => {
    const source = "[first **one**](/fi/ei-mitaan) and [second](/fi/kirjasto/tuntematon)";
    await expect(canonical(source)).resolves.toEqual({
      markdown: source,
      deadLinks: [
        { text: "first one", href: "/fi/ei-mitaan" },
        { text: "second", href: "/fi/kirjasto/tuntematon" },
      ],
    });
  });

  it("rewrites a reference link's definition, and reports a dead one per use", async () => {
    const source = [
      "[Shop][s], [again][s] and [gone].",
      "",
      "[s]: /fi/kauppa 'Shop'",
      "[gone]:",
      "  /fi/ei-mitaan",
      "[unused]: /fi/ei-sekaan",
    ].join("\n");
    const result = await canonical(source);
    expect(result.markdown).toBe(source.replace("[s]: /fi/kauppa", "[s]: /shop"));
    expect(result.deadLinks).toEqual([{ text: "gone", href: "/fi/ei-mitaan" }]);
  });

  it("ignores an unreferenced definition", async () => {
    const source = "Text.\n\n[x]: /fi/ei-mitaan\n";
    await expect(canonical(source)).resolves.toEqual({ markdown: source, deadLinks: [] });
  });

  it("rewrites an angle-bracketed destination", async () => {
    const { markdown } = await canonical("[a](</fi/kauppa/1>)");
    expect(markdown).toBe("[a](/shop/1)");
  });

  it("finds the destination after a line break and with balanced parentheses", async () => {
    const { markdown } = await canonical("[a](\n  /fi/kauppa?q=(x) 'T')");
    expect(markdown).toBe("[a](\n  /shop?q=\\(x\\) 'T')");
  });

  it("handles an empty label and a label holding brackets", async () => {
    const { markdown } = await canonical("[](/fi/kauppa) [a \\] b](/fi/meista)");
    expect(markdown).toBe("[](/shop) [a \\] b](/about)");
  });

  it("turns an own-site autolink into a link that still reads as its address", async () => {
    const { markdown } = await canonical(`Go to <${SITE}/fi/kauppa?a_b=1>.`);
    expect(markdown).toBe(`Go to [${SITE}/fi/kauppa?a\\_b=1](/shop?a_b=1).`);
  });

  it("escapes an & that would read as a character reference", async () => {
    const { markdown } = await canonical(`[a](${SITE}/fi/kauppa?a=1\\&copy;=2)`);
    expect(markdown).toBe("[a](/shop?a=1\\&copy;=2)");
  });

  it("leaves a link inside a list, a heading and emphasis in place", async () => {
    const source = "## [Shop](/fi/kauppa)\n\n- *[About](/sv/om-oss)*\n- plain\n";
    const { markdown } = await canonical(source);
    expect(markdown).toBe("## [Shop](/shop)\n\n- *[About](/about)*\n- plain\n");
  });

  it("asks the resolver only about slugs", async () => {
    const spy = vi.fn<SlugResolver>().mockResolvedValue(ID);
    await canonicalizeMarkdownLinks(
      "[a](/fi/kauppa) [b](https://example.com) [c](/fi/kirjasto/opas)",
      spy,
      SITE,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("/library/[idOrSlug]", "fi", "opas");
  });

  it("returns markdown with no links unchanged", async () => {
    const source = "# Title\n\nJust *words* & things.\n";
    await expect(canonical(source)).resolves.toEqual({ markdown: source, deadLinks: [] });
  });
});
