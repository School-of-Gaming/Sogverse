import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { GameInfoCard } from "@/components/public/products/game-info-card";

// The card reads the "productDetail" namespace. Stub useTranslations so the
// test asserts structure + the PRODUCT_TOPICS-derived facts (label, PEGI, the
// purchase URL) without loading message files. "gameInfo.pegi" interpolates
// {age}; every other key echoes back so we can assert which message slot was
// requested.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    key === "gameInfo.pegi" ? `PEGI ${params?.age}` : key,
}));

describe("GameInfoCard", () => {
  it("renders brand label, PEGI rating, and the purchase link for a game", () => {
    const { getByText, getByRole } = render(
      <GameInfoCard topic="minecraft_java" />,
    );

    expect(getByText("Minecraft Java")).toBeTruthy();
    expect(getByText("PEGI 7")).toBeTruthy();
    expect(getByText("gameInfo.games.minecraft_java.description")).toBeTruthy();
    expect(getByText("gameInfo.games.minecraft_java.note")).toBeTruthy();

    const link = getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc",
    );
    // External link safety.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders Bedrock as a multi-store list (one place per device)", () => {
    const { container } = render(<GameInfoCard topic="minecraft_bedrock" />);

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // Several distinct per-platform stores, not a single buy link.
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(
      hrefs.some((h) => h?.includes("store.playstation.com")),
    ).toBe(true);
    expect(hrefs.some((h) => h?.includes("play.google.com"))).toBe(true);
  });

  it("keeps Java's single link distinct from every Bedrock store (confusion fix)", () => {
    // Scope to each render's own container — both mount into document.body.
    const java = render(<GameInfoCard topic="minecraft_java" />);
    const bedrock = render(<GameInfoCard topic="minecraft_bedrock" />);

    const javaHref = java.container.querySelector("a")?.getAttribute("href");
    const bedrockHrefs = Array.from(
      bedrock.container.querySelectorAll("a"),
    ).map((a) => a.getAttribute("href"));

    expect(javaHref).toBeTruthy();
    expect(bedrockHrefs).not.toContain(javaHref);
  });

  it("shows Fortnite's PEGI 12 and its own link", () => {
    const { getByText, getByRole } = render(<GameInfoCard topic="fortnite" />);

    expect(getByText("Fortnite")).toBeTruthy();
    expect(getByText("PEGI 12")).toBeTruthy();
    expect(getByRole("link").getAttribute("href")).toBe(
      "https://www.fortnite.com/",
    );
  });
});
