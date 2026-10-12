import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request to the notification sync route carries this environment's
 * `SUBSTITUTION_SYNC_SECRET` as its bearer token.
 *
 * The callers are the database's own — `pg_net` on a write and the `pg_cron`
 * retry, both reading the secret from Vault — and the local drain script, so
 * there is no session to check, only the shared secret. **An unset secret
 * refuses everything**: an environment that has not been given one has no
 * caller to admit. Both sides are hashed before the constant-time compare, so
 * neither the compare nor its length check says anything about the secret.
 */
export function verifySubstitutionSyncRequest(request: Request): boolean {
  const secret = process.env.SUBSTITUTION_SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (match === null) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
