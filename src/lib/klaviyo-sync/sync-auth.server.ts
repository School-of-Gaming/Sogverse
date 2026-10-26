import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request to the Klaviyo sync route carries this environment's
 * `KLAVIYO_SYNC_SECRET` as its bearer token.
 *
 * The caller is the database's own `pg_net`, on a write or when an observation
 * finds a row due, reading the secret from Vault — so there is no session to
 * check, only the shared secret. **An unset secret refuses everything**: an
 * environment that has not been given one has no caller to admit. Both sides
 * are hashed before the constant-time compare, so neither the compare nor its
 * length check says anything about the secret.
 */
export function verifyKlaviyoSyncRequest(request: Request): boolean {
  const secret = process.env.KLAVIYO_SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (match === null) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
