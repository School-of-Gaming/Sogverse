/**
 * Live view of a registration opening, for watching one happen.
 *
 *   node scripts/watch-registration.mjs --opens-at 2026-08-24T09:00:00Z
 *   node scripts/watch-registration.mjs --opens-at ... --staging
 *   node scripts/watch-registration.mjs --opens-at ... --interval 5
 *
 * **Read-only.** It issues counting reads against PostgREST and reads two
 * Supabase analytics endpoints. It writes nothing except its own log file.
 *
 * ## What it is for
 *
 * Two jobs, and the second is the more valuable one.
 *
 * Live, it answers "are families getting through?" — the funnel on the left,
 * the health signals on the right. The one number to watch is **GoTrue 504s**:
 * that is the auth service exceeding its own 10-second request deadline, and it
 * is precisely what a parent experiences as "it broke". Latency climbing is
 * survivable and expected; 504s are not.
 *
 * Afterwards, it leaves a JSONL file with one row per poll — which is the point.
 * A load rehearsal can measure how much traffic the platform survives, but it
 * cannot tell you how fast real families actually arrive, and arrival shape is
 * what decides whether a given compute tier was enough. Capture it once and
 * every future opening can be planned against real numbers instead of a guess.
 * See `docs/performance.md` § F7 for the measured capacity this is watched
 * against.
 *
 * The log lands in `scripts/output/` (gitignored), named for the opening rather
 * than for the run, so restarting mid-event appends to the same file.
 *
 * ## Reading it
 *
 * On a terminal the display repaints in place and colours each number against
 * the thresholds § F7 measured for this tier — so "is that load figure bad?" is
 * answered by the colour rather than by remembering what 2.0 means on 2 cores.
 * Piped or redirected output drops both and scrolls plainly, which is what you
 * want when capturing it. Because an in-place repaint destroys history, the
 * **WORST** row keeps the high-water mark of every alarming number: a 504 burst
 * that clears between two polls still leaves its count and its timestamp there.
 *
 * - **`GoTrue 429`** is a different failure from 504 and means something quite
 *   specific: the per-IP auth rate limit (burst 30, refilling 360/hour). Real
 *   families are on hundreds of IPs and should never collectively trip it, so
 *   a non-zero count here is evidence that families are sharing an egress IP —
 *   carrier NAT, or a school network. It is the one risk that cannot be
 *   predicted in advance, only observed.
 * - **`load1` trails reality by 30–60s.** Supabase's metrics endpoint is not
 *   real-time; the log-derived counts beside it are. Read load for the trend,
 *   never for "what is happening right now".
 * - **Seats claimed** comes from Postgres, which stays fast even when auth is
 *   struggling — so it is the honest measure of enrolment, and it can keep
 *   climbing while registrations are failing.
 *
 * A failing data source degrades to `—` rather than taking the display down;
 * an opening is not the moment for the monitoring to be the thing that breaks.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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

const has = (n) => process.argv.includes(`--${n}`);
const argOf = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const STAGING = has("staging");
const OPENS_AT = argOf("opens-at");
const INTERVAL = Number(argOf("interval", 10));

if (!OPENS_AT) {
  console.error(
    "\n--opens-at is required: the products' registration_opens_at, e.g. 2026-08-24T09:00:00Z\n" +
      "It identifies which cohort of products to watch.\n",
  );
  process.exit(1);
}

// Named for the opening it records, not for the moment the process started, so
// two runs across one event append to one file and separate openings never mix.
// `scripts/output/` is gitignored — see the comment on that entry.
const LOG_FILE = argOf("log", `scripts/output/registration-watch-${OPENS_AT.slice(0, 10)}.jsonl`);

const REF = STAGING ? process.env.SUPABASE_PROJECT_REF : process.env.SUPABASE_PROD_PROJECT_REF;
const SERVICE_KEY = STAGING
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_PROD_SERVICE_ROLE_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !SERVICE_KEY || !TOKEN) {
  console.error("`.env.local` needs the project ref, its service-role key, and SUPABASE_ACCESS_TOKEN.");
  process.exit(1);
}
const REST = `https://${REF}.supabase.co/rest/v1`;

// New-format keys (sb_secret_…) are not JWTs — PostgREST wants them in `apikey`.
// An Authorization: Bearer header fails with "Invalid Compact JWS".
const restHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(pathAndQuery) {
  const res = await fetch(`${REST}/${pathAndQuery}`, { headers: restHeaders });
  if (!res.ok) throw new Error(`PostgREST ${res.status}`);
  return res.json();
}

/** The products this opening is about, resolved once. */
async function loadCohort() {
  const products = await rest(
    `products?select=id,seat_count&product_type=eq.municipality_club&registration_opens_at=eq.${encodeURIComponent(OPENS_AT)}`,
  );
  if (!products.length) {
    console.error(`\nNo municipality_club products with registration_opens_at = ${OPENS_AT}.\n`);
    process.exit(1);
  }
  const ids = products.map((p) => p.id);
  const names = {};
  const translations = await rest(
    `product_translations?select=product_id,name&locale=eq.en&product_id=in.(${ids.join(",")})`,
  );
  translations.forEach((t) => (names[t.product_id] = t.name));
  return { products, ids, names, seats: products.reduce((n, p) => n + (p.seat_count ?? 0), 0) };
}

