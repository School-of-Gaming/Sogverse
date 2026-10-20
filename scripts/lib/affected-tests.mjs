#!/usr/bin/env node
/**
 * The test gate: runs the unit and integration test files a change could have
 * affected, decided by the import graph rather than by anyone's judgement.
 *
 * "The change" is everything that differs from the merge-base with origin/dev:
 * commits since it, staged, unstaged and untracked files. origin/dev, never
 * local dev, so a session committing straight onto dev still has a diff. A stale
 * origin/dev only moves the merge-base back, which selects more, never less.
 *
 * A test file is selected when any of these holds:
 *
 *   changed-path  The file itself, or any module in its import closure (static
 *                 and dynamic imports, walked through Vite's transform the way
 *                 `vitest --changed` walks them), is in the change.
 *   disk-reading  Some module in its closure, outside node_modules, imports the
 *                 file system, a child process, a glob library, or a library
 *                 that opens files it is handed by path (DISK_MODULES below).
 *                 Such a test reads the repo from disk — a sweep, a registry, a
 *                 stylesheet, a font — and the import graph cannot see what it
 *                 reads, so it always runs. Which modules do so is derived from
 *                 the graph on every run; only the libraries are listed.
 *   unwalkable    A module in its closure failed to transform, or imports a
 *                 relative, root-relative or `@/` specifier that resolves to
 *                 nothing on disk (Vite's SSR transform leaves an unresolved
 *                 specifier in place rather than throwing). Its imports are not
 *                 all known, so the test is run, and will most likely report
 *                 why. A bare package specifier that does not resolve is not
 *                 this: the walk never follows packages.
 *
 * Everything runs when a changed path is a force trigger (below), when the diff
 * cannot be computed (no origin/dev, shallow clone, not a git repo), when a
 * project's setup files select every test (below), or when a closure reaches
 * source outside this checkout, which a worktree resolving a workspace package
 * to the main checkout would do — the walk would then be blind to this
 * checkout's copy. It never falls back to zero tests.
 *
 * The setup files run before every test in their project, so their closures
 * are walked too, and whatever would select one test from a setup closure
 * selects them all: a changed path in it, or a module in it that reads the
 * disk, is unwalkable, or lies outside this checkout.
 *
 * What this does not see, and what covers it: a deleted or renamed module is in
 * no closure, so a test still importing it is caught by type-check, which stays
 * whole-repo for that reason; an import whose specifier is computed at run time
 * (`import(name)`, `require(name)`) is invisible to the walk. CI runs the whole
 * suite on every push regardless.
 *
 *   node scripts/lib/affected-tests.mjs           # select, then run the selection
 *   node scripts/lib/affected-tests.mjs --list    # print the selection, run nothing
 *   node scripts/lib/affected-tests.mjs --all     # run every test file
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createVitest } from 'vitest/node';

const BASE = 'origin/dev';

// A change to any of these runs everything. Each one changes how tests behave
// without being a module some test imports — or is imported so widely that
// walking for it buys nothing.
//   - the shared mocks and helpers: imported by nearly every test (the setup
//     files, injected into all, are covered by walking their closures);
//   - vitest.config.mts: the aliases, environments and pools;
//   - any tsconfig.json: esbuild reads the nearest one's compiler options when
//     transforming;
//   - any package.json, package-lock.json: what a bare import resolves to — and
//     the walk stops at node_modules, so a dependency bump is in no closure;
//   - this file: a bug in the selection must not select itself away.
const FORCE_FILES = [
  'vitest.config.mts',
  'package-lock.json',
  'scripts/lib/affected-tests.mjs',
];
const FORCE_DIRS = ['tests/mocks/', 'tests/helpers/'];
const FORCE_BASENAMES = ['package.json', 'tsconfig.json'];

// A module importing one of these reads or lists files, or runs a process that
// may. Matched against the bare specifier, with or without `node:`, and against
// a resolved path inside node_modules. A library that is handed a path and
// opens the file itself belongs here too, since its caller imports no fs; one
// this repo only ever hands bytes (sharp) does not.
const DISK_MODULES = [
  'fs',
  'fs/promises',
  'child_process',
  'fs-extra',
  'graceful-fs',
  'glob',
  'fast-glob',
  'globby',
  'tinyglobby',
  'execa',
  'tinyexec',
  'cross-spawn',
  // Font.register({ src: <path> }) reads the invoice PDF's fonts itself.
  '@react-pdf/renderer',
];

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const forceAll = args.includes('--all');

// Windows paths compare case-insensitively, and git and Vite disagree on slashes.
const norm = (p) => {
  const s = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};

const git = (root, gitArgs) =>
  execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Repo-relative changed paths, or a reason the diff could not be taken. */
