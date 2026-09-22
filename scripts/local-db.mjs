#!/usr/bin/env node
/**
 * The local database, for the checkout this file sits in.
 *
 *   npm run db -- up          # build/resume this checkout's Supabase stack and
 *                             # point its dev server at it
 *   npm run db -- migrate     # apply new migration files to the running stack
 *   npm run db -- reset       # rebuild the running stack's database in place
 *   npm run db -- park        # stop the stack, keeping its data
 *   npm run db -- down        # remove the stack, its data, and its .env.local edit
 *   npm run db -- list        # every stack on this machine
 *   npm run db -- generate    # build a throwaway DB from migrations/, regenerate
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
 * identity, holding the distro keep-alive, and keeping the noise WSL writes to
 * stderr out of the output. The real work is the shell files in
 * scripts/local-db/, run as files inside the distro — crossing the boundary
 * mangles `~`, rooted Linux paths, inline environment assignments and anything
 * with `$` or nested quotes, so only bare words are passed across.
 *
 * Nothing it builds touches the repo: the CLI, the shadow workdirs, the stacks'
 * state and the generation output all live in the distro's own filesystem. The
 * only things written on the Windows side are the generated files themselves —
 * database.types.ts and supabase/schema/ — written from inside the distro so no
 * Windows shell text handling ever sees them, and this checkout's own
 * .env.local, which `up` repoints and `down` puts back.
 *
 * **Never restart WSL to fix a failure here.** The distro is shared with other
 * long-running work that a shutdown destroys. Restart the Docker service or
 * re-run the command; there is no `wsl --shutdown` or `wsl --terminate` in this
 * script and there must not be.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

/**
 * The prefix a shell file uses for a line meant for this script rather than for
 * the reader. There is exactly one such line, `running=<n>`, and it is what the
 * keep-alive below is decided on.
 */
const SENTINEL = '::localdb ';

/**
 * The command surface. `summary` is the usage text; a command with
 * `ownsGenerateId` runs against the second identity described under `portBase`
 * rather than the stack's.
 */
const COMMANDS = {
  up: {
    summary: [
      'Build this checkout\'s local Supabase stack from supabase/migrations/,',
      'seed.sql and supabase/rich-seed.sql, and point this checkout\'s',
      '.env.local at it. Resumes a parked stack without replaying anything.',
      'Already running: prints the URL and changes nothing.',
    ],
  },
  migrate: {
    summary: [
      'Apply migration files the running stack has not seen to it, keeping',
      'its data. This is what an ADDED migration needs.',
    ],
  },
  reset: {
    summary: [
      'Rebuild the running stack\'s database in place from migrations/ and',
      'both seeds (about a minute). This is what an EDITED migration needs.',
      'Other stacks are untouched.',
    ],
  },
  park: {
    summary: [
      'Stop the stack, keeping its data and freeing its memory. .env.local',
      'goes on pointing at it, and `up` brings it back in about 30s.',
    ],
  },
  down: {
    summary: [
      'Remove the stack and its data, and restore the three .env.local',
      'values `up` replaced. Run it when the feature lands or its worktree',
      'is torn down.',
    ],
  },
  list: {
    summary: [
      'Every stack on this machine, running or parked, with its worktree,',
      'memory and API port — and a flag on any whose worktree is gone.',
    ],
  },
  generate: {
    ownsGenerateId: true,
    summary: [
      'Start a throwaway database from supabase/migrations/, write',
      'src/types/database.types.ts and supabase/schema/ from it, remove the',
      'database. Runs beside this checkout\'s stack, not instead of it.',
    ],
  },
};

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
 *
 * A checkout has TWO identities, because `generate` and a long-lived stack have
 * to coexist: generating types is what you do just after adding a migration,
 * which is exactly when the stack is up, and `generate` clears the slate by
 * removing whatever holds its project id before it starts — so sharing an id
 * would silently destroy the stack and its data. The alternative, refusing to
 * generate while a stack runs, is safe but hostile at the one moment it fires.
 * The second identity costs no extra room: config.toml's ports all sit in the
 * first thirty of the hundred this checkout owns, so shifting `generate` half a
 * block up keeps both inside it and clear of every other checkout's.
 */
const digest = createHash('sha256').update(checkoutWsl).digest();
const slug = path.basename(checkout).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const label = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
const projectId = `${label}-${digest.toString('hex').slice(0, 6)}`;
const portBase = 61000 + (digest.readUInt16BE(0) % 40) * 100;
const GENERATE_PORT_OFFSET = 50;

const command = process.argv[2];
if (!command || !Object.hasOwn(COMMANDS, command)) {
  const names = Object.keys(COMMANDS);
  const width = Math.max(...names.map((name) => name.length));
  fail(
    `Usage: npm run db -- <${names.join('|')}>\n\n` +
      names
        .map((name) =>
          COMMANDS[name].summary
            .map((line, index) => `  ${(index === 0 ? name : '').padEnd(width)}   ${line}`)
            .join('\n'),
        )
        .join('\n\n'),
  );
}

