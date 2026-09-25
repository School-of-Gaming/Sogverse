#!/usr/bin/env node
/**
 * The local database, for the checkout this file sits in.
 *
 *   npm run db -- up          # build/resume this checkout's Supabase stack and
 *                             # point its dev server at it
 *   npm run db -- up --no-rich-seed
 *                             # ...on seed.sql alone, with no rich catalogue
 *                             # and no product images
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
 * the reader. There are two such lines: `started`, written when lib.sh is
 * sourced, which is the only proof that bash inside the distro ever ran our
 * file; and `running=<n>`, which the keep-alive below is decided on.
 */
const SENTINEL = '::localdb ';

/**
 * The exit code this script uses for "the command could not be run at all" —
 * wsl.exe would not spawn, the distro never answered, or the shell file stopped
 * before it had read anything about the stack (a missing `flock`, which exits
 * with this same status from inside the distro). Nothing was inspected and
 * nothing was changed.
 *
 * It exists for one caller: the worktree teardown script, which carries on past
 * it — a stack it could not even ask about is a stack `list` will show with its
 * worktree missing — and stops on any other non-zero code, which means the
 * command ran and refused or failed part-way.
 *
 * The two are separated by the `started` sentinel rather than by the child's
 * exit status alone, because wsl.exe's own failures and bash's share the small
 * numbers and cannot be told apart from outside.
 */
const COULD_NOT_RUN = 2;

/**
 * The command surface. `summary` is the usage text; `flags` is the whole set of
 * words a command accepts after its name, and anything else is refused here
 * rather than passed into the distro to be ignored; a command with
 * `ownsGenerateId` runs against the second identity described under `portBase`
 * rather than the stack's; a command with `createsServices` may have the CLI
 * create the stack's containers, which is when the Google provider's settings
 * (below) are read, so it is the one handed them.
 */
