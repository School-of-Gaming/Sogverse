/**
 * The whole lifecycle in one command: seed → capture → tear down.
 *
 *   node scripts/page-capture/run.mjs [--base-url http://localhost:3002]
 *                                     [--only slug,slug] [--viewport desktop]
 *                                     [--out <dir>] [--keep]
 *
 * This is the entry point for the ordinary case — "photograph the app as it
 * stands" — and it cleans up after itself by default. `--keep` leaves the fleet
 * and its `seed-state.json` in place, which is what you want while iterating:
 * seed once, then run `capture.mjs` over and over against the same accounts as
 * you change the design, and clean up when you are done.
 *
 * Teardown runs even when the capture fails. A crashed capture is exactly the
 * run most likely to leave accounts behind, and staging accumulating orphaned
 * TEMP fleets is how a tool becomes a chore. The screenshots survive it —
 * they are already on disk, and they are the output.
 *
 * It does not start a server. Pass `--base-url`, or start one with `serve.mjs`
 * first; a lifecycle command that reaches out and manages someone's dev server
 * is a lifecycle command that eventually kills the wrong one.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argOf, hasFlag } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP = hasFlag("keep");

/** Pass these straight through to `capture.mjs` rather than re-declaring them. */
const PASS_THROUGH = ["base-url", "only", "viewport", "out", "state"];

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...args], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const captureArgs = [];
for (const flag of PASS_THROUGH) {
  const value = argOf(flag);
  if (value !== undefined) captureArgs.push(`--${flag}`, value);
}
if (hasFlag("headed")) captureArgs.push("--headed");

const seedArgs = [];
for (const flag of ["pin", "live-minutes", "live-started"]) {
  const value = argOf(flag);
  if (value !== undefined) seedArgs.push(`--${flag}`, value);
}
// The state file has two names, because the two scripts mean different things
// by `--out`: for the seed it is where the state lands, for the capture it is
// where the pictures land. Translating it here is what keeps a `--state` on
// this command from seeding one path and reading another.
const statePath = argOf("state");
if (statePath !== undefined) seedArgs.push("--out", statePath);

const cleanupArgs = statePath === undefined ? [] : ["--state", statePath];

const seedStatus = run("seed.mjs", seedArgs);
if (seedStatus !== 0) {
  console.error("\n  Seed failed — nothing captured. See the message above for a partial fleet.\n");
  process.exit(seedStatus);
}

const captureStatus = run("capture.mjs", captureArgs);

if (KEEP) {
  console.log(
    "\n  --keep: the fleet and seed-state.json are still there.\n" +
      "  Re-capture against them, then:  node scripts/page-capture/cleanup.mjs\n",
  );
  process.exit(captureStatus);
}

const cleanupStatus = run("cleanup.mjs", cleanupArgs);

// The capture's outcome is what the caller asked about; a clean-up failure is
// reported loudly above but must not mask a successful pass, nor be hidden by
// one — so a failure in either is a failure here.
process.exit(captureStatus || cleanupStatus);
