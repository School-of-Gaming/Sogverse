/**
 * A checkout's local stack identity, derived from its path. It is shared by
 * every script that has to find the stack (`scripts/local-db.mjs`, which
 * starts it, and `scripts/test-db-local.mjs`, which tests against it), so the
 * two can never disagree about its name: a copy that drifts starts a stack
 * under one name and looks for it under another.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * The CLI silently cuts a project id to 40 characters when it names the
 * containers, and the shell files address those containers by the id they
 * were handed — so an id longer than that starts a stack no script can ever
 * find again. The hash and the `-gen` suffix `generate` appends are fixed, so
 * the label is what gives way: a long worktree name loses its tail rather than
 * its hash, because the hash is the half that keeps two checkouts apart.
 */
const PROJECT_ID_MAX_LENGTH = 40;
const HASH_LENGTH = 6;
const LABEL_MAX_LENGTH = PROJECT_ID_MAX_LENGTH - '-'.length - HASH_LENGTH - '-gen'.length;

/**
 * @param {string} checkout the checkout's Windows path
 * @param {string} checkoutWsl the same path as WSL sees it — what the hash is over
 * @returns {{ projectId: string, digest: Buffer }} the digest also seeds the
 *   checkout's port block
 */
export function stackIdentity(checkout, checkoutWsl) {
  const digest = createHash('sha256').update(checkoutWsl).digest();
  const slug = path.basename(checkout).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fullLabel = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
  const label = fullLabel.slice(0, LABEL_MAX_LENGTH).replace(/-+$/g, '');
  return { projectId: `${label}-${digest.toString('hex').slice(0, HASH_LENGTH)}`, digest };
}
