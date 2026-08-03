import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { GameUsernameField } from "@/components/game-account/game-username-field";
import type { GamePlatform } from "@/components/game-account/platforms";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "label":
        return `${params?.platform} Username`;
      case "placeholder":
        return `e.g. ${params?.example}`;
      case "verify":
        return "Verify";
      case "verifying":
        return "Verifying...";
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "notFound":
        return `${params?.platform} account not found.`;
      case "displayName":
        return `Shown in-game as ${params?.displayName}`;
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

/** The in-flight lookup, resolvable by the test at the exact moment it chooses. */
let settle: {
  resolve: (profile: unknown) => void;
  reject: (err: Error) => void;
};

const mutateAsync = vi.fn(
  () =>
    new Promise<unknown>((resolve, reject) => {
      settle = { resolve, reject };
    }),
);

// Both platform hooks are called unconditionally by `useVerifyGameAccount`, so
// both have to exist whichever platform the case under test drives. They share
// one promise factory — only one of them is ever fired per test.
vi.mock("@/services/minecraft", () => ({
  useVerifyMinecraft: () => ({ mutateAsync }),
}));
vi.mock("@/services/roblox", () => ({
  useVerifyRoblox: () => ({ mutateAsync }),
}));

/**
 * A lookup result in each platform's own wire shape — the two the adapter has to
 * normalise. Mojang answers with a dashed UUID and no second name; Roblox adds a
 * numeric id, a display name and a resolved avatar URL.
 */