/** Auth request outcomes over a window, straight from the edge logs. */
async function authCounts(sinceMinutes) {
  const end = new Date();
  const start = new Date(end.getTime() - sinceMinutes * 60_000);
  const sql = `select r.path as path, cast(f.status_code as string) as status, count(*) as n
    from edge_logs cross join unnest(metadata) as m
    cross join unnest(m.response) as f cross join unnest(m.request) as r
    where r.path like '%/auth/v1/%' group by path, status`;
  const url =
    `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all` +
    `?sql=${encodeURIComponent(sql)}` +
    `&iso_timestamp_start=${start.toISOString().replace(/\.\d+Z$/, "Z")}` +
    `&iso_timestamp_end=${end.toISOString().replace(/\.\d+Z$/, "Z")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`logs ${res.status}`);
  const { result } = await res.json();
  const out = { register: 0, signin: 0, s504: 0, s429: 0, total: 0 };
  for (const row of result ?? []) {
    const n = Number(row.n);
    out.total += n;
    if (row.status === "504") out.s504 += n;
    if (row.status === "429") out.s429 += n;
    if (row.status === "200" && row.path.includes("/admin/users")) out.register += n;
    if (row.status === "200" && row.path.includes("/token")) out.signin += n;
  }
  return out;
}

async function nodeGauges() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/metrics`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`metrics ${res.status}`);
  const text = await res.text();
  const pick = (name) => {
    let total = null;
    for (const line of text.split("\n")) {
      if (!line.startsWith(name)) continue;
      const v = Number(line.slice(line.lastIndexOf(" ") + 1));
      if (!Number.isNaN(v)) total = (total ?? 0) + v;
    }
    return total;
  };
  const avail = pick("node_memory_MemAvailable_bytes");
  return {
    load1: pick("node_load1"),
    memAvailableMB: avail ? Math.round(avail / 1e6) : null,
    poolerWaiting: pick("pgbouncer_pools_client_waiting_connections"),
  };
}

async function participations(cohort) {
  const rows = await rest(
    `participations?select=product_id,status,created_at&product_id=in.(${cohort.ids.join(",")})`,
  );
  const cutoff = Date.now() - 60_000;
  const perProduct = {};
  let active = 0;
  let waitlisted = 0;
  let lastMinute = 0;
  for (const r of rows) {
    if (r.status === "active") {
      active++;
      perProduct[r.product_id] = (perProduct[r.product_id] ?? 0) + 1;
    }
    if (r.status === "waitlisted") waitlisted++;
    if (Date.parse(r.created_at) >= cutoff) lastMinute++;
  }
  return { active, waitlisted, lastMinute, perProduct };
}

/**
 * Colour only when stdout is a terminal that wants it. Piped or redirected
 * output stays plain and keeps scrolling, so the display being a live dashboard
 * never costs you the ability to capture it.
 */
const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = paint("2");
const bold = paint("1");
const green = paint("32");
const yellow = paint("33");
const red = paint("31");
const cyan = paint("36");
const heading = paint("1;36");
const siren = paint("1;41;97");

const n = (v) => (v === null || v === undefined ? "—" : String(v));

/**
 * Pick a colour by threshold. Two directions because half these numbers are bad
 * when they climb (504s, load) and half when they fall (free memory).
 * Pad before painting — `padEnd` counts escape bytes and would wreck alignment.
 */
const rising = (v, warn, bad) =>
  v === null || v === undefined ? dim : v >= bad ? red : v >= warn ? yellow : green;
const falling = (v, warn, bad) =>
  v === null || v === undefined ? dim : v <= bad ? red : v <= warn ? yellow : green;
const cell = (v, width, colour) => colour(n(v).padEnd(width));

/**
 * The worst reading seen so far, which an in-place display would otherwise lose.
 * A 504 burst that clears before the next repaint still has to leave a mark —
 * the whole point of watching is to know it happened.
 */
const worst = { s504: 0, s429: 0, load1: 0, register: 0, at504: null };

/** Thresholds are the measured ones for this tier — docs/performance.md § F7. */
const REG_COMFORTABLE = 250;
const REG_DEGRADING = 360;

function seatBar(done, total, width = 34) {
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(frac * width);
  const full = frac >= 1;
  return (full ? green : cyan)("█".repeat(filled)) + dim("░".repeat(width - filled));
}

function countdown(nowMs) {
  const delta = Date.parse(OPENS_AT) - nowMs;
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const span = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return delta > 0 ? dim(`opens in ${span}`) : green(`open ${span}`);
}

/** Home the cursor and clear to end, rather than wiping the screen — no flicker. */
function draw(frame) {
  if (COLOR) process.stdout.write(`\x1b[H${frame}\n\x1b[J`);
  else console.log(`\n${frame}`);
}

