/**
 * How many families per minute can sign up before parents start seeing errors?
 *
 *   node scripts/measure-registration-capacity.mjs --target https://<preview>.vercel.app \
 *        --products fixtures.json
 *
 * Drives the real family journey — register → sign in → set the parent PIN →
 * add a gamer → claim a seat — at held, stepped arrival rates, with a
 * background of anonymous shop browsing, and reports at each rate how many
 * families completed **without seeing a single error**. A family is counted as
 * failed if any step fails, because that is what the parent experiences; a
 * per-endpoint success rate flatters the result.
 *
 * ## Why this exists
 *
 * Written for the 2026-08-24 Helsinki municipal registration opening (~43 clubs
 * opening at one instant). `docs/performance.md` § F7 records what it found and
 * is the place to read before running it again — most usefully, that the
 * bottleneck is Supabase Auth rather than Postgres, so the number this reports
 * moves with GoTrue's limits and barely at all with query tuning.
 *
 * **Report it in families/minute, not requests/second.** One family is two auth
 * accounts (parent and child) plus a seat claim, and a parent who registers
 * without adding a child has not enrolled anyone — so families are the unit the
 * event is actually measured in.
 *
 * ## It refuses to touch production, by construction
 *
 * This script creates real accounts and claims real seats. Pointed at prod it
 * would enrol junk families into clubs families are paying for. So it reads the
 * Supabase project ref out of the environment and **exits unless it matches
 * `SUPABASE_PROJECT_REF`** (the staging keys in `.env.local`). There is
 * deliberately no override flag: a flag would eventually get typed.
 *
 * ## What it needs first
 *
 * `--products` is a JSON array of product ids to enrol into, and they must be
 * products that genuinely accept signups: `municipality_club` /
 * `external_contract`, visible, `waitlist_enabled`, a `seat_count`, and
 * `registration_opens_at` in the past — the seat-claim RPC re-checks all of
 * that, so a future open date cannot be faked from the client. Passing the ids
 * explicitly rather than discovering them is the second half of the prod guard:
 * the script can only reach products someone deliberately listed.
 *
 * Point `--target` at a deployment whose `NEXT_PUBLIC_SUPABASE_URL` is staging.
 * Deploy it with `BREVO_API_KEY=` empty: the send wrapper then throws before any
 * network call and the route's try/catch swallows it, so a run costs no email
 * credits and — more importantly — sends nothing to the non-existent addresses
 * it invents, which would otherwise be recorded against the sending domain as
 * hard bounces.
 *
 * Clean up afterwards. Every run leaves two auth accounts per family behind,
 * and a sweep for gamer profiles with no `parent_gamer` link is worth doing too
 * (see F7: the compensating delete in the gamer-creation route can itself fail
 * under load, orphaning accounts).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Agent, setGlobalDispatcher } from "undici";
import { createServerClient } from "@supabase/ssr";

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

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

loadEnvLocal();

const TARGET = arg("target");
const PRODUCTS_FILE = arg("products");
if (!TARGET) fail("--target is required: the deployment to drive.");
if (!PRODUCTS_FILE) fail("--products is required: a JSON array of product ids to enrol into.");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STAGING_REF = process.env.SUPABASE_PROJECT_REF;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STAGING_REF) {
  fail("`.env.local` needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_PROJECT_REF.");
}

// The prod guard. `SUPABASE_PROJECT_REF` is staging by convention in this repo
// (prod lives under SUPABASE_PROD_PROJECT_REF), so anything else means the
// environment has been pointed somewhere this script must not write to.
if (!SUPABASE_URL.includes(STAGING_REF)) {
  fail(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) is not the staging project ` +
      `(${STAGING_REF}). This script creates accounts and claims seats.`,
  );
}

const RATES = (arg("rates", "1,2,3,4,5,6,7,8")).split(",").map(Number);
const STEP_SECONDS = Number(arg("step", 20));
const BROWSE_RPS = Number(arg("browse", 20));
const RUN_ID = arg("run-id", `cap${Date.now().toString(36)}`);
const PRODUCTS = JSON.parse(readFileSync(PRODUCTS_FILE, "utf8"));
if (!Array.isArray(PRODUCTS) || PRODUCTS.length === 0) fail("--products must be a non-empty JSON array.");

// Generous socket pool, or the generator becomes the thing being measured.
setGlobalDispatcher(new Agent({ connections: 512, keepAliveTimeout: 30_000 }));

let seq = 0;
const rows = [];

const jarHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

function absorb(jar, res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}

async function oneFamily(rate) {
  const i = seq++;
  // `.invalid` is reserved by RFC 2606 and can never resolve, so these
  // addresses cannot reach a real inbox even if mail were enabled by mistake.
  const email = `cap-${RUN_ID}-${i}@loadtest.invalid`;
  const password = `Cap!${RUN_ID}${i}aB9`;
  const productId = PRODUCTS[i % PRODUCTS.length];
  const row = { rate, ok: false, failedAt: null, failStatus: null, totalMs: 0 };
  const started = performance.now();
  const jar = {};

  try {
    let res = await fetch(`${TARGET}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, firstName: "Load", lastName: "Testi", locale: "fi" }),
    });
    if (!res.ok) { row.failedAt = "register"; row.failStatus = res.status; throw new Error(); }
    await res.text();

    // Sign-in goes browser → GoTrue directly in the real app, so it does here
    // too; routing it through the deployment would measure the wrong path.
    const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
        setAll: (l) => l.forEach(({ name, value }) => (jar[name] = value)),
      },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) { row.failedAt = "signin"; row.failStatus = error.status ?? "error"; throw new Error(); }

    // Every new parent meets the PIN gate before any customer route will answer
    // them; creating the PIN also sets the unlock cookie.
    res = await fetch(`${TARGET}/api/auth/pin`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jarHeader(jar) },
      body: JSON.stringify({ pin: String(1000 + (i % 9000)) }),
    });
    if (!res.ok) { row.failedAt = "pin"; row.failStatus = res.status; throw new Error(); }
    absorb(jar, res);
    await res.text();

    res = await fetch(`${TARGET}/api/gamers/create`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jarHeader(jar) },
      body: JSON.stringify({ firstName: `Lapsi${i}`, dateOfBirth: "2015-05-14" }),
    });
    if (!res.ok) { row.failedAt = "gamer"; row.failStatus = res.status; throw new Error(); }
    const { gamerId } = JSON.parse(await res.text());

    // `{"status":"full"}` is a 200 and a normal outcome, not an error — the
    // club filled, which is what a waitlist is for.
    res = await fetch(`${TARGET}/api/checkout/products/create`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jarHeader(jar) },
      body: JSON.stringify({ productId, participantId: gamerId, purchaseShape: "external", currency: "eur" }),
    });
    if (!res.ok) { row.failedAt = "claim"; row.failStatus = res.status; throw new Error(); }
    await res.text();
    row.ok = true;
  } catch {
    /* row already records where it broke */
  }
  row.totalMs = Math.round(performance.now() - started);
  rows.push(row);
}

