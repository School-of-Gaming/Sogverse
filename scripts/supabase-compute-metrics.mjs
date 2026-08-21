/**
 * Read a Supabase project's node and pooler gauges — the numbers that say
 * whether the box is starved rather than whether a query is slow.
 *
 *   node scripts/supabase-compute-metrics.mjs                 # staging
 *   node scripts/supabase-compute-metrics.mjs --prod
 *   node scripts/supabase-compute-metrics.mjs --watch 15      # re-read every 15s
 *
 * Supabase exposes these as Prometheus text at
 * `/v1/projects/{ref}/analytics/endpoints/metrics`, authenticated with
 * `SUPABASE_ACCESS_TOKEN`. The dashboard's own charts are easier to read; this
 * exists because a load test needs the numbers in a log next to its own
 * timings, and because two of them are the only way to tell CPU starvation
 * apart from a memory problem.
 *
 * ## Reading the output
 *
 * **`load1` is the one that matters, and it must be read against core count**,
 * which the tier decides — Micro/Small/Large are all 2 cores, XL is 4. Load 2.0
 * on a 2-core box is fully busy, not half busy; anything above it is work
 * queueing. A box can be at load 9 with memory untouched, which is exactly what
 * CPU starvation looks like and exactly what a memory-focused check misses.
 *
 * **`pswpin`/`pswpout` are counters, not gauges** — compare two readings. Any
 * movement at all means the box is swapping, which on Supabase is the signature
 * of an undersized instance rather than a busy one.
 *
 * **The endpoint lags.** Values were observed 30–60s behind reality during load
 * testing, so a reading taken the instant a burst starts will show the box idle.
 * For anything real-time, read the edge logs instead; use this for the trend.
 *
 * See `docs/performance.md` § F7 for what these looked like under a registration
 * burst, and for the Auth-log search strings that reveal GoTrue's connection
 * pool state — which no metric here exposes.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Load .env.local without clobbering the shell — the shell always wins. */
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const has = (name) => process.argv.includes(`--${name}`);
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const IS_PROD = has("prod");
const REF = IS_PROD ? process.env.SUPABASE_PROD_PROJECT_REF : process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("`.env.local` needs SUPABASE_ACCESS_TOKEN (a Supabase Management API token).");
  process.exit(1);
}
if (!REF) {
  console.error(`No project ref for ${IS_PROD ? "prod" : "staging"} in .env.local.`);
  process.exit(1);
}

const WANTED = [
  "node_memory_MemAvailable_bytes",
  "node_memory_MemTotal_bytes",
  "node_memory_SwapTotal_bytes",
  "node_memory_SwapFree_bytes",
  "node_load1",
  "node_load5",
  "node_vmstat_pswpin",
  "node_vmstat_pswpout",
  "pg_stat_database_num_backends",
  "pgbouncer_pools_server_active_connections",
  "pgbouncer_pools_client_waiting_connections",
];

async function read() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/metrics`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`metrics endpoint returned ${res.status}`);
  const text = await res.text();

  const m = {};
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const end = line.search(/[{ ]/);
    if (end < 0) continue;
    const name = line.slice(0, end);
    if (!WANTED.includes(name)) continue;
    const value = Number(line.slice(line.lastIndexOf(" ") + 1));
    // Several series share a name (per-database, per-pool); sum them, so the
    // number means "across the instance", which is what is being judged.
    if (!Number.isNaN(value)) m[name] = (m[name] ?? 0) + value;
  }

  const memAvail = m.node_memory_MemAvailable_bytes;
  const memTotal = m.node_memory_MemTotal_bytes;
  const swapUsed = (m.node_memory_SwapTotal_bytes ?? 0) - (m.node_memory_SwapFree_bytes ?? 0);
  return {
    at: new Date().toISOString(),
    project: IS_PROD ? "prod" : "staging",
    ref: REF,
    load1: m.node_load1,
    load5: m.node_load5,
    memAvailableMB: memAvail ? Math.round(memAvail / 1e6) : null,
    memTotalMB: memTotal ? Math.round(memTotal / 1e6) : null,
    swapUsedMB: Math.round(swapUsed / 1e6),
    pswpin: m.node_vmstat_pswpin,
    pswpout: m.node_vmstat_pswpout,
    backends: m.pg_stat_database_num_backends,
    poolerActive: m.pgbouncer_pools_server_active_connections,
    poolerWaiting: m.pgbouncer_pools_client_waiting_connections,
  };
}

const watch = Number(argOf("watch", 0));
if (!watch) {
  console.log(JSON.stringify(await read(), null, 2));
} else {
  for (;;) {
    const s = await read();
    console.log(
      `${s.at} load1=${s.load1} mem=${s.memAvailableMB}/${s.memTotalMB}MB swapUsed=${s.swapUsedMB}MB ` +
        `pswpout=${s.pswpout} backends=${s.backends} poolerWaiting=${s.poolerWaiting}`,
    );
    await new Promise((r) => setTimeout(r, watch * 1000));
  }
}
