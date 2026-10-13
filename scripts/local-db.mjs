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
 *   npm run test:db:local [-- <vitest args>]
 *                             # (`npm run db -- test`) run tests/db/ against a
 *                             # throwaway DB of migrations/ + seed.sql, remove it
 *
 * The database runs in the WSL distro, because that is where Docker lives on
 * this machine. **This script is the only thing that knows that.** Every
 * caller — a person, an agent, a flow — goes through the npm script and never
 * touches the distro directly, so the day the database moves somewhere else
 * only this file changes.
 *
 * What lives here is the boundary and nothing else: locating the checkout,
 * reading the CLI pin, translating a Windows path, deriving the identities,
 * probing which port blocks Windows can bind, holding the distro keep-alive,
 * running vitest for `test`, and deciding what of a run the reader sees. The
 * real work is the shell files in scripts/local-db/, run as files inside the
 * distro — crossing the boundary mangles `~`, rooted Linux paths, inline
 * environment assignments and anything with `$` or nested quotes, so only bare
 * words are passed across.
 *
 * A run is quiet. Everything the distro side prints goes to a log under
 * scripts/output/local-db/, and the reader sees only the lines it marks for
 * them — on success, a few lines; on failure, the step it failed at, the end of
 * the log, and the log's path. Every reader of this output is paying for it,
 * Claude sessions included, so a line belongs on screen only if they act on it.
 *
 * Nothing it builds touches the repo: the CLI, the shadow workdirs, the stacks'
 * state and the generation output all live in the distro's own filesystem. The
 * only things written on the Windows side are the generated files themselves —
 * database.types.ts and supabase/schema/ — written from inside the distro so no
 * Windows shell text handling ever sees them, this checkout's own .env.local,
 * which `up` repoints and `down` puts back, and the logs.
 *
 * **Never restart WSL to fix a failure here.** The distro is shared with other
 * long-running work that a shutdown destroys. Restart the Docker service or
 * re-run the command; there is no `wsl --shutdown` or `wsl --terminate` in this
 * script and there must not be.
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stackIdentity } from './lib/local-db-identity.mjs';
import { bindableBlocks, parseClaimedBlocks } from './lib/local-db-ports.mjs';
import { outputDir } from './lib/output.mjs';

const DISTRO = 'Ubuntu-24.04';

/**
 * Lines WSL and the CLI write to stderr on every run and that say nothing
 * about this run, kept even out of the log. The screen-size warning is emitted
 * by the distro's init for any invocation from a Windows shell; the CLI's
 * upgrade notice is advice we deliberately do not take, since the version is
 * pinned in package.json and CI pins the same one.
 */
const NOISE = [/screen size is bogus/i, /A new version of Supabase CLI is available/i];

/**
 * The prefix a shell file uses for a line meant for this script rather than
 * printed as it is. `started` is written when lib.sh is sourced, which is the
 * only proof that bash inside the distro ever ran our file; `say <text>` is a
 * line for the reader and `step <text>` the step a command is on (lib.sh);
 * `ready` is the `test` database saying the tests may start; and `<key>=<value>`
 * hands back a value: `running` (the keep-alive is decided on it), `api_url`,
 * and the `test` database's keys.
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

/** How much of the log a failure shows, and how many logs of one command are kept. */
const FAILURE_TAIL_LINES = 20;
const LOGS_KEPT_PER_COMMAND = 5;

/**
 * The command surface. `summary` is the usage text. A command with `identity`
 * runs against one of the checkout's throwaway identities rather than its
 * stack's (lib/local-db-identity.mjs); with `allocatesPorts` it may have to take
 * a port block, so it is handed the blocks Windows can bind; with
 * `createsServices` the CLI may create the stack's containers, which is when the
 * Google provider's settings (below) are read, so it is the one handed them;
 * with `passThrough` every word after its name is vitest's, and every other
 * command refuses any word after its name rather than passing it into the
 * distro to be ignored. `list` alone prints what its shell file prints, since a
 * listing is all it is for.
 */
