import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  RobloxUsernameRow,
  type RobloxCheckStatus,
} from "@/components/roblox/roblox-username-row";

// The row only reads the "roblox.account" namespace. Stub useTranslations so the
// test asserts geometry and the announced state without loading message files.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verifying":
        return "Verifying...";
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "notFound":
        return "Roblox account not found.";
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

const STATUSES: readonly RobloxCheckStatus[] = [
  "idle",
  "checking",
  "valid",
  "invalid",
];

/**
 * The row's three sized parts, by position: avatar box, flexing username, fixed
 * status slot. Read off the DOM rather than by test id — the geometry is what is
 * under test, so the assertions want the real boxes.
 */
function boxes(container: HTMLElement) {
  const row = container.firstElementChild;
  if (!row) throw new Error("the row rendered nothing");
  const children = Array.from(row.children);
  const avatar = children.at(0);
  const status = children.at(2);
  if (!avatar || !status) throw new Error("the row lost one of its slots");
  return { avatar, status };
}

describe("RobloxUsernameRow", () => {
  it("draws a square avatar box — Roblox thumbnails are 1:1, unlike Minecraft's 1:2", () => {
    const { container } = render(<RobloxUsernameRow username="EliasBuilds" />);

    expect(boxes(container).avatar.className).toContain("h-12 w-12");
  });

  it("scales the same square for size='full'", () => {
    const { container } = render(
      <RobloxUsernameRow username="EliasBuilds" size="full" />,
    );

    expect(boxes(container).avatar.className).toContain("h-16 w-16");
  });

  it("keeps the avatar box and the status slot identical in every state", () => {
    const geometry = STATUSES.map((status) => {
      const { container, unmount } = render(
        <RobloxUsernameRow username="EliasBuilds" status={status} />,
      );
      const { avatar, status: slot } = boxes(container);
      const shape = {
        avatar: avatar.className,
        status: slot.className,
      };
      unmount();
      return shape;
    });

    // The whole point of the row: an async lookup landing cannot move it.
    for (const shape of geometry) {
      expect(shape).toEqual(geometry[0]);
    }
    // And the status slot is a fixed square even in the state that draws nothing.
    expect(geometry[0].status).toContain("h-4 w-4");
  });

  it("draws the bundled placeholder when there is no avatar url", () => {
    const { container } = render(<RobloxUsernameRow username="EliasBuilds" />);

    expect(boxes(container).avatar.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("draws the real render when one is supplied", () => {
    const { container } = render(
      <RobloxUsernameRow
        username="EliasBuilds"
        status="valid"
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

  it("falls back to the muted placeholder copy with no username", () => {
    const { getByText } = render(<RobloxUsernameRow username={null} />);

    expect(getByText("(Unknown)")).toBeTruthy();
  });

  it("announces the state politely, and says nothing while idle", () => {
    const live = (status: RobloxCheckStatus) => {
      const { container, unmount } = render(
        <RobloxUsernameRow username="EliasBuilds" status={status} />,
      );
      const text = container.querySelector('[aria-live="polite"]')?.textContent;
      unmount();
      return text;
    };

    expect(live("idle")).toBe("");
    expect(live("checking")).toBe("Verifying...");
    expect(live("valid")).toBe("EliasBuilds (verified)");
    expect(live("invalid")).toBe("Roblox account not found.");
  });
});
