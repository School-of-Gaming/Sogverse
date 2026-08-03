import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { GameUsernameEditableRow } from "@/components/game-account/game-username-editable-row";
import { gameAccountStatus } from "@/components/game-account/platforms";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "none":
        return "(Unknown)";
      case "usernameLabel":
        return `${params?.platform} username`;
      case "placeholder":
        return `e.g. ${params?.example}`;
      case "edit":
        return `Edit ${params?.platform} username`;
      case "editFor":
        return `Edit ${params?.platform} username for ${params?.name}`;
      case "save":
        return "Save";
      case "cancel":
        return "Cancel";
      default:
        return key;
    }
  },
}));

const MOJANG_UUID = "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6";

function setup(
  props: Partial<
    React.ComponentProps<typeof GameUsernameEditableRow>
  > = {},
) {
  const onSave = vi.fn();
  const utils = render(
    <GameUsernameEditableRow
      platform="minecraft"
      username="EliasRedstone"
      externalId={MOJANG_UUID}
      avatarUrl={null}
      onSave={onSave}
      {...props}
    />,
  );
  const pencil = () => utils.container.querySelector("button");
  const input = () => utils.container.querySelector("input");
  return { ...utils, onSave, pencil, input };
}

/** The component's outermost box — the one whose height the roster around it inherits. */
function shell(container: HTMLElement) {
  const el = container.firstElementChild;
  if (!el) throw new Error("the row rendered nothing");
  return el;
}

describe("gameAccountStatus", () => {
  it("derives the resting state from the account rather than remembering one", () => {
    expect(gameAccountStatus(null, null)).toBe("unknown");
    expect(gameAccountStatus("EliasRedstone", null)).toBe("unverified");
    expect(gameAccountStatus("EliasRedstone", MOJANG_UUID)).toBe("verified");
    // The two id shapes are only ever tested for presence.
    expect(gameAccountStatus("builderman", 68306362)).toBe("verified");
  });

  // A key with no name is not a verified account — the username is what the
  // whole row is about, and there is nothing here to call confirmed.
  it("stays unknown when there is a key but no username", () => {
    expect(gameAccountStatus(null, 68306362)).toBe("unknown");
  });
});

describe("GameUsernameEditableRow", () => {
  /**
   * The reason both states are pinned to the same height: opening an editor is a
   * change the person asked for and may replace what is under their cursor, but
   * the roster rows *around* it asked for nothing and must not move.
   */
  it("keeps the row exactly h-12 in both display and edit mode", () => {
    const { container, pencil } = setup();

    expect(shell(container).className).toContain("h-12");

    const button = pencil();
    if (!button) throw new Error("the pencil never rendered");
    fireEvent.click(button);

    expect(shell(container).className).toContain("h-12");
  });

  it("derives the resting status from the account, with no caller needing to say so", () => {
    const verified = setup();
    expect(
      verified.container.querySelector('[aria-live="polite"]')?.textContent,
    ).toBe("EliasRedstone (verified)");
    verified.unmount();

    const unverified = setup({ externalId: null });
    expect(
      unverified.container.querySelector('[aria-live="polite"]')?.textContent,
    ).toBe("EliasRedstone (not yet verified)");
  });

  // An explicit status is a lookup that really is in flight, so it wins over the
  // account's resting state.
  it("lets an explicit status override the derived one", () => {
    const { container } = setup({ status: "checking" });

    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "verifying",
    );
  });

  it("seeds the draft from the saved username, and from an empty string when there is none", () => {
    const withName = setup();
    const pencil = withName.pencil();
    if (!pencil) throw new Error("the pencil never rendered");
    fireEvent.click(pencil);
    expect(withName.input()?.value).toBe("EliasRedstone");
    withName.unmount();

    const without = setup({ username: null, externalId: null });
    const emptyPencil = without.pencil();
    if (!emptyPencil) throw new Error("the pencil never rendered");
    fireEvent.click(emptyPencil);
    expect(without.input()?.value).toBe("");
  });

  it("commits the trimmed draft on Enter and closes", () => {
    const { onSave, pencil, input, container } = setup();

    const button = pencil();
    if (!button) throw new Error("the pencil never rendered");
    fireEvent.click(button);

    const box = input();
    if (!box) throw new Error("the editor never opened");
    fireEvent.change(box, { target: { value: "  NewName  " } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("NewName");
    // Closed: the editor is gone and the display row is back.
    expect(container.querySelector("input")).toBeNull();
  });

  /** The draft is seeded on open rather than held across closes, so cancelling really discards. */
  it("discards the draft on Escape, and reseeds from the account next time", () => {
    const { onSave, input, container } = setup();

    // Re-read the pencil each time: closing the editor remounts the display row,
    // so a handle taken before the first open is detached by the second.
    const open = () => {
      const button = container.querySelector("button");
      if (!button) throw new Error("the pencil never rendered");
      fireEvent.click(button);
    };

    open();
    const box = input();
    if (!box) throw new Error("the editor never opened");
    fireEvent.change(box, { target: { value: "Typed then abandoned" } });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();

    open();
    expect(input()?.value).toBe("EliasRedstone");
  });

  // On a surface listing several people, "Edit Minecraft username" eight times
  // names nobody; on a settings page the answer is "yours" and a name would be
  // noise.
  it("names the person in the pencil's label only when it was given one", () => {
    const named = setup({ personName: "Aino" });
    expect(named.pencil()?.getAttribute("aria-label")).toBe(
      "Edit Minecraft username for Aino",
    );
    named.unmount();

    const anonymous = setup();
    expect(anonymous.pencil()?.getAttribute("aria-label")).toBe(
      "Edit Minecraft username",
    );
  });

  it("reads its platform from the descriptor, not from the caller", () => {
    const { container, pencil } = setup({
      platform: "roblox",
      username: "builderman",
      externalId: 68306362,
    });

    expect(pencil()?.getAttribute("aria-label")).toBe(
      "Edit Roblox username",
    );

    const button = pencil();
    if (!button) throw new Error("the pencil never rendered");
    fireEvent.click(button);
    expect(container.querySelector("input")?.getAttribute("placeholder")).toBe(
      "e.g. builderman",
    );
  });
});