const COMMANDS = {
  up: {
    flags: ['--no-rich-seed'],
    createsServices: true,
    summary: [
      'Build this checkout\'s local Supabase stack from supabase/migrations/,',
      'supabase/rich-seed.sql and its product images, and point this',
      'checkout\'s .env.local at it. Resumes a parked stack without replaying',
      'anything. Already running: prints the URL and changes nothing.',
      '--no-rich-seed builds it from seed.sql alone, with no rich catalogue',
      'and no images — what the DB tests are written against. The choice is',
      'remembered, so a later `up` or `reset` of that stack keeps it.',
    ],
  },
  migrate: {
    summary: [
      'Apply migration files the running stack has not seen to it, keeping',
      'its data. This is what an ADDED migration needs. A `git merge',
      'origin/dev` that brings migrations needs `reset` instead: this puts',
      'them on top, where every other database replays them underneath.',
    ],
  },
  reset: {
    createsServices: true,
    summary: [
      'Rebuild the running stack\'s database in place from migrations/ and',
      'whichever seeds it was built with (about a minute). This is what an',
      'EDITED migration needs. Other stacks are untouched.',
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

const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
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
const fullLabel = slug.startsWith('sogverse') ? slug : `sogverse-${slug || 'checkout'}`;
/**
 * The CLI silently cuts a project id to 40 characters when it names the
 * containers, and the shell files address those containers by the id they
 * were handed — so an id longer than that starts a stack this script can
 * never find again. The hash and the `-gen` suffix are fixed, so the label is
 * what gives way: a long worktree name loses its tail rather than its hash,
 * because the hash is the half that keeps two checkouts apart.
 */
const PROJECT_ID_MAX_LENGTH = 40;
const LABEL_MAX_LENGTH = PROJECT_ID_MAX_LENGTH - '-'.length - 6 - '-gen'.length;
const label = fullLabel.slice(0, LABEL_MAX_LENGTH).replace(/-+$/g, '');
const projectId = `${label}-${digest.toString('hex').slice(0, 6)}`;
const portBase = 61000 + (digest.readUInt16BE(0) % 40) * 100;
const GENERATE_PORT_OFFSET = 50;

const command = process.argv[2];
if (!command || !Object.hasOwn(COMMANDS, command)) {
  const names = Object.keys(COMMANDS);
  const width = Math.max(...names.map((name) => name.length));
  fail(
    `Usage: npm run db -- <${names.join('|')}> [flags]\n\n` +
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
 * The flags this command was given, checked here so a typo is a refusal rather
 * than a word the shell file silently ignores — a mistyped `--no-rich-seed` is
 * a stack built with data the caller did not want. Deduplicated, so the shell
 * file reads one optional argument and never has to count.
 */
const flags = [...new Set(process.argv.slice(3))];
const allowedFlags = spec.flags ?? [];
const unknownFlags = flags.filter((flag) => !allowedFlags.includes(flag));
if (unknownFlags.length > 0) {
  fail(
    allowedFlags.length > 0
      ? `${command} takes ${allowedFlags.join(', ')}; it was given ${unknownFlags.join(' ')}.`
      : `${command} takes no flags; it was given ${unknownFlags.join(' ')}.`,
  );
}

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
 *
 * The boot time is compared with a tolerance rather than exactly. It is derived
 * from the clock minus the uptime, and both of those move: an NTP step or a
 * suspend shifts the answer by seconds to minutes without the machine having
 * rebooted. Compared exactly, the drift reads as a different boot, and the
 * keep-alive it disowns is a `wsl.exe` nothing will ever release. A reboot
 * moves this number by far more than the tolerance, so the check it exists for
 * still holds.
 */
const keepAliveDir = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'sogverse-local-db');
const keepAlivePidFile = path.join(keepAliveDir, 'keepalive.pid');
const bootTime = () => String(Math.round((Date.now() - os.uptime() * 1000) / 1000));
const BOOT_TIME_TOLERANCE_SECONDS = 120;

const readKeepAlive = () => {
  let contents;
  try {
    contents = readFileSync(keepAlivePidFile, 'utf8');
  } catch {
    return null;
  }
  const [pid, boot] = contents.trim().split(/\s+/);
  if (!/^\d+$/.test(pid ?? '')) return null;
  const drift = Math.abs(Number(boot) - Number(bootTime()));
  if (!Number.isFinite(drift) || drift > BOOT_TIME_TOLERANCE_SECONDS) return null;
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
  // A spawn failure arrives as an event, and on a detached child there is
  // nothing to catch it: unhandled, it would throw out of the process long
  // after the command it belongs to succeeded. The stack is up either way; the
  // most that is lost is the guarantee that the distro outlives this shell.
  child.on('error', (error) => {
    console.error(`Could not hold the distro open (${error.message}); the stack may not outlive this shell.`);
  });
  child.unref();
  if (child.pid === undefined) return;
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

/**
 * The Google sign-in provider, switched on for this checkout's stack when
 * .env.local carries both of its credentials, and left off — config.toml's own
 * `enabled = false` — when it does not, so a checkout without them gets exactly
 * the stack it always did.
 *
 * config.toml cannot do the switching itself: an `enabled = "env(…)"` that is
 * unset fails the CLI's config parse, which would break CI's `supabase start`
 * and every `db push`. What works is the CLI's own override, which takes any
 * `SUPABASE_<SECTION>_<KEY>` variable over the file's value — the credentials'
 * names are those overrides too. They reach the distro through WSLENV, which
 * carries the variables' names across the boundary and never their values:
 * those are secrets, and on a command line they would be shell text.
 */
const GOOGLE_CREDENTIALS = ['SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET'];

/** The credentials out of .env.local, or null unless both are there and non-empty. */
const readGoogleCredentials = () => {
  let text;
  try {
    text = readFileSync(path.join(checkout, '.env.local'), 'utf8');
  } catch {
    return null;
  }
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match || !GOOGLE_CREDENTIALS.includes(match[1])) continue;
    // The last assignment wins, as it does for the dotenv reader the app uses.
    const value = match[2].trim();
    found[match[1]] = /^(["'])(.*)\1$/.exec(value)?.[2] ?? value;
  }
  return GOOGLE_CREDENTIALS.every((name) => found[name]) ? found : null;
};

const googleCredentials = readGoogleCredentials();

const distroEnv = () => {
  if (!spec.createsServices || googleCredentials === null) return process.env;
  const forwarded = { ...googleCredentials, SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED: 'true' };
  return {
    ...process.env,
    ...forwarded,
    WSLENV: [process.env.WSLENV, ...Object.keys(forwarded)].filter(Boolean).join(':'),
  };
};

/** Run one of the shell files inside the distro. */
const runInDistro = (shellFile, args) =>
  new Promise((resolve) => {
    let running = null;
    let started = false;

    const child = spawn(
      'wsl.exe',
      ['-d', DISTRO, '--', 'bash', `${checkoutWsl}/scripts/local-db/${shellFile}`, ...args],
      { stdio: ['ignore', 'pipe', 'pipe'], env: distroEnv() },
    );

    const onSentinel = (line) => {
      if (line === 'started') {
        started = true;
        return;
      }
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
      resolve({
        code: COULD_NOT_RUN,
        message: `Could not run wsl.exe. Is the ${DISTRO} distro installed?`,
        started: false,
      }),
    );
    child.on('close', (code) => {
      for (const [, filter] of streams) filter.flush();
      resolve({ code: code ?? 1, running, started });
    });
  });

const startedAt = Date.now();
if (command !== 'list') {
  console.log(
    `${command}: ${runProjectId} on ports ${runPortBase}-${runPortBase + 49} (Supabase CLI ${cliVersion})`,
  );
}

const { code, message, running, started } = await runInDistro(`${command}.sh`, [
  checkoutWsl,
  runProjectId,
  String(runPortBase),
  cliVersion,
  ...flags,
]);
const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);

// Whatever the command did, the answer to "is anything of ours running" decides
// whether the distro is held open. A run that failed before it could say leaves
// the keep-alive as it found it.
if (running !== null && running !== undefined) {
  if (running > 0) holdKeepAlive();
  else releaseKeepAlive();
}

if (code !== 0) {
  // Either the shell file never started, or it started and exited with the
  // status reserved for "could not run". Anything else is an outcome.
  const exitCode = !started || code === COULD_NOT_RUN ? COULD_NOT_RUN : 1;
  fail(
    message ??
      `${command} failed after ${seconds}s.\n\n` +
        `If Docker itself is wedged, restart the Docker service inside the distro —\n` +
        `never restart WSL, which would kill whatever else is running in there:\n` +
        `  wsl -d ${DISTRO} -u root -- systemctl restart docker`,
    exitCode,
  );
}
/**
 * Whether Google is on, asked of the running stack rather than inferred from
 * .env.local: a stack that was already up kept the settings it started with.
 * The API port is config.toml's, shifted into this checkout's block the way
 * lib.sh shifts it when it rewrites the file.
 */
const reportGoogle = async () => {
  const config = readFileSync(path.join(checkout, 'supabase', 'config.toml'), 'utf8');
  const apiSection = /^\[api\]\s*$([\s\S]*?)(?=^\[)/m.exec(config)?.[1] ?? '';
  const configPort = Number(/^\s*port\s*=\s*(\d+)/m.exec(apiSection)?.[1]);
  const apiUrl = `http://127.0.0.1:${runPortBase + (configPort % 100)}`;
  let enabled;
  try {
    const response = await fetch(`${apiUrl}/auth/v1/settings`, { signal: AbortSignal.timeout(5000) });
    enabled = (await response.json())?.external?.google === true;
  } catch {
    console.log(`  Google       could not ask ${apiUrl}/auth/v1/settings whether it is on.`);
    return;
  }
  if (enabled) {
    console.log(`  Google       on. The Google OAuth client's authorized redirect URI: ${apiUrl}/auth/v1/callback`);
  } else if (googleCredentials === null) {
    console.log(`  Google       off — .env.local does not carry both ${GOOGLE_CREDENTIALS.join(' and ')}.`);
  } else {
    console.log('  Google       off, although .env.local carries its credentials.');
  }
  if (enabled !== (googleCredentials !== null)) {
    console.log('               The stack was already up and kept the settings it started with;');
    console.log('               `npm run db -- park` and `up` again to apply .env.local.');
  }
};

if (command === 'up') await reportGoogle();
console.log(`${command}: done in ${seconds}s`);