const spec = COMMANDS[command];
const runProjectId = spec.ownsGenerateId ? `${projectId}-gen` : projectId;
const runPortBase = spec.ownsGenerateId ? portBase + GENERATE_PORT_OFFSET : portBase;

/**
 * A stream of a child's output, forwarded line by line with the noise dropped
 * and the sentinel lines pulled out.
 *
 * Both streams are piped rather than inherited, because filtering is the whole
 * point — and the CLI rewrites its progress in place with carriage returns, so
 * a plain `\n` split leaves half-overwritten lines in a captured log. Splitting
 * on either makes each update its own line.
 */
const lineFilter = (sink, onSentinel) => {
  let pending = '';
  const emit = (line) => {
    if (line.startsWith(SENTINEL)) {
      onSentinel(line.slice(SENTINEL.length).trim());
      return;
    }
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
 * The keep-alive.
 *
 * A stack has to outlive the command that started it, and whether the distro
 * stays up with nothing attached to it from the Windows side could not be
 * established. So this does not depend on the answer: a hidden, detached
 * `wsl.exe -- sleep infinity` is held for as long as any stack of ours is
 * running anywhere on the machine, and released with the last one.
 *
 * The pid is kept on the Windows side because the process is a Windows one.
 * Beside it goes the boot time, so a pid left behind by a crash cannot be
 * mistaken for a live keep-alive after a reboot has reused the number; within
 * one boot, `tasklist` confirming the image is `wsl.exe` is what stands between
 * a stale pid and a terminal of the owner's being killed.
 */
const keepAliveDir = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'sogverse-local-db');
const keepAlivePidFile = path.join(keepAliveDir, 'keepalive.pid');
const bootTime = () => String(Math.round((Date.now() - os.uptime() * 1000) / 10_000));

const readKeepAlive = () => {
  let contents;
  try {
    contents = readFileSync(keepAlivePidFile, 'utf8');
  } catch {
    return null;
  }
  const [pid, boot] = contents.trim().split(/\s+/);
  if (!/^\d+$/.test(pid ?? '') || boot !== bootTime()) return null;
  const listed = spawnSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return /^"wsl\.exe"/i.test((listed.stdout ?? '').trim()) ? Number(pid) : null;
};

const holdKeepAlive = () => {
  if (readKeepAlive() !== null) return;
  const child = spawn('wsl.exe', ['-d', DISTRO, '--', 'sleep', 'infinity'], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.unref();
  mkdirSync(keepAliveDir, { recursive: true });
  writeFileSync(keepAlivePidFile, `${child.pid} ${bootTime()}\n`);
};

const releaseKeepAlive = () => {
  const pid = readKeepAlive();
  // `/T` as well as `/F`: the session's own `sleep` is a child of wsl.exe.
  if (pid !== null) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  // Removed either way — a pid that did not survive the checks above is a pid
  // nothing should look at again.
  rmSync(keepAlivePidFile, { force: true });
};

/** Run one of the shell files inside the distro. */
const runInDistro = (shellFile, args) =>
  new Promise((resolve) => {
    let running = null;

    const child = spawn(
      'wsl.exe',
      ['-d', DISTRO, '--', 'bash', `${checkoutWsl}/scripts/local-db/${shellFile}`, ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const onSentinel = (line) => {
      const match = /^running=(\d+)$/.exec(line);
      if (match) running = Number(match[1]);
    };

    const streams = [
      [child.stdout, lineFilter(process.stdout, onSentinel)],
      [child.stderr, lineFilter(process.stderr, onSentinel)],
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
      resolve({ code: code ?? 1, running });
    });
  });

const started = Date.now();
if (command !== 'list') {
  console.log(
    `${command}: ${runProjectId} on ports ${runPortBase}-${runPortBase + 49} (Supabase CLI ${cliVersion})`,
  );
}

const { code, message, running } = await runInDistro(`${command}.sh`, [
  checkoutWsl,
  runProjectId,
  String(runPortBase),
  cliVersion,
]);
const seconds = ((Date.now() - started) / 1000).toFixed(0);

// Whatever the command did, the answer to "is anything of ours running" decides
// whether the distro is held open. A run that failed before it could say leaves
// the keep-alive as it found it.
if (running !== null && running !== undefined) {
  if (running > 0) holdKeepAlive();
  else releaseKeepAlive();
}

if (code !== 0) {
  fail(
    message ??
      `${command} failed after ${seconds}s.\n\n` +
        `If Docker itself is wedged, restart the Docker service inside the distro —\n` +
        `never restart WSL, which would kill whatever else is running in there:\n` +
        `  wsl -d ${DISTRO} -u root -- systemctl restart docker`,
  );
}
console.log(`${command}: done in ${seconds}s`);
