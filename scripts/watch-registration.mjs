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
 * ## Reading it
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

import { appendFileSync, existsSync, readFileSync } from "node:fs";
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
const LOG_FILE = argOf("log", `registration-watch-${Date.now()}.jsonl`);

if (!OPENS_AT) {
  console.error(
    "\n--opens-at is required: the products' registration_opens_at, e.g. 2026-08-24T09:00:00Z\n" +
      "It identifies which cohort of products to watch.\n",
  );
  process.exit(1);
}

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

const n = (v) => (v === null || v === undefined ? "—" : String(v));

async function tick(cohort) {
  const [auth, gauges, parts] = await Promise.all([
    authCounts(1).catch(() => null),
    nodeGauges().catch(() => null),
    participations(cohort).catch(() => null),
  ]);

  const at = new Date().toISOString();
  appendFileSync(LOG_FILE, `${JSON.stringify({ at, auth, gauges, parts: parts && { ...parts, perProduct: undefined } })}\n`);

  const hottest = parts
    ? Object.entries(parts.perProduct)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => {
          const seat = cohort.products.find((p) => p.id === id)?.seat_count ?? "?";
          const label = (cohort.names[id] ?? id).slice(0, 28);
          return `${label} ${count}/${seat}${count >= seat ? " FULL" : ""}`;
        })
        .join(" · ")
    : "—";

  const alarm = auth && auth.s504 > 0 ? "  *** 504s — parents are seeing failures ***" : "";
  console.log(
    `\n${at.slice(11, 19)}  ${STAGING ? "STAGING" : "PROD"}${alarm}\n` +
      `  FUNNEL (last 60s)              HEALTH\n` +
      `    registrations  ${n(auth?.register).padEnd(14)} GoTrue 504   ${n(auth?.s504)}\n` +
      `    sign-ins       ${n(auth?.signin).padEnd(14)} GoTrue 429   ${n(auth?.s429)}  (per-IP limit)\n` +
      `    new seats      ${n(parts?.lastMinute).padEnd(14)} load1        ${n(gauges?.load1)}  (trails ~45s)\n` +
      `  TOTALS                           mem avail    ${n(gauges?.memAvailableMB)} MB\n` +
      `    seats claimed  ${n(parts?.active)}/${cohort.seats}`.padEnd(35) +
      `  pooler waiting ${n(gauges?.poolerWaiting)}\n` +
      `    waitlisted     ${n(parts?.waitlisted)}\n` +
      `  HOTTEST  ${hottest}`,
  );
}

const cohort = await loadCohort();
console.error(
  `[watch] ${STAGING ? "staging" : "PROD"} · ${cohort.products.length} clubs · ${cohort.seats} seats · every ${INTERVAL}s · logging to ${LOG_FILE}`,
);
for (;;) {
  await tick(cohort).catch((e) => console.error(`[watch] poll failed: ${e.message}`));
  await new Promise((r) => setTimeout(r, INTERVAL * 1000));
}
