/**
 * Registers slash commands with Discord, on the staging app by default.
 *   npx tsx scripts/register-discord-command.ts                # staging app
 *   npx tsx scripts/register-discord-command.ts --production   # prod app
 *
 * Reads DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN from .env.local, or their
 * _PRODUCTION counterparts with --production.
 */

import fs from "fs";
import path from "path";

// Load .env.local manually since this runs outside Next.js
const envPath = path.join(process.cwd(), ".env.local");
const envFile = fs.readFileSync(envPath, "utf-8");
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex);
  const value = trimmed.slice(eqIndex + 1);
  process.env[key] = value;
}

const suffix = process.argv.includes("--production") ? "_PRODUCTION" : "";
const APP_ID = process.env[`DISCORD_APPLICATION_ID${suffix}`];
const BOT_TOKEN = process.env[`DISCORD_BOT_TOKEN${suffix}`];

if (!APP_ID || !BOT_TOKEN) {
  console.error(`Missing DISCORD_APPLICATION_ID${suffix} or DISCORD_BOT_TOKEN${suffix} in .env.local`);
  process.exit(1);
}

const commands = [
  {
    name: "geduguru",
    description: "Kysy kysymys Gedu Gurulta",
    type: 1,
    options: [
      {
        name: "kysymys",
        description: "Kysymyksesi",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "happinappi",
    description: "Paina Happinappia ja saat happea!",
    type: 1,
    options: [
      {
        name: "viesti",
        description: "Sano jotain Happinapille",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "reset-password",
    description: "Reset a Minecraft Education account password",
    type: 1,
    options: [
      {
        name: "usernames",
        description: "One or more usernames, separated by spaces (e.g. sog5461 sog5113)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "link",
    description: "Connect your Discord account to your School of Gaming account",
    type: 1,
  },
];

async function register() {
  // Bulk overwrite all commands at once
  const response = await fetch(
    `https://discord.com/api/v10/applications/${APP_ID}/commands`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${BOT_TOKEN}`,
      },
      body: JSON.stringify(commands),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to register commands:", error);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`Registered ${result.length} commands on app ${APP_ID}:`, result.map((c: { name: string }) => `/${c.name}`).join(", "));
}

register();
