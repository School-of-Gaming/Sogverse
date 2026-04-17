import path from "node:path";
import { config as loadEnv } from "dotenv";
import { BedrockPortal, Joinability, Modules } from "bedrock-portal";
import { Authflow, Titles } from "prismarine-auth";

loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseJoinability(raw: string | undefined): Joinability {
  switch (raw) {
    case "FriendsOnly":
      return Joinability.FriendsOnly;
    case "InviteOnly":
      return Joinability.InviteOnly;
    case "FriendsOfFriends":
    case undefined:
    case "":
      return Joinability.FriendsOfFriends;
    default:
      throw new Error(
        `Invalid PORTAL_JOINABILITY="${raw}". Use FriendsOfFriends | FriendsOnly | InviteOnly.`
      );
  }
}

async function main() {
  const serverIp = requireEnv("BEDROCK_SERVER_IP");
  const serverPort = Number(process.env.BEDROCK_SERVER_PORT ?? 19132);
  const worldName = process.env.PORTAL_WORLD_NAME ?? "Bedrock Portal";
  const hostName = process.env.PORTAL_HOST_NAME ?? "Portal";
  const joinability = parseJoinability(process.env.PORTAL_JOINABILITY);
  const username = requireEnv("PORTAL_ACCOUNT_USERNAME");
  const cacheDir = path.resolve(
    process.env.PORTAL_AUTH_CACHE_DIR ?? "./.auth-cache"
  );

  // prismarine-auth: device-code flow on first run. The console will print a
  // URL + code — sign in with the ALT Microsoft account in a browser. After
  // that, tokens are cached in cacheDir and refreshed automatically.
  const authflow = new Authflow(username, cacheDir, {
    authTitle: Titles.MinecraftNintendoSwitch,
    deviceType: "Nintendo",
    flow: "live",
  });

  const portal = new BedrockPortal({
    ip: serverIp,
    port: serverPort,
    joinability,
    host: authflow,
    world: {
      hostName,
      name: worldName,
      version: "1.21.0",
      memberCount: 1,
      maxMemberCount: 40,
    },
  });

  portal.use(Modules.AutoFriendAccept, { inviteOnAdd: true });

  portal.on("sessionCreated", () => {
    console.log(
      `[portal] session live — redirecting joins to ${serverIp}:${serverPort}`
    );
  });
  portal.on("playerJoin", (player) => {
    console.log(`[portal] player joined session: ${player.profile.gamertag ?? "unknown"}`);
  });
  portal.on("playerLeave", (player) => {
    console.log(`[portal] player left session: ${player.profile.gamertag ?? "unknown"}`);
  });
  portal.on("friendAdded", (friend) => {
    console.log(`[portal] friend added: ${friend.profile.gamertag ?? "unknown"}`);
  });

  await portal.start();
  console.log(
    `[portal] started as "${username}" | joinability=${process.env.PORTAL_JOINABILITY ?? "FriendsOfFriends"}`
  );
  console.log(
    "[portal] the alt account should now appear online in Minecraft; friends can join via its profile."
  );

  const shutdown = async (signal: string) => {
    console.log(`[portal] ${signal} received, stopping session…`);
    try {
      await portal.end();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[portal] fatal:", err);
  process.exit(1);
});