const COMMANDS = {
  up: {
    allocatesPorts: true,
    createsServices: true,
    summary: [
      'Build this checkout\'s local Supabase stack from supabase/migrations/,',
      'supabase/rich-seed.sql and its product images, and point this',
      'checkout\'s .env.local at it. Resumes a parked stack without replaying',
      'anything. Already running: prints the URL and changes nothing.',
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
      'the rich seed (about a minute). This is what an EDITED migration',
      'needs. Other stacks are untouched.',
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
    verbatim: true,
    summary: [
      'Every stack on this machine, running or parked, with its worktree,',
      'memory and API port — and a flag on any whose worktree is gone.',
    ],
  },
  generate: {
    identity: 'generateId',
    allocatesPorts: true,
    summary: [
      'Start a throwaway database from supabase/migrations/, write',
      'src/types/database.types.ts and supabase/schema/ from it, remove the',
      'database. Runs beside this checkout\'s stack, not instead of it.',
    ],
  },
  test: {
    identity: 'testId',
    allocatesPorts: true,
    passThrough: true,
    summary: [
      '`npm run test:db:local`. Start a throwaway database from migrations/',
      'and supabase/seed.sql, run tests/db/ against it (any further words go',
      'to vitest), remove the database. Runs beside this checkout\'s stack.',
    ],
  },
};

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
// The checkout is found from this file's own location, so a run from any
// worktree or from the main checkout targets that checkout's supabase/.
const checkout = path.dirname(scriptsDir);

const fail = (message, code = 1) => {
  if (message !== '') console.error(message);
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
 * The identities, derived from the checkout path so that each is the same on
 * every run of the same checkout and different for every other one. The
 * containers and volumes are named by them, which is what makes a crashed run's
 * leftovers findable: the next run of *this* checkout looks under its own id and
 * removes them, where a name nobody can work out again would leave an orphan.
 *
 * The ports are NOT derived. A stack takes a block of 100 when it is first
 * started — the first block in 20000-23999 that no other stack's record claims
 * and that Windows can bind right now — and records it; every later command
 * reads the block back from that record and never works it out again, so a
 * stack keeps its URL, and the Google OAuth redirect URI built on it, until it
 * goes `down` and the record goes with it. Ports derived like the id would fail
 * twice over: forty hash-chosen blocks put two of a handful of checkouts on the
 * same one more often than not, and nothing derived can dodge a reservation —
 * inside Windows' dynamic ports (49152-65535) Hyper-V reserves blocks of its
 * own choosing at every boot. A reserved port cannot be bound, so WSL's
 * localhost forwarder cannot publish it and the stack is unreachable from
 * Windows while healthy inside the distro. 20000-23999 is below that range and
 * below Linux's ephemeral one (32768-60999), and the bind probe at allocation
 * catches whatever else holds a port there. The probe has to run here, on
 * Windows; the choice is made inside the distro, under a lock every checkout
 * shares, because that is where the records are — lib.sh, `allocate_block`.
 *
 * `generate` and `test` each build a throwaway database under an identity of
 * their own, on a block claimed only while they run — lib.sh, `transient_db`.
 */
const identities = stackIdentity(checkout, checkoutWsl);

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
const runProjectId = identities[spec.identity ?? 'projectId'];

const extraArgs = process.argv.slice(3);
if (!spec.passThrough && extraArgs.length > 0) {
  fail(`${command} takes no flags; it was given ${extraArgs.join(' ')}.`);
}

/**
 * The run's log: scripts/output/local-db/<command>-<time>.log, written as the
 * run goes so that a run killed part-way still leaves what it had done. Only
 * the newest few of each command are kept — a log is read the moment its run
 * fails or not at all.
 */
const openLog = () => {
  if (spec.verbatim) return null;
  const dir = outputDir(import.meta.url);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${command}-${stamp}.log`);
  const fd = openSync(file, 'w');
  const lines = [];
  const write = (line) => {
    lines.push(line);
    writeSync(fd, `${line}\n`);
  };
  write(`${command}: ${runProjectId} (Supabase CLI ${cliVersion}), ${new Date().toISOString()}`);

  const older = readdirSync(dir)
    .filter((name) => name.startsWith(`${command}-`) && name.endsWith('.log'))
    .sort()
    .slice(0, -LOGS_KEPT_PER_COMMAND);
  for (const name of older) rmSync(path.join(dir, name), { force: true });

  return { file, lines, write, close: () => closeSync(fd) };
};

/**
 * The keep-alive.
 *
 * A stack has to outlive the command that started it, and WSL shuts the distro
 * down once nothing on the Windows side is attached to it, taking every
 * container with it. So a `wsl.exe` running keepalive.sh is held for as long
 * as any stack of ours is running anywhere on the machine, and released with
 * the last one.
 *
 * It gets a console window of its own, on purpose: that window is the one
 * thing on screen that says a local database is running, and closing it is
 * closing the keep-alive, so the shell file fills it with a banner that says
 * so rather than leaving it empty. It is launched through Start-Process
 * because that is what gives a program a console when its launcher has none
 * to hand down — a detached spawn from here gets no console at all, and the
 * banner goes nowhere. The distro name and the file path reach the launcher
 * through the environment, never as shell text.
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

const KEEPALIVE_LAUNCHER =
  "(Start-Process -FilePath wsl.exe -ArgumentList @('-d', $env:SOG_LOCALDB_DISTRO, '--', 'bash', $env:SOG_LOCALDB_KEEPALIVE) -PassThru).Id";

const holdKeepAlive = () => {
  if (readKeepAlive() !== null) return;
  const launched = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', KEEPALIVE_LAUNCHER], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      SOG_LOCALDB_DISTRO: DISTRO,
      SOG_LOCALDB_KEEPALIVE: `${checkoutWsl}/scripts/local-db/keepalive.sh`,
    },
  });
  const pid = Number((launched.stdout ?? '').trim());
  if (launched.status !== 0 || !Number.isInteger(pid) || pid <= 0) {
    // The stack is up either way; the most that is lost is the guarantee that
    // the distro outlives this shell.
    const detail = (launched.stderr ?? '').trim();
    console.error(
      `Could not hold the distro open${detail ? ` (${detail})` : ''}; the stack may not outlive this shell.`,
    );
    return;
  }
  mkdirSync(keepAliveDir, { recursive: true });
  writeFileSync(keepAlivePidFile, `${pid} ${bootTime()}\n`);
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

/**
 * Run one of the shell files inside the distro.
 *
 * Both streams are piped rather than inherited, because sorting the lines is
 * the whole point — and the CLI rewrites its progress in place with carriage
 * returns, so a plain `\n` split leaves half-overwritten lines in a captured
 * log. Splitting on either makes each update its own line.
 *
 * `onReady` is called, with the child, when the shell file says `ready`; only
 * `test`'s does, and it is the one run whose stdin is a pipe, which is how it
 * is told the tests are done.
 */
const runInDistro = ({ shellFile, args, log, onReady }) =>
  new Promise((resolve) => {
    let started = false;
    let step = null;
    const said = [];
    const values = {};

    const child = spawn(
      'wsl.exe',
      ['-d', DISTRO, '--', 'bash', `${checkoutWsl}/scripts/local-db/${shellFile}`, ...args],
      { stdio: [onReady ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: distroEnv() },
    );

    const onSentinel = (rest) => {
      if (rest === 'started') {
        started = true;
      } else if (rest === 'ready') {
        onReady?.(child, values);
      } else if (rest.startsWith('say ')) {
        said.push(rest.slice('say '.length));
        log?.write(rest.slice('say '.length));
      } else if (rest.startsWith('step ')) {
        step = rest.slice('step '.length);
        log?.write(`== ${step}`);
      } else {
        const match = /^([a-z_]+)=(.*)$/.exec(rest);
        if (match) values[match[1]] = match[2];
      }
    };

    const lineSorter = (sink) => {
      let pending = '';
      const emit = (line) => {
        if (line.startsWith(SENTINEL)) {
          onSentinel(line.slice(SENTINEL.length).trimEnd());
          return;
        }
        if (line.trim() === '' || NOISE.some((pattern) => pattern.test(line))) return;
        if (log) log.write(line);
        else sink.write(`${line}\n`);
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

    const streams = [
      [child.stdout, lineSorter(process.stdout)],
      [child.stderr, lineSorter(process.stderr)],
    ];
    for (const [source, sorter] of streams) {
      source.setEncoding('utf8');
      source.on('data', (chunk) => sorter.push(chunk));
    }
    // A shell file that has already gone makes a late write to its stdin fail;
    // that is the shell file's exit, which `close` below reports.
    child.stdin?.on('error', () => {});

    child.on('error', () =>
      resolve({
        code: COULD_NOT_RUN,
        message: `Could not run wsl.exe. Is the ${DISTRO} distro installed?`,
        started: false,
        step,
        said,
        values,
      }),
    );
    child.on('close', (code) => {
      for (const [, sorter] of streams) sorter.flush();
      resolve({ code: code ?? 1, started, step, said, values });
    });
  });

/** A failed run, told the reader: where it stopped, the end of its log, and where the log is. */
const reportFailure = (log, result, seconds, what = `${command} failed`) => {
  console.error(`${what}${result.step ? ` at: ${result.step}` : ''} (after ${seconds}s).`);
  if (log !== null) {
    const tail = log.lines.slice(1).slice(-FAILURE_TAIL_LINES);
    if (tail.length > 0) console.error(`\n${tail.map((line) => `  ${line}`).join('\n')}\n`);
    console.error(`Full log: ${log.file}`);
  }
  if (result.step) {
    console.error(
      `If Docker itself is wedged, restart it — never WSL, which kills whatever else runs there:\n` +
        `  wsl -d ${DISTRO} -u root -- systemctl restart docker`,
    );
  }
};

/**
 * Whether Google is on, asked of the running stack rather than inferred from
 * .env.local: a stack that was already up kept the settings it started with.
 * The URL is the one `up` reported from the stack's record.
 */
const reportGoogle = async (apiUrl) => {
  if (apiUrl === undefined) return;
  let enabled;
  try {
    const response = await fetch(`${apiUrl}/auth/v1/settings`, { signal: AbortSignal.timeout(5000) });
    enabled = (await response.json())?.external?.google === true;
  } catch {
    console.log(`  Google       could not ask ${apiUrl}/auth/v1/settings whether it is on.`);
    return;
  }
  if (enabled) {
    console.log(`  Google       on; the OAuth client's redirect URI is ${apiUrl}/auth/v1/callback`);
  } else if (googleCredentials !== null) {
    console.log('  Google       off, although .env.local carries its credentials.');
  }
  if (enabled !== (googleCredentials !== null)) {
    console.log('               The stack was already up and kept the settings it started with;');
    console.log('               `npm run db -- park` and `up` again to apply .env.local.');
  }
};

/**
 * vitest against the `test` database: the same invocation `test:db` runs, plus
 * whatever was passed through, and the three variables CI's own step sets —
 * nothing else, so a green run here and a green run there mean the same thing.
 * The URL and keys come out of the database itself, never out of .env.local,
 * which `up` rewrites and a dev server is reading.
 *
 * vitest is spawned as its own JS entry rather than through npm: an npm child
 * on Windows means a shell, and a test path with a space in it would come apart
 * in the quoting. Its entry is resolved the way node resolves any import rather
 * than joined onto the checkout: a worktree has no node_modules of its own and
 * finds the parent checkout's by walking upward.
 */
const runVitest = (values) =>
  new Promise((resolve) => {
    const vitest = spawn(
      process.execPath,
      [
        createRequire(path.join(checkout, 'package.json')).resolve('vitest/vitest.mjs'),
        '--run',
        '--config',
        'vitest.config.db.mts',
        ...extraArgs,
      ],
      {
        cwd: checkout,
        stdio: 'inherit',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: values.api_url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: values.anon_key,
          SUPABASE_SERVICE_ROLE_KEY: values.service_key,
        },
      },
    );
    vitest.on('error', (error) => {
      console.error(`Could not run vitest: ${error.message}`);
      resolve(1);
    });
    vitest.on('close', (code) => resolve(code ?? 1));
  });

