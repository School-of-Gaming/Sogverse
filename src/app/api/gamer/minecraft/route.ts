import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";

export async function PATCH(request: Request) {
  try {
    const result = await requireRole("gamer", {
      forbiddenMessage: "Only gamers can update their Minecraft username",
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
    let update: { minecraft_username: string | null; minecraft_uuid: string | null };

    if (minecraftUsername === null) {
      update = { minecraft_username: null, minecraft_uuid: null };
    } else {
      const mojang = await lookupMinecraftUser(minecraftUsername);
      update = {
        minecraft_username: minecraftUsername,
        minecraft_uuid: mojang?.uuid ?? null,
      };
    }

    const { error } = await admin
      .from("gamer_profiles")
      .update(update)
      .eq("user_id", result.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...update });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
