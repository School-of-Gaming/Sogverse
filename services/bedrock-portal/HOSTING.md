# Hosting notes for bedrock-portal

Notes from research on where to host this service. Not yet deployed — this is a record of what we learned so future-us doesn't re-derive it.

## TL;DR

**Plan**: co-locate on the existing Azure **B1 Basic Linux** App Service Plan (`ASP-soggamersarena-a3e4`, North Europe) as a third app alongside `sogga2` and `sogga2-api`. Effectively $0 incremental cost on our MPN subscription.

**Fallback**: Oracle Cloud Always Free (Ampere A1 ARM). More setup pain but genuinely free.

## Why not serverless (Vercel, Supabase Edge Functions, etc.)

bedrock-portal holds a **persistent WebSocket connection to Xbox Live** to keep the game session advertised in friends lists. The process must run continuously for hours/days; it isn't request-driven.

Vercel caps serverless function duration at 60s (Hobby) / 300s (Pro) / 900s (Enterprise) — no plan offers "always on." Supabase Edge Functions are Deno, per-request, same story. No amount of paying fixes this; it's architectural.

## Why Azure free tier (F1) won't work either

F1 Free App Service Plans exist in the subscription (`ASP-sogga-dev-free`, `ASP-sogwikiw`, `ASP-soggamersarena-9b6e`) and are tempting. They don't work for this because:

- **No Always On on F1.** Container sleeps after ~20 min of no HTTP traffic → Xbox session dies → players can't join.
- **60 CPU-min/day cap.** Not a concrete problem (service is ~0% CPU) but moot given the Always On issue.

Workaround-by-external-pings is too fragile: each container recycle kills the XBL WebSocket and forces re-auth. Not worth engineering around.

## Azure B1 co-location: the case for

- **Always On supported** — the critical feature.
- **1.75 GB RAM on the plan**; service uses ~50 MB. `sogga2` + `sogga2-api` leave plenty of headroom.
- **Zero incremental compute cost.** Adding an app to an existing App Service Plan is free regardless of app count.
- **`/home/` is persistent** — perfect mount point for `.auth-cache/` so the Microsoft refresh token survives restarts.
- **App Insights already in the resource group** — trivial to wire up monitoring.
- **Linux host** — `bedrock-portal-nethernet` (native WebRTC module) has Linux prebuilds.

## What the B1 actually costs

Two different numbers depending on how you frame it:

- **Retail price** (pulled from Azure Retail Prices API on 2026-04-17): **$0.0180 USD/hr** for B1 Basic Linux in `northeurope` = **~$13.14 USD / month**.
- **What we actually pay**: **$0 out of pocket**. Subscription is `Microsoft Partner Network` — MPN credits cover it. Every `pretaxCost` in 30 days of consumption data was `None`, which is the MPN pattern (usage against credit allocation, not billed cash).

So "adding bedrock-portal to B1" costs nothing extra, and the B1 itself costs nothing extra as long as MPN credits cover the month's total usage. If MPN benefits ever end or flip to pay-as-you-go, the plan would become ~$13/month cash regardless of whether bedrock-portal is on it.

**I can't see remaining monthly MPN credit from the CLI** — that's in the Azure Portal under Cost Management / Billing. Check occasionally to confirm we're comfortably under the cap.

## Risks of co-locating with production

- If bedrock-portal memory-leaks or crash-loops, it shares the App Service Plan's RAM/CPU pool with `sogga2` — could destabilize production.
- Mitigations: App Service per-app memory/restart limits; monitor via existing App Insights; if it ever looks dicey, spin off to its own $13/mo B1 plan (~5 min migration once the app is zip-deployable).

In practice bedrock-portal is a very stable ~50 MB Node process with no UI and minimal CPU. Risk is low.

## Prerequisites for the eventual deploy

Won't build these now, but the list so we know what's ahead:

1. **Build step** — compile TS to JS (`tsc`) so App Service runs `node dist/index.js` directly instead of `tsx` at runtime.
2. **HTTP health endpoint** — App Service Linux expects the container to listen on `$PORT` with HTTP; if nothing binds within ~240s, it restarts the container. Bolt on a trivial `http.createServer` returning `200 OK`.
3. **Env vars via App Settings** — `BEDROCK_SERVER_IP`, `PORTAL_JOINABILITY`, etc. set in the Azure portal / via `az webapp config appsettings set`.
4. **`PORTAL_AUTH_CACHE_DIR=/home/.auth-cache`** — so the token cache lands on persistent storage.
5. **Deploy path** — either `az webapp deploy` from CI, or a GitHub Actions workflow. Either way, zip up just `services/bedrock-portal/` + `node_modules` (or install on the host).
6. **First-run device-code auth** — tail logs, grab the microsoft.com/link code, sign in via browser. Alternative: pre-auth locally and `scp` the `.auth-cache` directory up (fewer eyes on logs).

## Keeping current with Minecraft releases

`bedrock-portal` and `bedrock-portal-nethernet` bake the NetherNet signalling protocol into the package, so when Mojang ships a protocol bump (roughly 2–3× a year), we need a fresh release of both packages or mobile joins start failing with `InitialConnection-1`. LucienHH usually ships within days of an MC update.

Hands-off option for when we do deploy:

- **Dependabot** watching `services/bedrock-portal/package.json` → opens a PR whenever either package publishes. Free, GitHub-native, just a `.github/dependabot.yml` entry.
- **Continuous deploy on `main`** → merging the Dependabot PR redeploys the service.
- Recommended middle path: semi-automatic — Dependabot opens the PR, we glance and merge. ~30 sec every couple months with a gate in case a dep regression ships. Full auto-merge only makes sense once there's a smoke test (boot headless, wait for `sessionCreated`, exit).

Note: the advertised `world.version` string in `src/index.ts` (currently `"1.21.0"`) is code, so Dependabot won't touch it. If we care about keeping the session card in sync with real MC versions, either promote it to an env var (`PORTAL_WORLD_VERSION`) — hosting config, not a code change — or accept that it's cosmetic and let it drift.

## Fallback: Oracle Cloud Always Free

Kept as an option in case Azure ever becomes unavailable or MPN credits dry up.

- Ampere A1 ARM, up to 4 cores / 24 GB RAM free forever.
- Pain points: provisioning capacity ("out of stock" in popular regions), VCN + host iptables two-layer firewall, tail risk of Oracle terminating free accounts.
- Setup time vs Azure: ~1 hour vs ~15 min.
- Genuinely free, not credit-funded, so it survives any subscription changes on the Azure side.

## Options we considered and rejected

| Option | Why not |
|---|---|
| Vercel (any tier) | No always-on process model |
| Supabase Edge Functions | Same — per-request Deno |
| Azure F1 Free | No Always On, sleeps |
| Render free background worker | Spins down on inactivity |
| Railway | No true free tier; ~$5/mo after trial credit |
| Fly.io | Free allowance keeps shrinking; not reliable as "always free" |
| Hetzner CX11 | €4/mo; best if we ever want to pay for reliability |
| Raspberry Pi at home | Actually works; depends on home internet/power |

## Open questions for when we deploy

- **Resource group**: reuse `sog_gamers_arena` or create a new `sogverse` RG? (Leaning: new RG for clean separation.)
- **App name**: `sogverse-bedrock-portal`?
- **Health check**: simple 200 OK, or include `portal.session` status in the response body for richer monitoring?
