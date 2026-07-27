import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { lookupMinecraftUser } from "@/lib/mojang";
import { verifyMinecraftQuery } from "@/services/minecraft/minecraft.contracts";

/**
 * GET /api/minecraft/verify — a read-only passthrough to Mojang's public
 * username→UUID API (no database access, no secrets).
 *
 * The public educator registration page verifies a Minecraft username before
 * any account exists, so this cannot require a session. The shared username
 * field uses it from authenticated pages too.
 */
export const GET = defineRoute({
  posture: "public",
  reason:
    "a read-only passthrough to Mojang's public username lookup — no database access and no secrets. The public educator registration page checks a username before any account exists, so it cannot require a session",
  // The username used to be read off the URL and checked by hand; the query
  // slot is the same rule declared where the rest of the surface declares it.
  query: verifyMinecraftQuery,

  handler: async ({ query }) => {
    const profile = await lookupMinecraftUser(query.username);
    if (!profile) {
      return NextResponse.json(
        { error: "No Minecraft account found with that username" },
        { status: 404 },
      );
    }
    return profile;
  },
});
