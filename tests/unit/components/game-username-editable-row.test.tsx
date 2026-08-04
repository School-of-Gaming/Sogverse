import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { GameUsernameEditableRow } from "@/components/game-account/game-username-editable-row";
import {
  gameFigureHeight,
  gameAccountStatus,
  type GamePlatform,
} from "@/components/game-account/platforms";

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
      case "usernameLabel":
        return `${params?.platform} username`;
      case "placeholder":
        return `e.g. ${params?.example}`;
      case "notFound":
        return `${params?.platform} account not found.`;
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
// both have to exist whichever platform the case under test drives.
vi.mock("@/services/minecraft", () => ({
  useVerifyMinecraft: () => ({ mutateAsync }),
}));
vi.mock("@/services/roblox", () => ({
  useVerifyRoblox: () => ({ mutateAsync }),
}));

const MOJANG_UUID = "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6";

function lookupResult(platform: GamePlatform, username: string): unknown {
  return platform === "minecraft"
    ? { username, uuid: MOJANG_UUID }
    : { username, userId: 2207291, displayName: username, avatarUrl: null };
}

interface HarnessProps {
  platform?: GamePlatform;
  initialUsername?: string | null;
  initialExternalId?: string | number | null;
  autoEdit?: boolean;
  personName?: string;
  onCommit?: (username: string | null, externalId: string | number | null) => void;
  /**
   * Defer the prop update the way a real surface does.
   *
   * A synchronous harness stores the commit before the row can render once, so
   * it can never see the row fall back to the old name mid-write — which is
   * exactly how that bug hid. When set, the harness holds the value until the
   * returned promise is resolved by the test.
   */
  deferCommit?: boolean;
}

/**
 * The row is controlled: it reports a commit and expects the value back as a
 * prop. A test that does not hold the value the way a real surface does cannot
 * see the canonical casing land.
 */
function Harness({
  platform = "minecraft",
  initialUsername = null,
  initialExternalId = null,
  autoEdit = false,
  personName,
  onCommit,
  deferCommit = false,
}: HarnessProps) {
  const [username, setUsername] = useState(initialUsername);
  const [externalId, setExternalId] = useState(initialExternalId);

  return (
    <GameUsernameEditableRow
      platform={platform}
      username={username}
      externalId={externalId}
      autoEdit={autoEdit}
      personName={personName}
      onCommit={(account) => {
        onCommit?.(account.username, account.externalId);

        const store = () => {
          setUsername(account.username);
          setExternalId(account.externalId);
        };

        if (!deferCommit) {
          store();
          return;
        }

        return new Promise<void>((resolve, reject) => {
          settleCommit = () => {
            store();
            resolve();
          };
          failCommit = () => reject(new Error("the write was refused"));
        });
      }}
    />
  );
}

/** Resolve / reject the deferred commit, at the moment the test chooses. */
let settleCommit: () => void;
let failCommit: () => void;

function setup(props: Omit<HarnessProps, "onCommit"> = {}) {
  const onCommit = vi.fn();
  const utils = render(<Harness {...props} onCommit={onCommit} />);
  const input = () => utils.container.querySelector("input");
  const pencil = () => utils.container.querySelector("button");
  const type = (value: string) => {
    const box = input();
    if (!box) throw new Error("the editor is not open");
    fireEvent.change(box, { target: { value } });
  };
  const press = (key: string) => {
    const box = input();
    if (!box) throw new Error("the editor is not open");
    fireEvent.keyDown(box, { key });
  };
  const openEditor = () => {
    const button = pencil();
    if (!button) throw new Error("the pencil never rendered");
    fireEvent.click(button);
  };
  return { ...utils, onCommit, input, pencil, type, press, openEditor };
}

/** The node both modes declare the height on. */
function shell(container: HTMLElement) {
  const inner = container.firstElementChild?.firstElementChild;
  if (!inner) throw new Error("the row rendered nothing");
  return inner;
}

const live = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"]')?.textContent;

