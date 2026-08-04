"use client";

import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GAME_PLATFORMS,
  GameUsernameEditableRow,
  robloxAccountId,
  type GameAccountExternalId,
  type GamePlatform,
} from "@/components/game-account";
import { useMinecraftAccount } from "@/services/minecraft";
import { useRobloxAccount, useRobloxRender } from "@/services/roblox";
import { useUpdateUserGameAccount } from "@/services/users";
import type { MinecraftAccount, RobloxAccount } from "@/types";

/**
 * Both of a user's game identities on their admin detail page, editable in
 * place.
 *
 * **Why an admin can write these at all:** an admin is the person a family or a
 * game educator asks when a username is wrong and they cannot fix it themselves
 * — a child who cannot reach settings, an educator who typed a handle during
 * registration and moved on. The database has always allowed it (both tables
 * carry a `FOR ALL` admin policy over `is_admin()`); until now nothing in the UI
 * used that.
 *
 * **The RSC/client seam.** The page is a server component and already reads both
 * rows to render them, so it hands them down as `initial*` and this island seeds
 * its queries with them: the first frame is complete, with no client fetch to
 * wait on and nothing that arrives late enough to move anything. After a save
 * the mutation invalidates that platform's account query and the island refetches
 * itself — deliberately not `router.refresh()`, which would re-run every read on
 * the page (participations, linked accounts, the lot) to update two lines, and
 * would put a route transition between the click and the answer.
 */
export function UserGameAccountsCard({
  userId,
  personName,
  initialMinecraft,
  initialRoblox,
}: {
  userId: string;
  /** Whose account this is, for the pencil's accessible name. */
  personName: string;
  initialMinecraft: MinecraftAccount | null;
  initialRoblox: RobloxAccount | null;
}) {
  const t = useTranslations("admin.users.gameAccounts");
  const g = useTranslations("gameAccount");

  const { data: minecraft } = useMinecraftAccount(userId, {
    initialData: initialMinecraft,
  });
  const { data: roblox } = useRobloxAccount(userId, {
    initialData: initialRoblox,
  });
  const updateGameAccount = useUpdateUserGameAccount();

  // One banner for the card rather than one per row. The sentence names its own
  // platform, so a single slot at the bottom says everything two would — and it
  // sits below both rows, so the outcome of a save never pushes the row that was
  // just used.
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = async (platform: GamePlatform, username: string | null) => {
    setSuccess(null);
    setError(null);
    const name = GAME_PLATFORMS[platform].name;

    try {
      await updateGameAccount.mutateAsync({
        userId,
        // The discriminated union is what keeps each platform's format rule
        // attached to its own branch, all the way to the route's schema.
        edit:
          platform === "minecraft"
            ? { platform: "minecraft", username }
            : { platform: "roblox", username },
      });
      setSuccess(
        username
          ? g("saved", { platform: name })
          : g("cleared", { platform: name }),
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : g("saveFailed", { platform: name }),
      );
      // Rethrown after the banner is set: the row is awaiting this, and a silent
      // resolve would leave it showing a name nothing stored.
      throw err;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Side by side from `sm`: this is an admin surface, and two identity
            rows stacked down the middle of a wide page is the layout the
            desktop-default rule exists to prevent. */}
        <div className="grid gap-6 sm:grid-cols-2">
          <AdminGameAccountField
            platform="minecraft"
            personName={personName}
            username={minecraft?.minecraft_username ?? null}
            externalId={minecraft?.minecraft_uuid ?? null}
            onCommit={(username) => commit("minecraft", username)}
          />
          <AdminGameAccountField
            platform="roblox"
            personName={personName}
            username={roblox?.roblox_username ?? null}
            externalId={roblox?.roblox_user_id ?? null}
            onCommit={(username) => commit("roblox", username)}
          />
        </div>

        {success && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One platform's labelled row.
 *
 * Split out for a reason that is not tidiness: the Roblox render has to be
 * resolved with a hook, and a hook cannot be called inside the `.map` or the
 * conditional that a single inlined pair would have become. One component per
 * row means one hook call per row, unconditionally, which is the only shape the
 * rules of hooks allow.
 */
function AdminGameAccountField({
  platform,
  personName,
  username,
  externalId,
  onCommit,
}: {
  platform: GamePlatform;
  personName: string;
  username: string | null;
  externalId: GameAccountExternalId | null;
  onCommit: (username: string | null) => Promise<void>;
}) {
  const g = useTranslations("gameAccount");
  // `null` for Minecraft (the row derives its skin from the name) and for an
  // unverified Roblox handle (no id to resolve, and resolving the name instead
  // could draw whichever stranger owns it).
  const { data: render } = useRobloxRender(robloxAccountId(platform, externalId));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {g("label", { platform: GAME_PLATFORMS[platform].name })}
      </p>
      <GameUsernameEditableRow
        platform={platform}
        username={username}
        externalId={externalId}
        personName={personName}
        // Minecraft omits it and derives from the name; Roblox hands in what the
        // by-id lookup resolved, or `null` while it is in flight — the figure box
        // is already at its final size, so the picture lands without moving
        // anything.
        avatarUrl={platform === "roblox" ? (render?.avatarUrl ?? null) : undefined}
        onCommit={({ username: committed }) => onCommit(committed)}
      />
    </div>
  );
}