function lookupResult(platform: GamePlatform, username: string): unknown {
  return platform === "minecraft"
    ? { username, uuid: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6" }
    : {
        username,
        userId: 2207291,
        displayName: username,
        avatarUrl: null,
      };
}

/**
 * The field is controlled, so a test that types has to hold the value the way a
 * real parent does — otherwise the input never changes and the race under test
 * cannot happen.
 */
function Harness({
  platform,
  onChange,
}: {
  platform: GamePlatform;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <GameUsernameField
      platform={platform}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function setup(platform: GamePlatform) {
  const onChange = vi.fn();
  const utils = render(<Harness platform={platform} onChange={onChange} />);
  const input = utils.container.querySelector("input");
  const button = utils.container.querySelector("button");
  if (!input || !button) throw new Error("the field lost a control");
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  return { ...utils, input, button, onChange, type };
}

/** A name valid on both platforms, so one case can drive either. */
const TYPED = "linkmon99";
const CANONICAL = "Linkmon99";
const PLATFORMS: readonly GamePlatform[] = ["minecraft", "roblox"];

beforeEach(() => {
  mutateAsync.mockClear();
});

describe("GameUsernameField", () => {
  it.each(PLATFORMS)(
    "adopts the canonical casing when the field has not moved on (%s)",
    async (platform) => {
      const { input, button, onChange, type } = setup(platform);

      type(TYPED);
      fireEvent.click(button);
      await act(async () =>
        settle.resolve(lookupResult(platform, CANONICAL)),
      );

      expect(onChange).toHaveBeenCalledWith(CANONICAL);
      expect(input.value).toBe(CANONICAL);
    },
  );

  /**
   * The regression the Roblox field was rewritten for, and the reason the two
   * trees were unified rather than left alone: only one of the two forks ever
   * grew this guard.
   *
   * The input stays editable for the whole flight, so a result can land against
   * a box that has since moved on. Comparing the response with the value
   * captured at click time differs from the canonical casing on the ordinary
   * path — anyone typing lowercase — so it fired `onChange` and wrote a stale
   * answer over what was being typed.
   */
  it.each(PLATFORMS)(
    "discards a result whose name the field no longer holds (%s)",
    async (platform) => {
      const { input, button, onChange, type } = setup(platform);

      type(TYPED);
      fireEvent.click(button);
      // Still in flight, and the user carries on typing.
      type("linkmon99xyz");
      onChange.mockClear();

      await act(async () =>
        settle.resolve(lookupResult(platform, CANONICAL)),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(input.value).toBe("linkmon99xyz");
    },
  );

  it.each(PLATFORMS)(
    "does not pin a stale failure on a name the user has since retyped (%s)",
    async (platform) => {
      const { input, button, queryByText, type } = setup(platform);

      type("zzqnotreal99812");
      fireEvent.click(button);
      type("builderman");

      await act(async () => settle.reject(new Error("account not found.")));

      expect(queryByText("account not found.")).toBeNull();
      expect(input.value).toBe("builderman");
    },
  );

  it.each(PLATFORMS)(
    "releases the button once a discarded result lands, so a retry is possible (%s)",
    async (platform) => {
      const { button, type } = setup(platform);

      type(TYPED);
      fireEvent.click(button);
      expect(button.disabled).toBe(true);

      type("builderman");
      await act(async () =>
        settle.resolve(lookupResult(platform, CANONICAL)),
      );

      // The request finished, so the flight is over even though its answer was
      // thrown away — leaving it disabled would strand the field.
      expect(button.disabled).toBe(false);
    },
  );

  it.each(PLATFORMS)(
    "holds the button disabled for the whole flight (%s)",
    async (platform) => {
      const { button, type } = setup(platform);

      type(TYPED);
      expect(button.disabled).toBe(false);

      fireEvent.click(button);
      expect(button.disabled).toBe(true);

      await act(async () =>
        settle.resolve(lookupResult(platform, CANONICAL)),
      );
      expect(button.disabled).toBe(false);
    },
  );

  /**
   * The layout contract: the identity row exists at its final height before
   * anything is typed or pressed, so the figure that arrives after a check lands
   * into space already reserved and the error line below never moves.
   */
  it.each(PLATFORMS)(
    "reserves the identity row's slot from first paint (%s)",
    (platform) => {
      const { container } = setup(platform);

      const slot = container.querySelector(".h-12");
      expect(slot).toBeTruthy();
      // Empty box, and the row inside it is already rendering the unknown state.
      expect(slot?.textContent).toContain("(Unknown)");
    },
  );

  it.each(PLATFORMS)(
    "gates Verify on the platform's own username rule (%s)",
    (platform) => {
      const { button, type } = setup(platform);

      // Two characters is under every platform's minimum.
      type("ab");
      expect(button.disabled).toBe(true);

      type(TYPED);
      expect(button.disabled).toBe(false);
    },
  );

  // Roblox usernames allow at most one underscore and never at an edge; a
  // Minecraft name may be all underscores. The field reads each rule from its
  // descriptor rather than restating either.
  it("applies a rule one platform has and the other does not", () => {
    const minecraft = setup("minecraft");
    minecraft.type("a_b_c");
    expect(minecraft.button.disabled).toBe(false);
    minecraft.unmount();

    const roblox = setup("roblox");
    roblox.type("a_b_c");
    expect(roblox.button.disabled).toBe(true);
  });

  // Roblox hands back a display name; Mojang has no second name at all. The
  // adapter normalises both, and it suppresses a display name identical to the
  // handle — that is the same line twice, not a second line.
  it("shows a display name only where the platform has one that differs", async () => {
    const roblox = setup("roblox");
    roblox.type("builderman");
    fireEvent.click(roblox.button);
    await act(async () =>
      settle.resolve({
        username: "builderman",
        userId: 156,
        displayName: "Builderman",
        avatarUrl: null,
      }),
    );
    expect(roblox.queryByText("Shown in-game as Builderman")).toBeTruthy();
    roblox.unmount();

    const same = setup("roblox");
    same.type("builderman");
    fireEvent.click(same.button);
    await act(async () =>
      settle.resolve({
        username: "builderman",
        userId: 156,
        displayName: "builderman",
        avatarUrl: null,
      }),
    );
    expect(same.container.textContent).not.toContain("Shown in-game as");
    same.unmount();

    const minecraft = setup("minecraft");
    minecraft.type("Notch");
    fireEvent.click(minecraft.button);
    await act(async () =>
      settle.resolve(lookupResult("minecraft", "Notch")),
    );
    expect(minecraft.container.textContent).not.toContain("Shown in-game as");
  });

  // A Minecraft skin is derivable from the canonical name the lookup returned,
  // even though the lookup never mentioned an image. Roblox's comes back null
  // here, so the row stays on its drawn placeholder.
  it("draws the skin the Minecraft adapter derives from the confirmed name", async () => {
    const { button, container, type } = setup("minecraft");

    type("notch");
    fireEvent.click(button);
    await act(async () => settle.resolve(lookupResult("minecraft", "Notch")));

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://mc-heads.net/body/Notch",
    );
  });
});
