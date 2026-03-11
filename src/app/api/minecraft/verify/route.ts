import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";

export async function GET(request: Request) {
  try {
    const result = await requireRole(["customer", "gamer"], {
      forbiddenMessage: "Not authorized",
    });
    if (result instanceof NextResponse) return result;

    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username || !isValidMinecraftUsername(username)) {
      return NextResponse.json(
        { error: "Invalid username. Must be 3-16 characters: letters, numbers, underscores." },
        { status: 400 },
      );
    }

    const profile = await lookupMinecraftUser(username);
    if (!profile) {
      return NextResponse.json(
        { error: "No Minecraft account found with that username" },
        { status: 404 },
      );
    }

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