const startedAt = Date.now();
const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(0);
const log = openLog();

/**
 * A distro run that did not succeed, told the reader, and this script's exit.
 * Either the shell file never started, or it started and exited with the status
 * reserved for "could not run" — that is COULD_NOT_RUN; anything else is an
 * outcome.
 */
const failRun = (run) => {
  const exitCode = !run.started || run.code === COULD_NOT_RUN ? COULD_NOT_RUN : 1;
  if (run.message) fail(run.message, exitCode);
  reportFailure(log, run, elapsed());
  fail('', exitCode);
};

/**
 * The blocks Windows can bind and no record claims, as one bare word — `-`
 * when there are none, or when the command never allocates. Probed on every run
 * of a command that may allocate, because only the distro knows whether this
 * one will: a stack that already has a record ignores the list. The claims are
 * read first, in one round trip, so that a block another stack may be starting
 * on is never probed (lib/local-db-ports.mjs says why). The distro re-checks the
 * claims under its lock when it picks, so this read is a guard for the probe and
 * not the authority on what is free.
 */
let candidateBlocks = '-';
if (spec.allocatesPorts) {
  const claims = await runInDistro({ shellFile: 'claimed.sh', args: [checkoutWsl, runProjectId, '-', cliVersion], log });
  if (claims.code !== 0) failRun(claims);
  candidateBlocks = (await bindableBlocks(parseClaimedBlocks(claims.values.claimed))).join(',') || '-';
}

