import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";

export async function PATCH(request: Request) {
  try {
    const result = await requireRole(["gamer", "gedu"], {
      forbiddenMessage: "Only gamers and gedus can update their Minecraft username",
    });
    if (result instanceof NextResponse) return result;

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

    const admin = createAdminClient();
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

    const { error } = await admin
      .from("minecraft_accounts")
      .upsert(upsertData, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
