import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TopicInfoCard } from "@/components/public/products/topic-info-card";

// The card reads the "productDetail" namespace. Stub useTranslations so the
// test asserts structure + the PRODUCT_TOPICS-derived facts (label in the
// heading, PEGI, the purchase URL) without loading message files.
// "topicInfo.pegi" interpolates {age} and "topicInfo.heading" interpolates
// {name}; every other key echoes back so we can assert which message slot was
// requested.
vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) => {
      if (key === "topicInfo.pegi") return `PEGI ${params?.age}`;
      if (key === "topicInfo.heading") return `About ${params?.name}`;
      return key;
    },
}));

describe("TopicInfoCard", () => {
  it("renders the interpolated heading, PEGI rating, and the purchase link for a game", () => {
    const { getByText, getByRole } = render(
      <TopicInfoCard topic="minecraft_java" />,
    );

    // The topic's brand name lives in the heading now — the card body carries
    // no separate name line.
    expect(getByText("About Minecraft Java")).toBeTruthy();
    expect(getByText("PEGI 7")).toBeTruthy();
    expect(
      getByText("topicInfo.topics.minecraft_java.description"),
    ).toBeTruthy();
    expect(getByText("topicInfo.topics.minecraft_java.note")).toBeTruthy();

    const link = getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc",
    );
    // External link safety.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders Bedrock as a multi-store list (one place per device)", () => {
    const { container } = render(<TopicInfoCard topic="minecraft_bedrock" />);

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // Several distinct per-platform stores, not a single buy link.
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.some((h) => h?.includes("store.playstation.com"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("play.google.com"))).toBe(true);
  });

  it("keeps Java's single link distinct from every Bedrock store (confusion fix)", () => {
    // Scope to each render's own container — both mount into document.body.
    const java = render(<TopicInfoCard topic="minecraft_java" />);
    const bedrock = render(<TopicInfoCard topic="minecraft_bedrock" />);

    const javaHref = java.container.querySelector("a")?.getAttribute("href");
    const bedrockHrefs = Array.from(
      bedrock.container.querySelectorAll("a"),
    ).map((a) => a.getAttribute("href"));

    expect(javaHref).toBeTruthy();
    expect(bedrockHrefs).not.toContain(javaHref);
  });

  it("shows Fortnite's PEGI 12 and its own link", () => {
    const { getByText, getByRole } = render(<TopicInfoCard topic="fortnite" />);

    expect(getByText("About Fortnite")).toBeTruthy();
    expect(getByText("PEGI 12")).toBeTruthy();
    expect(getByRole("link").getAttribute("href")).toBe(
      "https://www.fortnite.com/",
    );
  });

  it("renders Pokémon GO as the two mobile stores, at PEGI 7", () => {
    const { getByText, container } = render(
      <TopicInfoCard topic="pokemon_go" />,
    );

    // The accented é and the all-caps GO are Niantic's branding, and the label
    // is a literal — so this asserts the exact string, not a normalized one.
    expect(getByText("About Pokémon GO")).toBeTruthy();
    expect(getByText("PEGI 7")).toBeTruthy();

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // Mobile-only, and the exact links matter: both forms are region-neutral
    // and redirect to the visitor's local store, so a country segment creeping
    // into either one would send most parents somewhere they can't buy. These
    // are stable literals in topics.ts, so assert them rather than the host.
    expect(hrefs).toEqual([
      "https://apps.apple.com/app/id1094591345",
      "https://play.google.com/store/apps/details?id=com.nianticlabs.pokemongo",
    ]);
  });

  it("renders Roblox Studio with no PEGI badge and the create.roblox.com link", () => {
    const { getByText, queryByText, getByRole } = render(
      <TopicInfoCard topic="roblox_studio" />,
    );

    expect(getByText("About Roblox Studio")).toBeTruthy();
    // Studio is a creation tool with no age rating of its own; borrowing the
    // Roblox platform's PEGI would assert a rating the tool does not have.
    expect(queryByText(/^PEGI/)).toBeNull();
    expect(getByRole("link").getAttribute("href")).toBe(
      "https://create.roblox.com/",
    );
  });

  it("renders Rocket League's PEGI 3 and its single official-site link", () => {
    const { getByText, getByRole } = render(
      <TopicInfoCard topic="rocket_league" />,
    );

    expect(getByText("About Rocket League")).toBeTruthy();
    expect(getByText("PEGI 3")).toBeTruthy();

    // Free to install on four platforms, so this looked like Bedrock's
    // multi-store shape and deliberately is not: Nintendo's American and
    // European stores share no URL structure, so there is no Switch link that
    // is right from both, and one link to the game's own (single, global) site
    // beats a store row that 404s for half the audience. Assert the single
    // link, because a `stores` list creeping back in is exactly the regression.
    const links = getByRole("link");
    expect(links.getAttribute("href")).toBe("https://www.rocketleague.com/");
    expect(links.getAttribute("rel")).toContain("noopener");
  });

  it("renders no card at all for a topic without an info block", () => {
    // `programming` is a real registry entry with no info: it names subject
    // matter rather than one piece of software, so there is nothing to rate or
    // link to and the page renders no card. This used to be a `vi.doMock` of a
    // manufactured info-less topic, because none existed; now the contract can
    // be tested against the actual registry.
    const { container } = render(<TopicInfoCard topic="programming" />);
    expect(container.innerHTML).toBe("");
  });
});