/**
 * `test` hands the database to vitest once it is `ready`, and closes the shell
 * file's stdin when vitest is done, which is what removes the database. Ctrl-C
 * reaches vitest and wsl.exe on its own; this script closes that stdin itself in
 * case the database was still being built when it came. The database is
 * removed by its run's trap or, failing that, by the next allocation's reaper,
 * so a second Ctrl-C stops waiting for the run and leaves.
 */
let vitestRun = null;
let interrupted = false;
let distroChild = null;
const release = () => distroChild?.stdin?.end('done\n');
if (command === 'test') {
  process.on('SIGINT', () => {
    if (interrupted) {
      console.error(
        'Stopped waiting. The throwaway database is removed by its run\'s cleanup or, failing that, by the next run to choose ports.',
      );
      if (log !== null) console.error(`Full log: ${log.file}`);
      process.exit(130);
    }
    interrupted = true;
    release();
  });
}

const result = await runInDistro({
  shellFile: command === 'test' ? 'test-db.sh' : `${command}.sh`,
  args: [checkoutWsl, runProjectId, candidateBlocks, cliVersion],
  log,
  onReady:
    command === 'test'
      ? (child, values) => {
          distroChild = child;
          if (interrupted) {
            release();
            return;
          }
          console.log(`test:db:local: a throwaway database at ${values.api_url}, built in ${elapsed()}s`);
          vitestRun = runVitest(values).then((code) => {
            release();
            return code;
          });
        }
      : undefined,
});
const vitestCode = vitestRun === null ? null : await vitestRun;
log?.close();

// Whatever the command did, the answer to "is anything of ours running" decides
// whether the distro is held open. A run that failed before it could say leaves
// the keep-alive as it found it.
if (result.values.running !== undefined) {
  if (Number(result.values.running) > 0) holdKeepAlive();
  else releaseKeepAlive();
}

if (command === 'test' && vitestCode !== null) {
  // vitest has spoken for itself; what is left to say is only a database that
  // was not removed.
  if (result.code !== 0) reportFailure(log, result, elapsed(), 'Removing the throwaway database failed');
  process.exit(vitestCode !== 0 ? vitestCode : result.code === 0 ? 0 : 1);
}

if (interrupted) {
  fail(
    `${command} interrupted before the tests ran. The throwaway database is removed by its run's cleanup or, ` +
      'failing that, by the next run to choose ports.',
    130,
  );
}

// A `test` run that got here never reached its tests, whatever the shell file's code.
if (result.code !== 0 || command === 'test') failRun(result);

for (const line of result.said) console.log(line);
if (command === 'up') await reportGoogle(result.values.api_url);
if (!spec.verbatim) console.log(`${command}: done in ${elapsed()}s`);