let polls = 0;

async function tick(cohort) {
  const [auth, gauges, parts] = await Promise.all([
    authCounts(1).catch(() => null),
    nodeGauges().catch(() => null),
    participations(cohort).catch(() => null),
  ]);

  const at = new Date().toISOString();
  appendFileSync(LOG_FILE, `${JSON.stringify({ at, auth, gauges, parts: parts && { ...parts, perProduct: undefined } })}\n`);

  polls++;
  if (auth) {
    if (auth.s504 > worst.s504) {
      worst.s504 = auth.s504;
      worst.at504 = at.slice(11, 19);
    }
    worst.s429 = Math.max(worst.s429, auth.s429);
    worst.register = Math.max(worst.register, auth.register);
  }
  if (gauges?.load1 != null) worst.load1 = Math.max(worst.load1, gauges.load1);

  const hottest = parts
    ? Object.entries(parts.perProduct)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => {
          const seat = cohort.products.find((p) => p.id === id)?.seat_count ?? "?";
          const label = (cohort.names[id] ?? id).slice(0, 26);
          return count >= seat ? green(`${label} ${count}/${seat} FULL`) : `${label} ${cyan(`${count}/${seat}`)}`;
        })
        .join(dim(" · "))
    : dim("—");

  const active = parts?.active ?? 0;
  const pct = cohort.seats > 0 ? Math.round((active / cohort.seats) * 100) : 0;
  const target = STAGING ? yellow("STAGING") : bold("PROD");

  const banner =
    auth && auth.s504 > 0
      ? `\n  ${siren(`  504s — PARENTS ARE SEEING FAILURES (${auth.s504} in the last 60s)  `)}\n`
      : "";

  draw(
    `  ${heading("Sogverse · registration watch")}   ${target}   ${countdown(Date.now())}   ${dim(at.slice(11, 19))}\n` +
      banner +
      `\n  ${heading("FUNNEL")} ${dim("last 60s")}                 ${heading("HEALTH")}\n` +
      `    registrations  ${cell(auth?.register, 15, rising(auth?.register, REG_COMFORTABLE, REG_DEGRADING))}GoTrue 504     ${cell(auth?.s504, 8, rising(auth?.s504, 1, 1))}\n` +
      `    sign-ins       ${cell(auth?.signin, 15, dim)}GoTrue 429     ${cell(auth?.s429, 8, rising(auth?.s429, 1, 1))}${dim("per-IP limit")}\n` +
      `    new seats      ${cell(parts?.lastMinute, 15, cyan)}load1          ${cell(gauges?.load1, 8, rising(gauges?.load1, 1, 2))}${dim("2 cores · trails ~45s")}\n` +
      `                                  mem avail      ${cell(gauges?.memAvailableMB, 8, falling(gauges?.memAvailableMB, 600, 300))}${dim("MB")}\n` +
      `  ${heading("SEATS")}                           pooler waiting ${cell(gauges?.poolerWaiting, 8, rising(gauges?.poolerWaiting, 1, 1))}\n` +
      `    ${seatBar(active, cohort.seats)}  ${bold(`${active}/${cohort.seats}`)} ${dim(`(${pct}%)`)}\n` +
      `    waitlisted     ${cell(parts?.waitlisted, 15, yellow)}\n` +
      `\n  ${dim("HOTTEST")}  ${hottest}\n` +
      `  ${dim("WORST")}    504 ${worst.s504 > 0 ? red(`${worst.s504} at ${worst.at504}`) : green("0")}` +
      `${dim(" · ")}429 ${worst.s429 > 0 ? yellow(worst.s429) : green("0")}` +
      `${dim(" · ")}load1 ${worst.load1 >= 2 ? red(worst.load1) : dim(worst.load1)}` +
      `${dim(" · ")}reg/min ${worst.register >= REG_DEGRADING ? red(worst.register) : dim(worst.register)}\n` +
      `  ${dim(`poll ${polls} · every ${INTERVAL}s · ${LOG_FILE}`)}`,
  );
}

// The default log directory is gitignored and so missing on a fresh clone. Make
// it before the first poll rather than lose an opening's opening minute to ENOENT.
mkdirSync(path.dirname(path.resolve(LOG_FILE)), { recursive: true });

const cohort = await loadCohort();
console.error(
  `[watch] ${STAGING ? "staging" : "PROD"} · ${cohort.products.length} clubs · ${cohort.seats} seats · every ${INTERVAL}s · logging to ${LOG_FILE}`,
);

// Leaving the cursor hidden after Ctrl+C would outlive the process and break the shell.
const showCursor = () => COLOR && process.stdout.write("\x1b[?25h\n");
process.on("SIGINT", () => {
  showCursor();
  process.exit(0);
});
process.on("exit", showCursor);
if (COLOR) process.stdout.write("\x1b[2J\x1b[?25l");

for (;;) {
  await tick(cohort).catch((e) => console.error(`[watch] poll failed: ${e.message}`));
  await new Promise((r) => setTimeout(r, INTERVAL * 1000));
}
