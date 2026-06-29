import { NextResponse } from "next/server";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";

// Public, unauthenticated: a read-only passthrough to Mojang's public
// username→UUID API (no DB access, no secrets). The public gedu registration
// page (/register-gedu) verifies a Minecraft username before any account
// exists, so this can't require a session. The shared MinecraftUsernameField
// uses it from authed pages too.
export async function GET(request: Request) {
  try {
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
