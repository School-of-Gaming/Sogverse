/**
 * Pull real-user Speed Insights data for the production app and print a
 * readable summary: overview percentiles (p75/p90/p95/p99) per metric and
 * device, plus per-route breakdowns with sample sizes.
 *
 * Vercel has no official read API for Speed Insights (the documented API is
 * intake-only), so this calls the internal endpoint the dashboard itself uses:
 *
 *   https://vercel.com/api/speed-insights/v2/timeseries
 *   https://vercel.com/api/speed-insights/v2/breakdown
 *
 * (shape captured from dashboard devtools, 2026-08-13; `teamId` takes the team
 * *slug*, not the team_ id). Being undocumented, it can break without notice —
 * if it 404s, re-capture the request URL from the dashboard's network tab and
 * update the paths here.
 *
 * Auth: your local Vercel CLI login token (or VERCEL_TOKEN if set). Read-only.
 *
 * Usage:
 *   npm run perf:insights            # last 30 days, desktop + mobile
 *   node scripts/speed-insights.mjs --days 7
 *   node scripts/speed-insights.mjs --dump ./si-raw   # also save raw JSON
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TEAM_SLUG = "school-of-gaming";
const PROJECT_ID = "prj_25TSZ5ipsOc5Jx8s3nNMqrnXtVWA";
const TZ = "Europe/Helsinki";
const METRICS = ["TTFB", "FCP", "LCP", "INP", "CLS"];
const DEVICES = ["desktop", "mobile"];

function getToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const candidates = [
    process.env.APPDATA &&
      join(process.env.APPDATA, "com.vercel.cli", "Data", "auth.json"),
    join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
  ].filter(Boolean);
  for (const file of candidates) {
    if (existsSync(file)) {
      const { token } = JSON.parse(readFileSync(file, "utf8"));
      if (token) return token;
    }
  }
  console.error(
    "No Vercel token found. Log in with `vercel login` or set VERCEL_TOKEN."
  );
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const days = Number(arg("days", "30"));
const dumpDir = arg("dump", null);
const token = getToken();

const to = new Date();
const from = new Date(to.getTime() - days * 864e5);
const baseParams = new URLSearchParams({
  tz: TZ,
  from: from.toISOString(),
  to: to.toISOString(),
  environment: "production",
  projectId: PROJECT_ID,
  teamId: TEAM_SLUG,
});

async function api(path, extra) {
  const url = `https://vercel.com/api/speed-insights/v2/${path}?${new URLSearchParams(
    { ...Object.fromEntries(baseParams), ...extra }
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true });
    const name = `si-${path}-${Object.values(extra).join("-")}.json`;
    writeFileSync(join(dumpDir, name), body);
  }
  return JSON.parse(body);
}

const fmt = (v) => (typeof v === "number" ? String(v) : "–");

for (const device of DEVICES) {
  const { overview, timeseries } = await api("timeseries", { device });

  const totals = {};
  for (const day of timeseries) {
    for (const [metric, val] of Object.entries(day)) {
      if (val?.datapoints != null)
        totals[metric] = (totals[metric] ?? 0) + val.datapoints;
    }
  }

  console.log(`\n${"=".repeat(24)} ${device.toUpperCase()} — last ${days} days`);
  console.log(
    `datapoints: ${METRICS.map((m) => `${m}=${totals[m] ?? 0}`).join("  ")}`
  );
  console.log("metric  p75      p90      p95      p99      good/improv/poor");
  for (const metric of METRICS) {
    const o = overview[metric];
    if (!o) continue;
    const dist = o.distribution
      ? `${o.distribution.good.toFixed(1)}% / ${o.distribution.improvable.toFixed(1)}% / ${o.distribution.poor.toFixed(1)}%`
      : "";
    console.log(
      `${metric.padEnd(7)}${fmt(o.p75).padEnd(9)}${fmt(o.p90).padEnd(9)}${fmt(o.p95).padEnd(9)}${fmt(o.p99).padEnd(9)}${dist}`
    );
  }

  for (const metric of ["TTFB", "LCP", "INP"]) {
    const { breakdown } = await api("breakdown", {
      type: "route",
      limit: "51",
      device,
      metric,
    });
    const ratings = breakdown[0]?.ratings ?? {};
    const rows = Object.entries(ratings)
      .flatMap(([rating, list]) => list.map((r) => ({ ...r, rating })))
      .sort((a, b) => b.datapoints - a.datapoints);
    console.log(`-- routes by ${metric} (p75 · n · rating)`);
    for (const r of rows.slice(0, 12)) {
      console.log(
        `   ${r.group.padEnd(32)}${String(r.value).padStart(7)}  n=${String(r.datapoints).padStart(5)}  ${r.rating}`
      );
    }
  }
}