function changedPaths(root) {
  try {
    const top = git(root, ['rev-parse', '--show-toplevel']).trim();
    const lists = [
      ['diff', '--name-only', '--no-renames', '-z', `${BASE}...HEAD`],
      ['diff', '--name-only', '--no-renames', '-z', '--cached'],
      ['ls-files', '--others', '--modified', '--exclude-standard', '-z'],
    ].map((a) => git(top, a).split('\0').filter(Boolean));
    return { top, paths: [...new Set(lists.flat())] };
  } catch (error) {
    const detail = String(error.stderr || error.message).trim().split('\n')[0];
    return { error: `could not diff against ${BASE} (${detail})` };
  }
}

function forceTrigger(rel) {
  if (FORCE_FILES.includes(rel)) return true;
  if (FORCE_DIRS.some((d) => rel.startsWith(d))) return true;
  return FORCE_BASENAMES.includes(path.posix.basename(rel));
}

const isDiskModule = (dep) => {
  const bare = dep.replace(/^node:/, '');
  return DISK_MODULES.some(
    (m) => bare === m || bare.startsWith(`${m}/`) || dep.includes(`/node_modules/${m}/`),
  );
};

/**
 * Walks import closures the way Vitest's own `--changed` does: transform the
 * module, follow its static and dynamic deps that exist on disk outside
 * node_modules. Records, per module, whether it imports the disk, and marks it
 * failed when it did not transform or a local dep resolves to nothing.
 */
function makeWalker(root) {
  const cache = new Map(); // project name -> Map(moduleId -> { deps, disk, failed })

  const visit = async (project, id) => {
    let modules = cache.get(project.name);
    if (!modules) cache.set(project.name, (modules = new Map()));
    if (modules.has(id)) return modules.get(id);
    const entry = (async () => {
      let transformed;
      try {
        const mod = project.vite.moduleGraph.getModuleById(id);
        transformed = mod?.ssrTransformResult || (await project.vitenode.transformRequest(id));
      } catch {
        transformed = null;
      }
      if (!transformed) return { deps: [], disk: false, failed: true };
      const raw = [...(transformed.deps || []), ...(transformed.dynamicDeps || [])];
      const deps = [];
      let disk = false;
      let failed = false;
      for (const dep of raw) {
        if (isDiskModule(dep)) disk = true;
        const clean = dep.split('?')[0];
        // Vite rewrites a dep it resolved to `/@fs/<absolute>` or a root-relative
        // path, and names its own virtual modules `/@id/…`. A relative or `@/`
        // specifier left raw is one it could not resolve; anything else is a
        // bare package, which the walk never follows.
        if (clean.startsWith('/@id/')) continue;
        const fsPath = clean.startsWith('/@fs/')
          ? clean.slice(process.platform === 'win32' ? 5 : 4)
          : clean.startsWith('/')
            ? path.join(project.config.root, clean)
            : /^\.{1,2}\//.test(clean)
              ? path.resolve(path.dirname(id), clean)
              : null;
        if (fsPath === null) {
          if (clean.startsWith('@/')) failed = true;
          continue;
        }
        if (fsPath.includes('node_modules')) continue;
        if (existsSync(fsPath)) deps.push(fsPath.replace(/\\/g, '/'));
        else failed = true;
      }
      return { deps, disk, failed };
    })();
    modules.set(id, entry);
    return entry;
  };

  /** The closure of one module: its module paths, and whether any reads disk. */
  return async (project, moduleId) => {
    const seen = new Set();
    let disk = false;
    let failed = false;
    const walk = async (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const info = await visit(project, id);
      disk ||= info.disk;
      failed ||= info.failed;
      await Promise.all(info.deps.map(walk));
    };
    await walk(moduleId);
    const outside = [...seen].filter((p) => !norm(p).startsWith(`${norm(root)}/`));
    return { paths: new Set([...seen].map(norm)), disk, failed, outside };
  };
}