const browse = { ok: 0, fail: 0 };
const browseTimer = BROWSE_RPS > 0
  ? setInterval(() => {
      for (let i = 0; i < BROWSE_RPS; i++) {
        const p = Math.random() < 0.35 ? "/shop" : `/shop/${PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]}`;
        fetch(`${TARGET}${p}`, { headers: { accept: "text/html" } })
          .then((r) => { r.ok ? browse.ok++ : browse.fail++; return r.arrayBuffer(); })
          .catch(() => browse.fail++);
      }
    }, 1000)
  : null;

console.error(`[capacity] target=${TARGET} products=${PRODUCTS.length} rates=${RATES.join(",")}/s step=${STEP_SECONDS}s browse=${BROWSE_RPS}rps`);

const live = new Set();
for (const rate of RATES) {
  const gap = 1000 / rate;
  const end = Date.now() + STEP_SECONDS * 1000;
  while (Date.now() < end) {
    const p = oneFamily(rate);
    live.add(p);
    p.finally(() => live.delete(p));
    await new Promise((r) => setTimeout(r, gap));
  }
  const done = rows.filter((r) => r.rate === rate);
  console.error(`[capacity] ${rate * 60}/min → ${done.filter((r) => r.ok).length}/${done.length} clean`);
}
while (live.size) await Promise.all([...live]);
if (browseTimer) clearInterval(browseTimer);

const pct = (v, p) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const out = { target: TARGET, runId: RUN_ID, browse, steps: [] };
for (const rate of RATES) {
  const r = rows.filter((x) => x.rate === rate);
  const bad = r.filter((x) => !x.ok);
  const where = {};
  bad.forEach((x) => {
    const k = `${x.failedAt}:${x.failStatus}`;
    where[k] = (where[k] ?? 0) + 1;
  });
  out.steps.push({
    perMin: rate * 60,
    families: r.length,
    clean: r.length - bad.length,
    errorPct: r.length ? Math.round((bad.length / r.length) * 100) : null,
    p50: pct(r.map((x) => x.totalMs), 50),
    p95: pct(r.map((x) => x.totalMs), 95),
    failures: where,
  });
}
console.log(JSON.stringify(out, null, 2));
