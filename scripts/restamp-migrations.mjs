#!/usr/bin/env node
/**
 * Restamp this branch's migrations to landing time.
 *
 *   node scripts/restamp-migrations.mjs             # rename them
 *   node scripts/restamp-migrations.mjs --dry-run   # print the mapping only
 *
 * A migration's version is a timestamp, and the timestamp that counts is the
 * one taken at landing rather than the one taken when the file was written.
 * Landing is serialized through one human, so that moment *is* the queue
 * position: a branch stamped as it lands can never take a version another
 * branch already used, however long it sat unmerged, and the versions on the
 * database go up in the order the work actually arrived.
 *
 * So it renames the migrations this branch adds relative to `origin/dev` —
 * every one of them, whatever version they carry now, because a stamp minted
 * on the day the file was written is exactly the stale number this exists to
 * replace. Their relative order is kept: they are sorted by the name they have
 * today, which is the order the CLI would apply them in, and handed
 * consecutive seconds from now.
 *
 * It renames and nothing else. Regenerating the types is the next step of the
 * landing procedure and deliberately not this script's business — the rename
 * is what has to be atomic with the human's decision to land, and a generate
 * bolted on here would make a dry run impossible to trust.
 *
 * Migrations already on `origin/dev` are never touched: they are applied
 * history, and the five-digit versions among them sort ahead of every
 * timestamp on their own.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stamp } from './lib/migration-version.mjs';

const MIGRATIONS_DIR = 'supabase/migrations';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
// The checkout is found from this file's own location, so a run from any
// worktree or from the main checkout targets that checkout's migrations.
const checkout = path.dirname(scriptsDir);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const unknown = args.find((a) => a !== '--dry-run');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (unknown) fail(`Unknown argument ${unknown}. The only flag is --dry-run.`);

const git = (...gitArgs) =>
  execFileSync('git', gitArgs, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const lines = (text) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

/* ------------------------------------------- what this branch adds, and only */

console.log('Fetching origin/dev…');
try {
  git('fetch', 'origin', 'dev');
} catch (error) {
  fail(`Could not fetch origin/dev, so there is nothing to compare against:\n${String(error.stderr || error.message)}`);
}

/** Added in a commit on this branch since it left `origin/dev`. */
const committed = lines(
  git('diff', '--name-only', '--diff-filter=A', 'origin/dev...HEAD', '--', `${MIGRATIONS_DIR}/`),
);

/**
 * The same question for the working tree, so the script is as usable before
 * the branch's last commit as after it. Everything else the status reports
 * under migrations/ is a modification, a deletion or a rename of a file this
 * branch did not add — which on a branch about to land means a migration that
 * is already history somewhere has been edited, and that is a stop.
 */
const uncommitted = [];
const suspect = [];
for (const line of lines(git('status', '--porcelain', '--', `${MIGRATIONS_DIR}/`))) {
  const code = line.slice(0, 2);
  const paths = line
    .slice(3)
    .split(' -> ')
    .map((p) => p.replace(/^"|"$/g, ''));
  const added = code === '??' || code.startsWith('A');
  if (added && paths.length === 1) uncommitted.push(paths[0]);
  else suspect.push(...paths.map((p) => `${code.trim() || '??'}  ${p}`));
}

const allAdds = [...new Set([...committed, ...uncommitted])].filter((file) => file.endsWith('.sql'));

/**
 * The squash is the one branch that adds five-digit files on purpose: a
 * baseline keeps the versions of the files it replaces, so every environment
 * that applied the old history already records them. It is recognised the way
 * the `migration-order` job recognises it, by the numbered files the same
 * branch deletes, and its numbered adds are left alone; restamping a baseline
 * to a timestamp would put it above the migrations it is meant to precede.
 */
const deletesNumbered = lines(
  git('diff', '--name-only', '--diff-filter=D', '--no-renames', 'origin/dev...HEAD', '--', `${MIGRATIONS_DIR}/`),
).some((file) => /\/\d{5}_[^/]+\.sql$/.test(file));
const isNumbered = (file) => /\/\d{5}_[^/]+\.sql$/.test(file);
const baselines = deletesNumbered ? allAdds.filter(isNumbered) : [];
for (const file of baselines) {
  console.log(`  ${path.basename(file)}  kept as the squash's baseline (numbered files are deleted alongside it)`);
}
const branchAdds = allAdds.filter((file) => !baselines.includes(file));