async function select(vitest, specs) {
  const all = (reason) => ({
    selected: specs.map((spec) => ({ spec, why: 'all' })),
    line: `all ${specs.length} test files (${reason})`,
  });
  const total = specs.length;
  if (forceAll) return all('--all');

  const root = vitest.config.root;
  const diff = changedPaths(root);
  if (diff.error) return all(`${diff.error}; running the full suite`);

  const trigger = diff.paths.find(forceTrigger);
  if (trigger) return all(`${trigger} changed`);

  const changed = new Set(diff.paths.map((p) => norm(path.join(diff.top, p))));
  // A snapshot file is read by its test at run time, not imported.
  for (const p of diff.paths) {
    const m = p.match(/^(.*)\/__snapshots__\/(.+)\.snap$/);
    if (m) changed.add(norm(path.join(diff.top, m[1], m[2])));
  }

  const closureOf = makeWalker(root);
  const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

  // A setup file runs before every test in its project, so whatever would
  // select one test from its closure selects them all.
  for (const project of vitest.projects) {
    for (const setup of project.config.setupFiles) {
      const c = await closureOf(project, setup);
      const name = `${rel(setup)} (${project.name} project setup)`;
      const hit = [...c.paths].find((p) => changed.has(p));
      if (hit) return all(`${rel(hit)} changed, in the closure of ${name}`);
      if (c.outside.length > 0) return all(`${name} imports ${c.outside[0]}, outside this checkout`);
      if (c.disk) return all(`${name} reads the disk, so every test does`);
      if (c.failed) return all(`${name} is unwalkable`);
    }
  }

  const closures = await Promise.all(
    specs.map(async (spec) => [spec, await closureOf(spec.project, spec.moduleId)]),
  );

  const outside = closures.find(([, c]) => c.outside.length > 0);
  if (outside) {
    const [spec, c] = outside;
    return all(
      `${rel(spec.moduleId)} imports ${c.outside[0]}, outside this checkout, ` +
        'which the walk cannot match against this checkout’s changes; running the full suite',
    );
  }

  const counts = { 'changed-path': 0, 'disk-reading': 0, unwalkable: 0 };
  const selected = [];
  for (const [spec, c] of closures) {
    const why = [...c.paths].some((p) => changed.has(p))
      ? 'changed-path'
      : c.disk
        ? 'disk-reading'
        : c.failed
          ? 'unwalkable'
          : null;
    if (!why) continue;
    counts[why]++;
    selected.push({ spec, why });
  }
  const parts = Object.entries(counts)
    .filter(([k, n]) => n > 0 || k !== 'unwalkable')
    .map(([k, n]) => `${n} ${k}`);
  return {
    selected,
    line: `${selected.length} of ${total} test files selected (${parts.join(', ')}; ${diff.paths.length} changed paths vs ${BASE})`,
  };
}

// What the vitest CLI sets before creating its instance; tests read these.
process.env.TEST = 'true';
process.env.VITEST = 'true';
process.env.NODE_ENV ??= 'test';

const vitest = await createVitest('test', { run: true, watch: false });
let exitCode = 0;
try {
  const specs = await vitest.globTestSpecifications();
  const { selected, line } = await select(vitest, specs);
  // The first line of output, which the gates runner echoes even on a pass.
  console.log(`test: ${line}`);

  if (listOnly) {
    const row = ({ spec, why }) =>
      `${why.padEnd(13)} ${path.relative(vitest.config.root, spec.moduleId).replace(/\\/g, '/')}`;
    for (const r of selected.map(row).sort()) console.log(r);
  } else {
    const run = selected.map((s) => s.spec);
    await vitest.init();
    await vitest.cache.stats.populateStats(vitest.config.root, run);
    await vitest.runTestSpecifications(run, run.length === specs.length);
    exitCode = process.exitCode ?? 0;
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await vitest.close();
}
process.exit(exitCode);
