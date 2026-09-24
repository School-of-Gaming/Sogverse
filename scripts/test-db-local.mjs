#!/usr/bin/env node
/**
 * The database tests, against this checkout's own local stack.
 *
 *   npm run test:db:local                          # the whole db/ suite
 *   npm run test:db:local -- tests/db/chat-rpcs.test.ts
 *   npm run test:db:local -- --stack <project-id>  # escape hatch, see below
 *
 * CI remains the authority: it builds a database from migrations/ and seed.sql
 * on every push. This is the same suite against the stack already on this
 * machine, so a DB test can be written and watched go red and green without a
 * round trip through a runner.
 *
 * It reads the URL and both keys OUT OF THE STACK — `supabase status` in the
 * stack's own shadow workdir — and never out of .env.local. .env.local is a
 * file `up` rewrites, `down` puts back and the owner sometimes edits, and a dev
 * server is usually reading it; a test run that took its target from there
 * would be testing whichever database that file happened to name.
 *
 * WHY TWO FILES. The stack lives in the WSL distro and the vitest run does not:
 * node_modules and the vitest binary are on the Windows side. So the distro
 * half is scripts/local-db/test-db.sh, run as a file inside the distro exactly
 * as the other local-database commands are — crossing the boundary mangles `~`,
 * rooted Linux paths and anything carrying `$` or nested quotes, so only bare
 * words are passed across — and this file is the Windows half that runs the
 * tests with what came back.
 *
 * **Never restart WSL to fix a failure here.** The distro is shared with other
 * long-running work that a shutdown destroys.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DISTRO = 'Ubuntu-24.04';

/** Lines WSL and the CLI write on every run that say nothing about this one. */
const NOISE = [/screen size is bogus/i, /A new version of Supabase CLI is available/i];

/** The prefix a shell file uses for a line meant for this script. */
const SENTINEL = '::localdb ';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.dirname(scriptsDir);

const fail = (message) => {
  if (message !== '') console.error(message);
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
 * The stack's identity, derived from the checkout path — the same three lines
 * scripts/local-db.mjs derives it from, and they have to stay the same three.
 * They are repeated rather than imported because that file is a command: it
 * reads argv and runs something the moment it is loaded, so importing it to
 * borrow an expression would run a database command as a side effect.
 */
const digest = createHash('sha256').update(checkoutWsl).digest();
const slug = path.basename(checkout).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const label = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
const derivedProjectId = `${label}-${digest.toString('hex').slice(0, 6)}`;

/**
 * `--stack <project-id>` runs against a named stack instead of this checkout's.
 *
 * It is an escape hatch and nothing more: the point of deriving the id is that
 * a checkout's tests hit that checkout's database, and naming another one gives
 * that up. It exists for the two cases where there is no checkout to derive
 * from — a scratch stack built to prove this script itself, and a stack whose
 * worktree has already been torn down. It has to come first, so that everything
 * after it can be passed to vitest untouched.
 */
let args = process.argv.slice(2);
let projectId = derivedProjectId;
if (args[0] === '--stack') {
  if (!args[1]) fail('--stack needs a project id. `npm run db -- list` shows them.');
  projectId = args[1];
  args = args.slice(2);
}

/** Runs the distro half and collects the sentinel lines it prints. */
const readStack = () =>
  new Promise((resolve) => {
    const values = {};
    let started = false;

    const emit = (line, sink) => {
      if (line.startsWith(SENTINEL)) {
        const rest = line.slice(SENTINEL.length).trim();
        if (rest === 'started') {
          started = true;
          return;
        }
        const match = /^([a-z_]+)=(.*)$/.exec(rest);
        if (match) values[match[1]] = match[2];
        return;
      }
      if (line.trim() !== '' && !NOISE.some((pattern) => pattern.test(line))) sink.write(`${line}\n`);
    };

    const child = spawn(
      'wsl.exe',
      ['-d', DISTRO, '--', 'bash', `${checkoutWsl}/scripts/local-db/test-db.sh`, projectId, cliVersion],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const pending = new Map();
    for (const [source, sink] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      source.setEncoding('utf8');
      pending.set(source, '');
      source.on('data', (chunk) => {
        const lines = (pending.get(source) + chunk).split(/\r\n|\r|\n/);
        pending.set(source, lines.pop() ?? '');
        for (const line of lines) emit(line, sink);
      });
    }

    child.on('error', () =>
      resolve({ ok: false, message: `Could not run wsl.exe. Is the ${DISTRO} distro installed?` }),
    );
    child.on('close', (code) => {
      for (const [source, sink] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ]) {
        emit(pending.get(source) ?? '', sink);
      }
      if (code !== 0 || !started) {
        // A shell file that started has already said why, in its own words;
        // adding a line here would only push its message up the screen. The
        // absence of the sentinel is the case nothing has explained, because
        // wsl.exe's own failures and bash's share the small exit codes.
        resolve({
          ok: false,
          message: started ? '' : `Nothing ran inside ${DISTRO}. Is the distro installed and Docker up in it?`,
        });
        return;
      }
      resolve({ ok: true, values });
    });
  });

const { ok, message, values } = await readStack();
if (!ok) fail(message);

const { api_url: apiUrl, anon_key: anonKey, service_key: serviceKey, checkout: stackCheckout } = values;
if (!apiUrl || !anonKey || !serviceKey) {
  fail('The stack did not report a URL and both keys.');
}

console.log(`test:db:local: ${projectId} at ${apiUrl}`);
if (stackCheckout !== undefined && stackCheckout !== checkoutWsl) {
  console.log(`  note: that stack belongs to ${stackCheckout}, not to this checkout.`);
}
console.log('');

/**
 * The same invocation `test:db` runs, plus whatever was passed through, and the
 * three variables CI's own step sets — nothing else, so a green run here and a
 * green run there mean the same thing.
 *
 * vitest is spawned as its own JS entry rather than through npm: an npm child
 * on Windows means a shell, and a test path with a space in it would come apart
 * in the quoting. Its entry is resolved the way node resolves any import rather
 * than joined onto the checkout: a worktree has no node_modules of its own and
 * finds the parent checkout's by walking upward.
 */
const vitest = spawn(
  process.execPath,
  [
    createRequire(path.join(checkout, 'package.json')).resolve('vitest/vitest.mjs'),
    '--run',
    '--config',
    'vitest.config.db.mts',
    ...args,
  ],
  {
    cwd: checkout,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    },
  },
);

vitest.on('error', (error) => fail(`Could not run vitest: ${error.message}`));
// vitest's own exit code, so this script is transparent to whatever ran it.
vitest.on('close', (code) => process.exit(code ?? 1));
