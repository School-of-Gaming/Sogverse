import type { Dispatch, SetStateAction } from "react";
import type { GameAccountStatus, GamePlatform } from "@/components/game-account";

/**
 * What saving a roster member's game username *does* between the box and the
 * write — the platform dispatch, and the three-state status the row reads back
 * — held **once**, for every shell that mounts the group workspace.
 *
 * Two shells bind this: the gedu's own workspace and the admin group details
 * page that renders the same body. They bind differently-keyed mutations, but
 * what happens between a typed name and those mutations is not a per-surface
 * decision — it is the rules below, and a second copy of them is a second place
 * for the checking/verified/unverified machine to drift until a gedu and an
 * admin correcting the same child get different answers out of it. Same split
 * `session-entry-saves.ts` makes, for the same reason.
 *
 * The rules:
 *
 * - **The platform is the product's, not the row's.** One roster shows one
 *   identity, so there is no per-child question to ask. A product whose topic
 *   names no platform renders no editor at all, so this cannot be reached with a
 *   null one — and it returns quietly rather than throwing if it somehow is,
 *   because a roster row is not the place to surface a programming error.
 * - **`verified` is read off what came back, never guessed.** The route resolves
 *   the name upstream and stores the account key beside it, so presence of that
 *   key is the whole of "verified" — nothing reads its *value*, which is how a
 *   dashed Mojang UUID and a Roblox integer share one branch without being
 *   pretended to be one value space. A name the platform does not know lands
 *   `unverified`, with the name still saved.
 * - **A clear needs no lookup and no status at all**, and a **refused write says
 *   nothing about the name** — both drop the row's entry so it falls back to
 *   whatever its account says, rather than claiming a failed check. The refusal
 *   is rethrown, because the row's own editor is what reports it.
 */

/** The two writes, structurally as both surfaces' React Query hooks hand them back. */
export interface GameUsernameSaveMutations {
  updateMinecraft: {
    mutateAsync: (vars: {
      gamerId: string;
      minecraftUsername: string | null;
    }) => Promise<{ minecraft_uuid: string | null }>;
  };
  updateRoblox: {
    mutateAsync: (vars: {
      gamerId: string;
      robloxUsername: string | null;
    }) => Promise<{ roblox_user_id: number | null }>;
  };
}

export interface GameUsernameSaveArgs extends GameUsernameSaveMutations {
  /** The product's game identity, or `null` for a topic that names none. */
  platform: GamePlatform | null;
  /**
   * The shell's own status state. It lives with whoever owns the save because
   * that is the only place that knows a check started, and the body takes the
   * resulting record as a prop.
   */
  setGameStatuses: Dispatch<SetStateAction<Record<string, GameAccountStatus>>>;
}

/**
 * Bind the roster's username save to one product's platform and one surface's
 * mutations.
 *
 * Called during render on both surfaces, exactly where the inline handler used
 * to be written.
 */
export function createGameUsernameSave({
  platform,
  updateMinecraft,
  updateRoblox,
  setGameStatuses,
}: GameUsernameSaveArgs): (gamerId: string, username: string) => Promise<void> {
  return async (gamerId, username) => {
    if (platform === null) return;
    const trimmed = username.trim();
    const value = trimmed.length === 0 ? null : trimmed;

    /** The write for this product's platform, answering with the stored key. */
    const save = async (): Promise<string | number | null> =>
      platform === "minecraft"
        ? (
            await updateMinecraft.mutateAsync({
              gamerId,
              minecraftUsername: value,
            })
          ).minecraft_uuid
        : (await updateRoblox.mutateAsync({ gamerId, robloxUsername: value }))
            .roblox_user_id;

    if (value === null) {
      await save();
      setGameStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      return;
    }

    setGameStatuses((prev) => ({ ...prev, [gamerId]: "checking" }));
    try {
      const externalId = await save();
      setGameStatuses((prev) => ({
        ...prev,
        [gamerId]: externalId === null ? "unverified" : "verified",
      }));
    } catch (error) {
      // A refused write says nothing about the name, so the row goes back to
      // whatever its account says rather than claiming a failed check.
      setGameStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      throw error;
    }
  };
}
