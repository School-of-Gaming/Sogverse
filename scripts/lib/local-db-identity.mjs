/**
 * A checkout's local database identities, derived from its path. Every script
 * that has to find one of them derives it here, so no two can disagree about a
 * name: a copy that drifts starts a database under one name and looks for it
 * under another.
 *
 * A checkout has three, because three of its databases can be up at once: its
 * long-lived stack, the throwaway one `generate` builds types from, and the
 * throwaway one the DB tests run against. Each clears the slate by removing
 * whatever holds its own id before it starts, so two sharing an id would
 * destroy one another — and generating types or running the tests is exactly
 * what you do while the stack is up.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

/** What a throwaway database's id adds to the stack's. */
const TRANSIENT_SUFFIXES = { generate: '-gen', test: '-tst' };

/**
 * The CLI silently cuts a project id to 40 characters when it names the
 * containers, and the shell files address those containers by the id they
 * were handed — so an id longer than that starts a database no script can ever
 * find again. The hash and the suffixes are fixed, so the label is what gives
 * way: a long worktree name loses its tail rather than its hash, because the
 * hash is the half that keeps two checkouts apart.
 */
const PROJECT_ID_MAX_LENGTH = 40;
const HASH_LENGTH = 6;
const LONGEST_SUFFIX = Math.max(...Object.values(TRANSIENT_SUFFIXES).map((suffix) => suffix.length));
const LABEL_MAX_LENGTH = PROJECT_ID_MAX_LENGTH - '-'.length - HASH_LENGTH - LONGEST_SUFFIX;

/**
 * @param {string} checkout the checkout's Windows path
 * @param {string} checkoutWsl the same path as WSL sees it — what the hash is over
 * @returns {{ projectId: string, generateId: string, testId: string }}
 */
export function stackIdentity(checkout, checkoutWsl) {
  const digest = createHash('sha256').update(checkoutWsl).digest();
  const slug = path.basename(checkout).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fullLabel = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
  const label = fullLabel.slice(0, LABEL_MAX_LENGTH).replace(/-+$/g, '');
  const projectId = `${label}-${digest.toString('hex').slice(0, HASH_LENGTH)}`;
  return {
    projectId,
    generateId: `${projectId}${TRANSIENT_SUFFIXES.generate}`,
    testId: `${projectId}${TRANSIENT_SUFFIXES.test}`,
  };
}
