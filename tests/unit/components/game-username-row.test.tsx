import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { GameUsernameRow } from "@/components/game-account/game-username-row";
import {
  GAME_FIGURE_HEIGHT,
  type GameAccountStatus,
  type GamePlatform,
} from "@/components/game-account/platforms";

// The row only reads the "gameAccount" namespace. Stub useTranslations so the
// test asserts geometry and the announced state without loading message files.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verifying":
        return "Verifying...";
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

const STATUSES: readonly GameAccountStatus[] = [
  "unknown",
  "unverified",
  "verified",
  "checking",
];

const PLATFORMS: readonly GamePlatform[] = ["minecraft", "roblox"];

/**
 * The row's three sized parts, by position: figure box, flexing username, fixed
 * status slot. Read off the DOM rather than by test id — the geometry is what is
 * under test, so the assertions want the real boxes.
 */
function boxes(container: HTMLElement) {
  const row = container.firstElementChild;
  if (!row) throw new Error("the row rendered nothing");
  const children = Array.from(row.children);
  const avatar = children.at(0);
  const name = children.at(1);
  const status = children.at(2);
  if (!avatar || !name || !status) {
    throw new Error("the row lost one of its slots");
  }
  return { row, avatar, name, status };
}

describe("GameUsernameRow", () => {
  /**
   * There is no size variant, and this is the test that says so. Both platforms
   * are the same height everywhere; only the box's width differs, and only
   * because the render's proportion does — 1:2 for a Minecraft body, 1:1 for a
   * Roblox bust.
   */
  it("gives both platforms the same height, and lets only the width differ", () => {
    const minecraft = render(
      <GameUsernameRow platform="minecraft" username="Notch" avatarUrl={null} />,
    );
    const roblox = render(
      <GameUsernameRow platform="roblox" username="builderman" avatarUrl={null} />,
    );

    for (const rendered of [minecraft, roblox]) {
      const { row, avatar } = boxes(rendered.container);
      expect(row.className).toContain(GAME_FIGURE_HEIGHT.full);
      expect(avatar.className).toContain(GAME_FIGURE_HEIGHT.full);
    }

    // Half the height for the 1:2 body, the full height for the 1:1 bust.
    expect(boxes(minecraft.container).avatar.className).toContain("w-7.5");
    expect(boxes(roblox.container).avatar.className).toContain("w-15");
  });

  /**
   * The compact figure's whole point: it is shorter, and the per-platform
   * proportion divergence disappears. A Minecraft face render and a Roblox
   * headshot are both square, so unlike the full figure these two boxes are
   * identical rather than merely the same height.
   */
  it("draws a shorter, identically square box on both platforms in head mode", () => {
    const rendered = PLATFORMS.map((platform) =>
      render(
        <GameUsernameRow
          platform={platform}
          username="Notch"
          figure="head"
          avatarUrl={null}
        />,
      ),
    );

    const shapes = rendered.map((r) => boxes(r.container).avatar.className);
    expect(shapes[0]).toBe(shapes[1]);
    for (const rendering of rendered) {
      const { row, avatar } = boxes(rendering.container);
      expect(row.className).toContain(GAME_FIGURE_HEIGHT.head);
      expect(avatar.className).toContain(GAME_FIGURE_HEIGHT.head);
    }
    expect(GAME_FIGURE_HEIGHT.head).not.toBe(GAME_FIGURE_HEIGHT.full);
  });

  // Minecraft can derive both renders from a name; the face is a different
  // endpoint from the body, so head mode must not silently draw the body.
  it("derives the face, not the body, when Minecraft draws a head", () => {
    const { container } = render(
      <GameUsernameRow platform="minecraft" username="Notch" figure="head" />,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://mc-heads.net/avatar/Notch/96",
    );
  });

  /**
   * Roblox has no username-addressable endpoint for either figure, so a row
   * holding only a username draws the stand-in — in head mode as much as in
   * full. This is the state that was reported as showing nothing: it always
   * rendered, but at 32px it was too faint to read as a picture.
   */
  it("stays on the drawn stand-in for a Roblox head with nothing handed in", () => {
    const { container } = render(
      <GameUsernameRow platform="roblox" username="builderman" figure="head" />,
    );

    expect(container.querySelector("img")).toBeNull();
    const svg = boxes(container).avatar.querySelector("svg");
    expect(svg).toBeTruthy();
    // A silhouette plus features, not one lone shape.
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(1);
  });

  /**
   * The stand-ins are `muted-foreground` on a `muted` box, and a head has a
   * quarter of a full figure's area — so the head silhouettes have to be drawn
   * harder to survive the shrink. Pinned as a number because the bug it prevents
   * is invisible to every other assertion here: the SVG renders, has the right
   * size and the right colour, and still reads as an empty square.
   */
  it.each(PLATFORMS)(
    "draws the head stand-in's silhouette strongly enough to read at 32px (%s)",
    (platform) => {
      const { container } = render(
        <GameUsernameRow
          platform={platform}
          username={null}
          figure="head"
          avatarUrl={null}
        />,
      );

      const silhouette = boxes(container).avatar.querySelector("svg rect");
      const opacity = Number(silhouette?.getAttribute("opacity") ?? "1");
      expect(opacity).toBeGreaterThanOrEqual(0.5);
    },
  );

  it.each(PLATFORMS)(
    "keeps the figure box and the status slot identical in every state (%s)",
    (platform) => {
      const geometry = STATUSES.map((status) => {
        const { container, unmount } = render(
          <GameUsernameRow
            platform={platform}
            username="EliasBuilds"
            status={status}
            avatarUrl={null}
          />,
        );
        const { avatar, status: slot } = boxes(container);
        const shape = { avatar: avatar.className, status: slot.className };
        unmount();
        return shape;
      });

      // The whole point of the row: an async lookup landing cannot move it.
      for (const shape of geometry) {
        expect(shape).toEqual(geometry[0]);
      }
      // And the status slot is a fixed square even in the state that draws nothing.
      expect(geometry[0].status).toContain("h-4 w-4");
    },
  );

  it.each(PLATFORMS)(
    "draws the bundled placeholder when avatarUrl is explicitly null (%s)",
    (platform) => {
      const { container } = render(
        <GameUsernameRow
          platform={platform}
          username="EliasBuilds"
          avatarUrl={null}
        />,
      );

      expect(boxes(container).avatar.querySelector("svg")).toBeTruthy();
      expect(container.querySelector("img")).toBeNull();
    },
  );

  /**
   * The descriptor's sharpest divergence. Minecraft skins hang off a host
   * addressable by username, so a row holding a name already holds everything it
   * needs; Roblox has no such endpoint, so an omitted prop can only mean the
   * placeholder there.
   */
  it("derives a skin URL from the username when the platform supports it, and only then", () => {
    const minecraft = render(
      <GameUsernameRow platform="minecraft" username="Notch" status="verified" />,
    );
    expect(minecraft.container.querySelector("img")?.getAttribute("src")).toBe(
      "https://mc-heads.net/body/Notch",
    );

    const roblox = render(
      <GameUsernameRow
        platform="roblox"
        username="builderman"
        status="verified"
      />,
    );
    expect(roblox.container.querySelector("img")).toBeNull();
    expect(boxes(roblox.container).avatar.querySelector("svg")).toBeTruthy();
  });

  it("draws the real render when one is handed in", () => {
    const { container } = render(
      <GameUsernameRow
        platform="roblox"
        username="EliasBuilds"
        status="verified"
        avatarUrl="https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png"
      />,
    );

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png",
    );
    // Decorative: the username beside it is the accessible content.
    expect(img?.getAttribute("alt")).toBe("");
  });

  // The figure is a slot like any other and must obey the resolved status. A
  // real face beside "(Unknown)" would have the row asserting an identity it is
  // simultaneously denying.
  it("shows the placeholder, not a face, when the row resolves to unknown", () => {
    const { container } = render(
      <GameUsernameRow
        platform="roblox"
        username={null}
        status="verified"
        avatarUrl="https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png"
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(boxes(container).avatar.querySelector("svg")).toBeTruthy();
  });

  it("falls back to the placeholder when the render fails to load", () => {
    const { container } = render(
      <GameUsernameRow
        platform="minecraft"
        username="Notch"
        status="verified"
        avatarUrl="https://mc-heads.net/body/Gone"
      />,
    );

    const img = container.querySelector("img");
    if (!img) throw new Error("the render never mounted");
    // A dead URL, or one a future CSP blocks, must not leave an empty box where
    // a figure belongs.
    fireEvent.error(img);

    expect(container.querySelector("img")).toBeNull();
    expect(boxes(container).avatar.querySelector("svg")).toBeTruthy();
  });

  it.each(PLATFORMS)(
    "falls back to the muted placeholder copy with no username (%s)",
    (platform) => {
      const { getByText } = render(
        <GameUsernameRow platform={platform} username={null} />,
      );

      expect(getByText("(Unknown)")).toBeTruthy();
    },
  );

  it("announces the state politely, and says nothing when unknown", () => {
    const live = (status: GameAccountStatus) => {
      const { container, unmount } = render(
        <GameUsernameRow
          platform="minecraft"
          username="EliasBuilds"
          status={status}
          avatarUrl={null}
        />,
      );
      const text = container.querySelector('[aria-live="polite"]')?.textContent;
      unmount();
      return text;
    };

    expect(live("unknown")).toBe("");
    expect(live("checking")).toBe("Verifying...");
    expect(live("verified")).toBe("EliasBuilds (verified)");
    expect(live("unverified")).toBe("EliasBuilds (not yet verified)");
  });

  // The state that motivated the four-state vocabulary: a saved name nobody
  // confirmed has to be visibly distinct from a confirmed one, and it earns that
  // by the tick being absent rather than by a glyph of its own.
  it.each(PLATFORMS)(
    "draws unverified in amber with no icon, and verified in success with one (%s)",
    (platform) => {
      const unverified = render(
        <GameUsernameRow
          platform={platform}
          username="EliasBuilds"
          status="unverified"
          avatarUrl={null}
        />,
      );
      expect(boxes(unverified.container).name.className).toContain(
        "text-warning",
      );
      expect(boxes(unverified.container).status.children.length).toBe(0);

      const verified = render(
        <GameUsernameRow
          platform={platform}
          username="EliasBuilds"
          status="verified"
          avatarUrl={null}
        />,
      );
      expect(boxes(verified.container).name.className).toContain("text-success");
      expect(boxes(verified.container).status.children.length).toBe(1);
    },
  );

  it.each(PLATFORMS)(
    "renders a null username as unknown even when the status disagrees (%s)",
    (platform) => {
      const { getByText, container } = render(
        <GameUsernameRow platform={platform} username={null} status="verified" />,
      );

      expect(getByText("(Unknown)")).toBeTruthy();
      // No tick: the row must not assert a confirmed account for a name it hasn't got.
      expect(boxes(container).status.children.length).toBe(0);
    },
  );
});
