/**
 * Start a dev server for one checkout on one port, wait until it answers, and
 * stop it again on Ctrl-C.
 *
 *   node scripts/page-capture/serve.mjs [--port 3002] [--dir <checkout>]
 *
 * Only useful when there is not already a server to point `capture.mjs` at —
 * and often there is, because the person running a design pass usually has one
 * up. `capture.mjs --base-url` works against any of them; this script exists so
 * a from-cold run is one command rather than a paragraph of instructions.
 *
 * ## It only ever stops what it started
 *
 * The one hard rule here. This script tracks the process id it spawned and
 * kills that, and it refuses to start at all if the port is already answering.
 * It never kills by port — the machine running a capture pass is usually the
 * machine someone is also developing on, and "free up port 3000" is how you end
 * up killing the server they were watching.
 */

import { spawn } from "node:child_process";
import { argOf, log, REPO_ROOT } from "./lib.mjs";

const PORT = Number(argOf("port", "3002"));
const DIR = argOf("dir", REPO_ROOT);
const READY_TIMEOUT_MS = 180_000;

const url = `http://localhost:${PORT}`;

/** True if something is already answering — which is a reason to stop, not to fight it. */
async function isUp() {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

if (await isUp()) {
  console.log(
    `\n  ${url} is already answering — leaving it alone.\n` +
      `  Capture against it directly:\n` +
      `    node scripts/page-capture/capture.mjs --base-url ${url}\n`,
  );
  process.exit(0);
}

log.step(`Starting the dev server in ${DIR} on port ${PORT}`);

// `shell: true` because npm is a shim on Windows and cannot be exec'd directly.
// The child gets its own PORT rather than inheriting whatever the parent had.
const child = spawn("npm", ["run", "dev"], {
  cwd: DIR,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "inherit",
  shell: true,
});

let stopped = false;

function stop() {
  if (stopped) return;
  stopped = true;
  if (child.pid) {
    log.step(`Stopping the server this script started (pid ${child.pid})`);
    // On Windows a detached `next dev` leaves a child holding the port, so the
    // whole tree goes. `taskkill /T` is the only thing that reliably gets it.
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
child.on("exit", (code) => {
  if (!stopped) {
    console.error(`\n  Dev server exited with code ${code} before it was asked to.\n`);
    process.exit(code ?? 1);
  }
});

const deadline = Date.now() + READY_TIMEOUT_MS;
while (Date.now() < deadline) {
  if (await isUp()) {
    log.ok(`${url} is up`);
    console.log(`\n  Capture against it:\n    node scripts/page-capture/capture.mjs --base-url ${url}`);
    console.log(`\n  Ctrl-C here stops this server (and only this one).\n`);
    break;
  }
  await new Promise((r) => setTimeout(r, 1_000));
}

if (Date.now() >= deadline) {
  console.error(`\n  ${url} never came up within ${READY_TIMEOUT_MS / 1000}s.\n`);
  stop();
  process.exit(1);
}
