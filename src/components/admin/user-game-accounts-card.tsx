"use client";

import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GAME_PLATFORMS, GameAccountField } from "@/components/game-account";
import { useMinecraftAccount } from "@/services/minecraft";
import { useRobloxAccount } from "@/services/roblox";
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
 *
 * This card is a *composition* and owns no save logic of its own: each field is
 * the shared one, which brings the row, its picture and its failure sentence
 * with it. All this page adds is which mutation to call and where the two sit.
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-act" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Side by side from `sm`: this is an admin surface, and two identity
            rows stacked down the middle of a wide page is the layout the
            desktop-default rule exists to prevent.

            A failure sentence belongs to its own column rather than to the card,
            which is what the shared field gives us — with two columns, one slot
            at the bottom would make an admin work out which of the two it was
            about, even though the sentence names the platform. */}
        <div className="grid gap-6 sm:grid-cols-2">
          <GameAccountField
            platform="minecraft"
            label={g("label", { platform: GAME_PLATFORMS.minecraft.name })}
            personName={personName}
            username={minecraft?.minecraft_username ?? null}
            externalId={minecraft?.minecraft_uuid ?? null}
            // The discriminated union is what keeps each platform's format rule
            // attached to its own branch, all the way to the route's schema.
            onSave={(username) =>
              updateGameAccount.mutateAsync({
                userId,
                edit: { platform: "minecraft", username },
              })
            }
          />
          <GameAccountField
            platform="roblox"
            label={g("label", { platform: GAME_PLATFORMS.roblox.name })}
            personName={personName}
            username={roblox?.roblox_username ?? null}
            externalId={roblox?.roblox_user_id ?? null}
            onSave={(username) =>
              updateGameAccount.mutateAsync({
                userId,
                edit: { platform: "roblox", username },
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
