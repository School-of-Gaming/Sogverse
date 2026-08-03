import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { GameUsernameBadge } from "@/components/game-account/game-username-badge";
import type { GamePlatform } from "@/components/game-account/platforms";

// The badge only reads the "gameAccount" namespace. Stub useTranslations so the
// test asserts the state→copy/colour mapping without loading message files.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

const PLATFORMS: readonly GamePlatform[] = ["minecraft", "roblox"];

/**
 * The two external id shapes, kept apart on purpose: a dashed Mojang UUID and a
 * Roblox integer. Nothing in the badge reads the value — presence is the whole
 * of "verified" — and these cases are what prove it.
 */
const VERIFIED_ID: Readonly<Record<GamePlatform, string | number>> = {
  minecraft: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
  roblox: 68306362,
};

describe("GameUsernameBadge", () => {
  it.each(PLATFORMS)(
    "renders the verified state in success colour with a check (%s)",
    (platform) => {
      const { getByText, getByLabelText, container } = render(
        <GameUsernameBadge
          platform={platform}
          username="EliasBuilds"
          externalId={VERIFIED_ID[platform]}
        />,
      );

      expect(getByText("EliasBuilds")).toBeTruthy();
      expect(getByLabelText("EliasBuilds (verified)").className).toContain(
        "text-success",
      );
      // platform icon + check = two svg icons when verified
      expect(container.querySelectorAll("svg")).toHaveLength(2);
    },
  );

  it.each(PLATFORMS)(
    "renders the unverified state in warning colour, no check (%s)",
    (platform) => {
      const { getByLabelText, container } = render(
        <GameUsernameBadge
          platform={platform}
          username="EliasBuilds"
          externalId={null}
        />,
      );

      expect(
        getByLabelText("EliasBuilds (not yet verified)").className,
      ).toContain("text-warning");
      // platform icon only
      expect(container.querySelectorAll("svg")).toHaveLength(1);
    },
  );

  it.each(PLATFORMS)(
    "renders the not-provided state as muted '(Unknown)' (%s)",
    (platform) => {
      const { getByText, getByLabelText } = render(
        <GameUsernameBadge platform={platform} username={null} externalId={null} />,
      );

      expect(getByText("(Unknown)")).toBeTruthy();
      expect(getByLabelText("(Unknown)").className).toContain(
        "text-muted-foreground",
      );
    },
  );

  // A key with no name is not a verified account, it is a bug upstream — and the
  // badge must not launder it into a green tick.
  it("refuses to call an account verified when there is no username to show", () => {
    const { getByLabelText } = render(
      <GameUsernameBadge platform="roblox" username={null} externalId={68306362} />,
    );

    expect(getByLabelText("(Unknown)").className).toContain(
      "text-muted-foreground",
    );
  });

  it("uses the larger text size when size='base'", () => {
    const { getByLabelText } = render(
      <GameUsernameBadge
        platform="minecraft"
        username="EliasBuilds"
        externalId="8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6"
        size="base"
      />,
    );

    expect(getByLabelText("EliasBuilds (verified)").className).toContain(
      "text-sm",
    );
  });

  // Each platform is announced by its own glyph and nothing else — no caller
  // prefixes a "Minecraft:" label — so the two must not render the same icon.
  it("gives each platform a different icon", () => {
    const iconOf = (platform: GamePlatform) => {
      const { container, unmount } = render(
        <GameUsernameBadge
          platform={platform}
          username="EliasBuilds"
          externalId={null}
        />,
      );
      // The drawn paths, not the class list: two lucide icons can share every
      // class and still be different pictures, which is what matters here.
      const drawn = container.querySelector("svg")?.innerHTML;
      unmount();
      return drawn;
    };

    expect(iconOf("minecraft")).not.toBe(iconOf("roblox"));
  });
});
