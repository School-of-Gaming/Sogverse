import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
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
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

const STATUSES: readonly RobloxCheckStatus[] = [
  "unknown",
  "unverified",
  "verified",
  "checking",
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

  // The avatar is a slot like any other and must obey the resolved status. A
  // real face beside "(Unknown)" would have the row asserting an identity it is
  // simultaneously denying.
  it("shows the placeholder, not a face, when the row resolves to unknown", () => {
    const { container } = render(
      <RobloxUsernameRow
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
      <RobloxUsernameRow
        username="EliasBuilds"
        status="verified"
        avatarUrl="https://tr.rbxcdn.com/gone/420/420/AvatarBust/Png"
      />,
    );

    const img = container.querySelector("img");
    if (!img) throw new Error("the render never mounted");
    // A dead CDN URL, or one a future CSP blocks, must not leave an empty square
    // where a figure belongs.
    fireEvent.error(img);

    expect(container.querySelector("img")).toBeNull();
    expect(boxes(container).avatar.querySelector("svg")).toBeTruthy();
  });

  it("falls back to the muted placeholder copy with no username", () => {
    const { getByText } = render(<RobloxUsernameRow username={null} />);

    expect(getByText("(Unknown)")).toBeTruthy();
  });

  it("announces the state politely, and says nothing when unknown", () => {
    const live = (status: RobloxCheckStatus) => {
      const { container, unmount } = render(
        <RobloxUsernameRow username="EliasBuilds" status={status} />,
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

  // The state that motivated the four-state rewrite: a saved name nobody
  // confirmed has to be visibly distinct from a confirmed one, and it earns that
  // by the tick being absent rather than by a glyph of its own — the treatment
  // the house pattern uses for a saved-but-unconfirmed game account.
  it("draws unverified in amber with no icon, and verified in success with one", () => {
    const nameOf = (container: HTMLElement) =>
      Array.from(container.firstElementChild?.children ?? []).at(1);

    const unverified = render(
      <RobloxUsernameRow username="EliasBuilds" status="unverified" />,
    );
    expect(nameOf(unverified.container)?.className).toContain("text-warning");
    expect(boxes(unverified.container).status.children.length).toBe(0);

    const verified = render(
      <RobloxUsernameRow username="EliasBuilds" status="verified" />,
    );
    expect(nameOf(verified.container)?.className).toContain("text-success");
    expect(boxes(verified.container).status.children.length).toBe(1);
  });

  it("renders a null username as unknown even when the status disagrees", () => {
    const { getByText, container } = render(
      <RobloxUsernameRow username={null} status="verified" />,
    );

    expect(getByText("(Unknown)")).toBeTruthy();
    // No tick: the row must not assert a confirmed account for a name it hasn't got.
    expect(boxes(container).status.children.length).toBe(0);
  });
});
