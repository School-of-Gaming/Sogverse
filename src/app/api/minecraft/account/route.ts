import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";

/**
 * PATCH /api/minecraft/account — link (or unlink) the CALLER'S OWN Minecraft
 * account.
 *
 * Model B: the upsert runs on the user-bound client, so the
 * users_insert_own_minecraft_account / users_update_own_minecraft_account
 * policies re-derive the target row from `auth.uid()`. The row key is the
 * session's user id and is never read from the request, so there is no way to
 * name someone else's row here — and if that ever changed, RLS would refuse it.
 */
export async function PATCH(request: Request) {
  try {
    const result = await requireRole(["gamer", "gedu"], {
      forbiddenMessage: "Only gamers and gedus can update their Minecraft username",
    });
    if (result instanceof NextResponse) return result;
    const { supabase } = result;

    const { minecraftUsername } = await request.json();

    if (minecraftUsername !== null) {
      if (
        typeof minecraftUsername !== "string" ||
        !isValidMinecraftUsername(minecraftUsername)
      ) {
        return NextResponse.json(
          { error: "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores." },
          { status: 400 },
        );
      }
    }

    let upsertData: { user_id: string; minecraft_username: string | null; minecraft_uuid: string | null };

    if (minecraftUsername === null) {
      upsertData = { user_id: result.user.id, minecraft_username: null, minecraft_uuid: null };
    } else {
      const mojang = await lookupMinecraftUser(minecraftUsername);
      upsertData = {
        user_id: result.user.id,
        minecraft_username: minecraftUsername,
        minecraft_uuid: mojang?.uuid ?? null,
      };
    }

    const { error } = await supabase
      .from("minecraft_accounts")
      .upsert(upsertData, { onConflict: "user_id" });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This Minecraft account is already linked to another user" },
          { status: 409 },
        );
      }
      if (error.code === "42501") {
        return NextResponse.json(
          { error: "Not authorized to update this Minecraft account" },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "Failed to update Minecraft account" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      minecraft_username: upsertData.minecraft_username,
      minecraft_uuid: upsertData.minecraft_uuid,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
