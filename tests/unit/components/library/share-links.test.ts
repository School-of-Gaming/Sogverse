import { describe, expect, it } from "vitest";
import { buildShareLinks } from "@/components/library/article/share-links";

const URL_WITH_QUERY = "https://example.test/en/library/abc?x=1&y=two words#top";
const TITLE = "Is Fortnite Safe for Kids? 5 Myths & a “quote”";

function params(href: string) {
  return new URL(href).searchParams;
}

describe("buildShareLinks", () => {
  const links = buildShareLinks({ url: URL_WITH_QUERY, title: TITLE });

  it("round-trips the url and title through every web platform's own parameters", () => {
    expect(params(links.whatsapp).get("text")).toBe(`${TITLE} ${URL_WITH_QUERY}`);
    expect(params(links.linkedin).get("url")).toBe(URL_WITH_QUERY);
    expect(params(links.x).get("url")).toBe(URL_WITH_QUERY);
    expect(params(links.x).get("text")).toBe(TITLE);
    expect(params(links.reddit).get("url")).toBe(URL_WITH_QUERY);
    expect(params(links.reddit).get("title")).toBe(TITLE);
  });

  it("keeps the article's own query and fragment inside the parameter rather than leaking them into the share address", () => {
    for (const href of [links.linkedin, links.x, links.reddit, links.whatsapp]) {
      const parsed = new URL(href);
      expect(parsed.hash).toBe("");
      expect([...parsed.searchParams.keys()]).not.toContain("y");
    }
  });

  it("encodes spaces in the mailto as %20, never +, which a mail client would show literally", () => {
    expect(links.email.startsWith("mailto:?subject=")).toBe(true);
    expect(links.email).not.toContain("+");
    const [, query] = links.email.split("?");
    const fields = Object.fromEntries(
      query.split("&").map((pair) => {
        const [key, value] = pair.split("=");
        return [key, decodeURIComponent(value)];
      }),
    );
    expect(fields).toEqual({ subject: TITLE, body: URL_WITH_QUERY });
  });

  it("uses each platform's documented share endpoint", () => {
    expect(links.whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(links.linkedin).toMatch(
      /^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/,
    );
    expect(links.x).toMatch(/^https:\/\/x\.com\/intent\/post\?text=.*&url=/);
    expect(links.reddit).toMatch(/^https:\/\/www\.reddit\.com\/submit\?url=.*&title=/);
  });
});
