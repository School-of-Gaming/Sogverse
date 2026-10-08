/**
 * Drains the substitution notification outbox of a running Sogverse — by
 * default the local dev server, whose database has no Vault secrets and so
 * never calls the sync route itself.
 *
 *   npx tsx scripts/drain-substitution-notifications.ts                         # http://localhost:3000
 *   npx tsx scripts/drain-substitution-notifications.ts http://localhost:3001   # another server
 *
 * Calls POST /api/substitution-notifications/sync with SUBSTITUTION_SYNC_SECRET
 * as its bearer token, read from the shell or from `.env.local` (the shell
 * wins). The route answers 202 at once and drains after it, so this reports
 * only that the drain was started: its outcome is in the server's log, and in
 * the DMs and the Slack message themselves. Writes nothing to disk.
 */

import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const secret = process.env.SUBSTITUTION_SYNC_SECRET;
if (!secret) {
  console.error("Missing SUBSTITUTION_SYNC_SECRET — set it in the shell or in .env.local");
  process.exit(1);
}

const base = process.argv[2] ?? "http://localhost:3000";
const url = new URL("/api/substitution-notifications/sync", base);

const response = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});

if (response.status !== 202) {
  console.error(`${url} answered ${response.status}: ${await response.text()}`);
  process.exit(1);
}
console.log(`Drain started on ${url.origin}; its outcome is in the server's log.`);