beforeEach(() => {
  mutateAsync.mockClear();
});

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
   * The reason both modes are pinned to the same height: opening an editor is a
   * change the person asked for and may replace what is under their cursor, but
   * the roster rows *around* it asked for nothing and must not move.
   */
  it("keeps the row at the one game-account height in both modes", () => {
    const { container, openEditor } = setup({ initialUsername: "Notch" });

    expect(shell(container).className).toContain(gameFigureHeight("full"));
    openEditor();
    expect(shell(container).className).toContain(gameFigureHeight("full"));
  });

  /**
   * The shape the rewrite is about: editing happens *in the row*, so the figure
   * stays put and only the name box changes. A separate labelled input, a Verify
   * button beside it and a preview row underneath is the pattern this replaces.
   */
  it("keeps the figure on screen while editing, swapping only the name for an input", () => {
    const { container, openEditor } = setup({ initialUsername: "Notch" });

    expect(container.querySelector("svg, img")).toBeTruthy();

    openEditor();

    expect(container.querySelector("input")).toBeTruthy();
    // Still a figure, still in the row — not a preview that appears underneath.
    expect(container.querySelector("svg, img")).toBeTruthy();
  });

  it("opens straight into edit mode when autoEdit is set, and not otherwise", () => {
    const capture = setup({ autoEdit: true });
    expect(capture.input()).toBeTruthy();
    capture.unmount();

    const roster = setup({ initialUsername: "Notch" });
    expect(roster.input()).toBeNull();
  });

  it("reads its platform from the descriptor", () => {
    const { input } = setup({ platform: "roblox", autoEdit: true });

    expect(input()?.getAttribute("placeholder")).toBe("e.g. builderman");
  });

  // There is no Verify button any more: the commit is the lookup.
  it("runs the lookup on commit and shows checking in the status square", async () => {
    const { container, type, press } = setup({ autoEdit: true });

    type("notch");
    press("Enter");

    // Editor closed, the typed name is on screen, the lookup is in flight.
    expect(container.querySelector("input")).toBeNull();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(live(container)).toBe("Verifying...");

    await act(async () => settle.resolve(lookupResult("minecraft", "Notch")));

    expect(live(container)).toBe("Notch (verified)");
  });

  it("adopts the canonical casing and reports the account key", async () => {
    const { getByText, onCommit, type, press } = setup({ autoEdit: true });

    type("notch");
    press("Enter");
    await act(async () => settle.resolve(lookupResult("minecraft", "Notch")));

    expect(getByText("Notch")).toBeTruthy();
    expect(onCommit).toHaveBeenLastCalledWith("Notch", MOJANG_UUID);
  });

  /**
   * A failed lookup is not a row state. The name is still the child's answer, so
   * it is committed as unverified, and the reason is a sentence next to it.
   */
  it("saves an unconfirmed name as unverified and says why", async () => {
    const { container, getByText, onCommit, type, press } = setup({
      autoEdit: true,
    });

    type("zzqnotreal99812");
    press("Enter");
    await act(async () =>
      settle.reject(new Error("Minecraft account not found.")),
    );

    expect(getByText("Minecraft account not found.")).toBeTruthy();
    expect(live(container)).toBe("zzqnotreal99812 (not yet verified)");
    expect(onCommit).toHaveBeenLastCalledWith("zzqnotreal99812", null);
  });

  // Nothing shaped like this can exist on the platform, so there is nothing to
  // look up — but the answer is still saved rather than silently dropped.
  it("skips the lookup for a name the platform could never have", () => {
    const { onCommit, type, press, getByText } = setup({
      platform: "roblox",
      autoEdit: true,
    });

    // Two underscores: valid on Minecraft, impossible on Roblox.
    type("a_b_c");
    press("Enter");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(getByText("Roblox account not found.")).toBeTruthy();
    expect(onCommit).toHaveBeenLastCalledWith("a_b_c", null);
  });

  it("commits null when the editor is cleared, and runs no lookup", () => {
    const { onCommit, type, press, openEditor } = setup({
      initialUsername: "Notch",
      initialExternalId: MOJANG_UUID,
    });

    openEditor();
    type("   ");
    press("Enter");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenLastCalledWith(null, null);
  });

  /**
   * The row is controlled, and a caller's write is a mutation, an invalidation
   * and a refetch away from handing the new name back. Between the two it must
   * keep showing what was committed — otherwise the sequence a person sees is
   * "NewName", spinner, **"OldName"**, "NewName", and the flash of the old name
   * reads as the save having failed.
   *
   * Needs the deferred harness: a synchronous one stores the value before the
   * row can render once, which is precisely why this went unnoticed.
   */
  it("keeps the committed name on screen while the caller's write is in flight", async () => {
    const { container, type, press } = setup({
      initialUsername: "OldName",
      initialExternalId: MOJANG_UUID,
      deferCommit: true,
    });

    const pencil = container.querySelector("button");
    if (!pencil) throw new Error("the pencil never rendered");
    fireEvent.click(pencil);

    type("newname");
    press("Enter");
    await act(async () => settle.resolve(lookupResult("minecraft", "NewName")));

    // The lookup has landed and the caller has been told, but has not stored it.
    expect(container.textContent).toContain("NewName");
    expect(container.textContent).not.toContain("OldName");

    await act(async () => {
      settleCommit();
    });

    expect(container.textContent).toContain("NewName");
  });

  // A refused write means nothing was stored, so the row stops claiming the new
  // name and goes back to the truth. It adds no message of its own — the surface
  // that refused owns that explanation.
  it("falls back to the stored name when the caller refuses the write", async () => {
    const { container, type, press } = setup({
      initialUsername: "OldName",
      initialExternalId: MOJANG_UUID,
      deferCommit: true,
    });

    const pencil = container.querySelector("button");
    if (!pencil) throw new Error("the pencil never rendered");
    fireEvent.click(pencil);

    type("newname");
    press("Enter");
    await act(async () => settle.resolve(lookupResult("minecraft", "NewName")));
    expect(container.textContent).toContain("NewName");

    await act(async () => {
      failCommit();
    });

    expect(container.textContent).toContain("OldName");
    expect(container.textContent).not.toContain("NewName");
  });

  // Both paths that never reach a lookup used to leave the previous name on
  // screen, because only the in-flight path put anything on hold.
  it("shows a name the platform could never have, without waiting for the caller", () => {
    const { container, type, press } = setup({
      platform: "roblox",
      initialUsername: "builderman",
      initialExternalId: 156,
      deferCommit: true,
    });

    const pencil = container.querySelector("button");
    if (!pencil) throw new Error("the pencil never rendered");
    fireEvent.click(pencil);

    type("a_b_c");
    press("Enter");

    expect(container.textContent).toContain("a_b_c");
    expect(container.textContent).not.toContain("builderman");
  });

  it("shows the cleared state immediately, without waiting for the caller", () => {
    const { container, type, press } = setup({
      initialUsername: "OldName",
      initialExternalId: MOJANG_UUID,
      deferCommit: true,
    });

    const pencil = container.querySelector("button");
    if (!pencil) throw new Error("the pencil never rendered");
    fireEvent.click(pencil);

    type("   ");
    press("Enter");

    expect(container.textContent).not.toContain("OldName");
    expect(container.textContent).toContain("(Unknown)");
  });

  /**
   * The stale-response guard. The editor can be reopened and re-committed while
   * a lookup is still out, so a landed result has to prove it is still the one
   * the row is waiting for — otherwise it overwrites a newer name, or pins an
   * old failure on it.
   */
  it("discards a result the row no longer owns", async () => {
    const { container, onCommit, type, press, openEditor } = setup({
      autoEdit: true,
    });

    type("notch");
    press("Enter");
    const first = settle;

    // Second commit, while the first is still out.
    openEditor();
    type("jeb_");
    press("Enter");
    onCommit.mockClear();

    await act(async () => first.resolve(lookupResult("minecraft", "Notch")));

    // The first answer is thrown away entirely — no commit, no name change, and
    // the newer flight keeps its spinner.
    expect(onCommit).not.toHaveBeenCalled();
    expect(live(container)).toBe("Verifying...");
  });

  /** The draft is seeded on open rather than held across closes, so cancelling really discards. */
  it("discards the draft on Escape and reseeds from the account next time", () => {
    const { container, onCommit, input, type, press, openEditor } = setup({
      initialUsername: "Notch",
    });

    openEditor();
    type("abandoned");
    press("Escape");

    expect(onCommit).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();

    openEditor();
    expect(input()?.value).toBe("Notch");
  });

  it("seeds an empty draft when there is no username yet", () => {
    const { input } = setup({ autoEdit: true });

    expect(input()?.value).toBe("");
  });

  // On a surface listing several people, "Edit Minecraft username" eight times
  // names nobody; on a settings page the answer is "yours" and a name is noise.
  it("names the person in the pencil's label only when it was given one", () => {
    const named = setup({ initialUsername: "Notch", personName: "Aino" });
    expect(named.pencil()?.getAttribute("aria-label")).toBe(
      "Edit Minecraft username for Aino",
    );
    named.unmount();

    const anonymous = setup({ initialUsername: "Notch" });
    expect(anonymous.pencil()?.getAttribute("aria-label")).toBe(
      "Edit Minecraft username",
    );
  });

  it("derives the resting status from the account, with no caller saying so", () => {
    const verified = setup({
      initialUsername: "Notch",
      initialExternalId: MOJANG_UUID,
    });
    expect(live(verified.container)).toBe("Notch (verified)");
    verified.unmount();

    const unverified = setup({ initialUsername: "Notch" });
    expect(live(unverified.container)).toBe("Notch (not yet verified)");
    unverified.unmount();

    const unknown = setup();
    expect(live(unknown.container)).toBe("");
  });
});
