#!/usr/bin/env node
/**
 * The local database, for the checkout this file sits in.
 *
 *   npm run db -- generate    # build a DB from migrations/, regenerate
 *                             # src/types/database.types.ts and
 *                             # supabase/schema/, remove the DB
 *
 * The database runs in the WSL distro, because that is where Docker lives on
 * this machine. **This script is the only thing that knows that.** Every
 * caller — a person, an agent, a flow — goes through the npm script and never
 * touches the distro directly, so the day the database moves somewhere else
 * only this file changes.
 *
 * What lives here is the boundary and nothing else: locating the checkout,
 * reading the CLI pin, translating a Windows path, deriving the stack's
 * identity, and keeping the noise WSL writes to stderr out of the output. The
 * real work is the shell files in scripts/local-db/, run as files inside the
 * distro — crossing the boundary mangles `~`, rooted Linux paths, inline
 * environment assignments and anything with `$` or nested quotes, so only bare
 * words are passed across.
 *
 * Nothing it builds touches the repo: the CLI, the shadow workdir and the
 * generation output all live in the distro's own filesystem. The only things
 * written on the Windows side are the generated files themselves —
 * database.types.ts and supabase/schema/ — written from inside the distro so no
 * Windows shell text handling ever sees them.
 *
 * **Never restart WSL to fix a failure here.** The distro is shared with other
 * long-running work that a shutdown destroys. Restart the Docker service or
 * re-run the command; there is no `wsl --shutdown` or `wsl --terminate` in this
 * script and there must not be.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DISTRO = 'Ubuntu-24.04';

/**
 * Lines WSL and the CLI write to stderr on every run and that say nothing
 * about this run. The screen-size warning is emitted by the distro's init for
 * any invocation from a Windows shell; the CLI's upgrade notice is advice we
 * deliberately do not take, since the version is pinned in package.json and CI
 * pins the same one.
 */
const NOISE = [/screen size is bogus/i, /A new version of Supabase CLI is available/i];

const COMMANDS = ['generate'];

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
// The checkout is found from this file's own location, so a run from any
// worktree or from the main checkout targets that checkout's supabase/.
const checkout = path.dirname(scriptsDir);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** `C:\Users\…\repo` -> `/mnt/c/Users/…/repo`. */
const toWslPath = (windowsPath) => {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) fail(`Cannot translate ${windowsPath} into a distro path.`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
};

const checkoutWsl = toWslPath(checkout);
if (/\s/.test(checkoutWsl)) {
  // An argument with a space cannot be quoted reliably through wsl.exe, and a
  // half-quoted path would land as two arguments and fail somewhere deep in a
  // shell file. Better to say so here.
  fail(`This checkout's path contains a space, which cannot be passed into the distro:\n  ${checkout}`);
}

const pkg = JSON.parse(readFileSync(path.join(checkout, 'package.json'), 'utf8'));
const cliVersion = pkg.devDependencies?.supabase;
if (!cliVersion || !/^\d+\.\d+\.\d+$/.test(cliVersion)) {
  fail(`package.json's supabase devDependency is not an exact version: ${String(cliVersion)}`);
}

/**
 * The stack's identity, derived from the checkout path so that it is the same
 * on every run of the same checkout and different for every other one — which
 * is all it takes for two checkouts to hold databases at once. Deriving beats
 * allocating free ports: a run that dies without cleaning up leaves a
 * container the next run of *this* checkout finds and removes, where a random
 * block would leave an orphan nobody goes looking for.
 *
 * The block sits above the default Linux ephemeral port range (32768-60999),
 * so an outbound connection cannot already be holding one of these.
 */
const digest = createHash('sha256').update(checkoutWsl).digest();
const slug = path.basename(checkout).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const label = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
const projectId = `${label}-${digest.toString('hex').slice(0, 6)}`;
const portBase = 61000 + (digest.readUInt16BE(0) % 40) * 100;

const command = process.argv[2];
if (!command || !COMMANDS.includes(command)) {
  fail(
    `Usage: npm run db -- <${COMMANDS.join('|')}>\n\n` +
      `  generate   Start a database from supabase/migrations/, write\n` +
      `             src/types/database.types.ts and supabase/schema/ from it,\n` +
      `             remove the database.`,
  );
}

/**
 * A stream of a child's output, forwarded line by line with the noise dropped.
 *
 * Both streams are piped rather than inherited, because filtering is the whole
 * point — and the CLI rewrites its progress in place with carriage returns, so
 * a plain `\n` split leaves half-overwritten lines in a captured log. Splitting
 * on either makes each update its own line.
 */
const lineFilter = (sink) => {
  let pending = '';
  const emit = (line) => {
    if (line.trim() !== '' && !NOISE.some((pattern) => pattern.test(line))) sink.write(`${line}\n`);
  };
  return {
    push: (chunk) => {
      const lines = (pending + chunk).split(/\r\n|\r|\n/);
      pending = lines.pop() ?? '';
      lines.forEach(emit);
    },
    flush: () => emit(pending),
  };
};

/**
 * Run one of the shell files inside the distro.
 *
 * A long-lived stack (a later `up`/`park`/`down`) needs a keep-alive session
 * held for as long as a database of this checkout's is running, so the stack
 * does not depend on a terminal staying open. It attaches here: the same
 * wsl.exe invocation, kept alive rather than awaited.
 */
const runInDistro = (shellFile, args) =>
  new Promise((resolve) => {
    const child = spawn(
      'wsl.exe',
      ['-d', DISTRO, '--', 'bash', `${checkoutWsl}/scripts/local-db/${shellFile}`, ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const streams = [
      [child.stdout, lineFilter(process.stdout)],
      [child.stderr, lineFilter(process.stderr)],
    ];
    for (const [source, filter] of streams) {
      source.setEncoding('utf8');
      source.on('data', (chunk) => filter.push(chunk));
    }

    child.on('error', () =>
      resolve({ code: 1, message: `Could not run wsl.exe. Is the ${DISTRO} distro installed?` }),
    );
    child.on('close', (code) => {
      for (const [, filter] of streams) filter.flush();
      resolve({ code: code ?? 1 });
    });
  });

const started = Date.now();
console.log(`${command}: ${projectId} on ports ${portBase}-${portBase + 99} (Supabase CLI ${cliVersion})`);

const { code, message } = await runInDistro(`${command}.sh`, [checkoutWsl, projectId, String(portBase), cliVersion]);
const seconds = ((Date.now() - started) / 1000).toFixed(0);

if (code !== 0) {
  // The shell file removes the database on its way out however it exits, so a
  // failed run leaves nothing behind to clear up by hand.
  fail(
    message ??
      `${command} failed after ${seconds}s. The database has been removed.\n\n` +
        `If Docker itself is wedged, restart the Docker service inside the distro —\n` +
        `never restart WSL, which would kill whatever else is running in there:\n` +
        `  wsl -d ${DISTRO} -u root -- systemctl restart docker`,
  );
}
console.log(`${command}: done in ${seconds}s`);