// A modification of a file this branch adds itself is ordinary work in
// progress; a modification of anything else under migrations/ is not.
const outsiders = suspect.filter((entry) => !branchAdds.some((file) => entry.endsWith(file)));
if (outsiders.length > 0) {
  fail(
    'The working tree has uncommitted changes to migrations this branch did not add:\n' +
      outsiders.map((entry) => `  ${entry}`).join('\n') +
      '\n\nLanding restamps a clean, synced branch. Commit or revert these first.',
  );
}

if (branchAdds.length === 0) {
  console.log('This branch adds no migrations relative to origin/dev. Nothing to restamp.');
  process.exit(0);
}

/* --------------------------------------------------------------- the stamps */

/**
 * The highest version `origin/dev` already holds, which every stamp minted
 * below has to sort above. String comparison is the CLI's own ordering, which
 * is also why the original five-digit versions sort below every timestamp.
 */
const devHighest = lines(git('ls-tree', '--name-only', 'origin/dev', '--', `${MIGRATIONS_DIR}/`))
  .map((file) => path.basename(file).split('_')[0])
  .filter((version) => /^\d+$/.test(version))
  .reduce((highest, version) => (version > highest ? version : highest), '');

// Sorted by the name each file carries today, which is the order the CLI would
// apply them in, then handed a second each so that order survives the rename.
const ordered = [...branchAdds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const startedAt = Date.now();

const renames = ordered.map((file, index) => {
  const name = path.basename(file);
  // Added in a commit and since deleted in the working tree: the branch is not
  // in the state it means to land in, and that is the human's call, not ours.
  if (!existsSync(path.join(checkout, file))) fail(`${file} is committed on this branch but missing from the working tree.`);
  const underscore = name.indexOf('_');
  if (underscore <= 0) {
    fail(`${file} has no descriptive part to keep — a migration is named <version>_<what it does>.sql.`);
  }
  return { from: file, to: `${MIGRATIONS_DIR}/${stamp(startedAt + index * 1000)}_${name.slice(underscore + 1)}` };
});

// A clock behind dev's newest stamp mints versions that land *below* history,
// and nothing here would notice: the branch would merge, staging would refuse
// the file, and only the migration-order job would say so — after the merge. So
// the first stamp is checked against dev before anything is renamed.
const firstStamp = path.basename(renames[0].to).split('_')[0];
if (devHighest !== '' && !(firstStamp > devHighest)) {
  fail(
    `The first landing stamp would be ${firstStamp}, which does not sort above ${devHighest} — the highest\n` +
      "version origin/dev already holds. This machine's clock is behind dev's newest stamp, so the renamed\n" +
      'migrations would sort below history: a database applies migrations in version order, staging would\n' +
      'refuse them, and only the migration-order job would report it, after the merge. Nothing was renamed.',
  );
}

const collisions = renames
  .map((rename) => rename.to)
  .filter((to, index, all) => all.indexOf(to) !== index);
if (collisions.length > 0) {
  fail(`Two migrations would be renamed to the same file:\n${[...new Set(collisions)].map((c) => `  ${c}`).join('\n')}`);
}

const occupied = renames.filter(
  (rename) => rename.from !== rename.to && existsSync(path.join(checkout, rename.to)),
);
if (occupied.length > 0) {
  fail(
    'A migration would be renamed over a file that already exists:\n' +
      occupied.map((rename) => `  ${rename.to}`).join('\n'),
  );
}

/* -------------------------------------------------------------- the renames */

const tracked = new Set(lines(git('ls-files', '--', `${MIGRATIONS_DIR}/`)));

for (const { from, to } of renames) {
  if (from === to) {
    console.log(`  ${path.basename(from)}  (already at its landing stamp)`);
    continue;
  }
  console.log(`  ${path.basename(from)}  ->  ${path.basename(to)}`);
  if (dryRun) continue;
  // `git mv` for a tracked file so the rename is staged with the rest of the
  // landing commit; a plain rename for one git has never seen.
  if (tracked.has(from)) git('mv', from, to);
  else renameSync(path.join(checkout, from), path.join(checkout, to));
}

console.log(
  dryRun
    ? `\n${renames.length} migration(s) would be restamped. Nothing was renamed (--dry-run).`
    : `\n${renames.length} migration(s) restamped. Regenerate the types before committing.`,
);
