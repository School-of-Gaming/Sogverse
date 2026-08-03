import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { lookupRobloxProfile } from "@/lib/roblox";
import {
  robloxProfileResponse,
  verifyRobloxQuery,
} from "@/services/roblox/roblox.contracts";

/**
 * GET /api/roblox/verify — a read-only passthrough to Roblox's public
 * username→account and account→avatar APIs (no database access, no secrets).
 *
 * It exists as a route rather than a browser call because **neither Roblox API
 * is reachable from a browser**: the users endpoint refuses the CORS preflight
 * and the thumbnails endpoint sends no `access-control-*` headers at all. Doing
 * both hops here also keeps the thumbnail service — rate limited to 60 requests
 * a minute per IP — off the client entirely, and answers with everything the UI
 * needs in one round trip.
 */
export const GET = defineRoute({
  posture: "public",
  reason:
    "a read-only passthrough to Roblox's public username lookup — no database access and no secrets. It mirrors the Minecraft verify route: a username is checked before any account exists, so it cannot require a session",
  query: verifyRobloxQuery,
  response: robloxProfileResponse,

  handler: async ({ query }) => {
    const profile = await lookupRobloxProfile(query.username);
    if (!profile) {
      return NextResponse.json(
        { error: "No Roblox account found with that username" },
        { status: 404 },
      );
    }
    return profile;
  },
});
