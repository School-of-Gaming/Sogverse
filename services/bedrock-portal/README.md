# bedrock-portal service

Creates an Xbox Live game session under an **alt Microsoft account** so console Minecraft Bedrock players can see that account online in their friends list and "join" — which redirects them to our **GeyserMC proxy**, which in turn bridges them to our Java Minecraft server.

Wraps [LucienHH/bedrock-portal](https://github.com/LucienHH/bedrock-portal).

> **Warning:** never use your main Microsoft/Xbox account. Use a dedicated alt account that owns Minecraft. Misuse can get the account banned from Xbox Live APIs.

---

## How it fits in the repo

This service is an npm workspace (`services/*`). It has its own `package.json` and its own runtime deps, but shares dev tooling (ESLint, TypeScript, lockfile) with the root. Running `npm install` at the repo root hoists everything into the root `node_modules`. Root `npm run lint` and `npm run type-check` cover this service too, so it's held to the same coding standards as the rest of the repo.

Vercel deploys of the web app skip workspace deps via `vercel.json`'s `installCommand`, so the service's native modules (WebRTC stack) never bloat the Next.js build.

---

## Local setup

From the repo root:

```bash
npm install                     # installs web + service deps (workspaces)
cp services/bedrock-portal/.env.example services/bedrock-portal/.env
# edit .env — at minimum set BEDROCK_SERVER_IP and PORTAL_ACCOUNT_USERNAME
npm run portal:dev              # runs the service
```

### First run — Microsoft device-code auth

On first run, prismarine-auth prints a URL (e.g. https://microsoft.com/link) and a short code. Open the URL in a browser, paste the code, and **sign in with the alt account**. Tokens are cached in `./.auth-cache/` and refreshed automatically afterwards.

### What success looks like

- Console prints `[portal] session live — redirecting joins to …`
- The alt account shows as **Online — Playing Minecraft** in Xbox / Minecraft friends lists
- A console player who's friends (or friends-of-friends, depending on `PORTAL_JOINABILITY`) with the alt account can click its profile → Join Game, get routed to our Geyser proxy, and end up on our Java server

---

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `BEDROCK_SERVER_IP` | yes | — | Public IP/hostname of the GeyserMC proxy (which fronts the Java server) |
| `BEDROCK_SERVER_PORT` | no | `19132` | UDP port Geyser listens on for Bedrock clients |
| `PORTAL_ACCOUNT_USERNAME` | yes | — | Cache-key label for prismarine-auth (any stable string; identity is set via browser on first run) |
| `PORTAL_JOINABILITY` | no | `FriendsOfFriends` | `FriendsOfFriends` \| `FriendsOnly` \| `InviteOnly` |
| `PORTAL_WORLD_NAME` | no | `Bedrock Portal` | Shown as world name in session card |
| `PORTAL_HOST_NAME` | no | `Portal` | Shown as host name in session card |
| `PORTAL_AUTH_CACHE_DIR` | no | `./.auth-cache` | Where Xbox tokens are cached (gitignored) |

---

## Ports

- This process makes **outbound HTTPS only** (to Xbox Live). No inbound ports required on the machine running this service.
- The GeyserMC proxy (`BEDROCK_SERVER_IP:BEDROCK_SERVER_PORT`) must be publicly reachable on UDP — that's where players are redirected once they accept the join. Geyser then translates Bedrock protocol to Java protocol and relays to the backend Java Minecraft server.

---

## Troubleshooting

- **"Session live" but nobody can join** → verify the alt account is actually friends with the test console account (or friends-of-friends). For first tests, set `PORTAL_JOINABILITY=FriendsOnly` and manually friend the alt from your test console.
- **Auth prompt re-appears every run** → `PORTAL_AUTH_CACHE_DIR` isn't persisting (e.g. running inside a container without a mounted volume). Cache at a stable path.
- **Mobile player sees "NetherNet InitialConnection-1" on join (Xbox joins fine on the same account)** → In the Minecraft app on the mobile device: Settings → Profile → enable both **"Allow mobile data for online play"** AND **"Enable WebSockets"**. Both are required — NetherNet's signaling WebSocket to `wss://signal.franchise.minecraft-services.net/...` is the first step of the join handshake, and without these toggles the client aborts before the portal ever sees the connection. "Require encrypted websockets" does not matter (Microsoft's endpoint is already `wss://`). On iOS, also confirm iPhone Settings → Cellular → Minecraft is enabled. Xbox consoles bypass these toggles because Xbox platform networking handles WebSockets at the OS level, which is why Xbox-works-but-mobile-fails is the signature of this issue rather than a portal or version-pin bug. Toggle names may vary slightly across Android / iOS versions. Switch / PlayStation are untested but expected to "just work" the same way Xbox does, since consoles don't expose these user-facing network toggles.
- **Want verbose logs** → locally, `DEBUG=bedrock-portal* npm run dev`. On the server, add `Environment=DEBUG=bedrock-portal*` under `[Service]` in the unit file, then `systemctl --user daemon-reload && systemctl --user restart bedrock-portal`.

---

## Hosting

Running on a **Google Cloud Compute Engine** VM as a **systemd user service** with linger enabled so it survives SSH disconnect and reboot.

| Detail | Value |
|---|---|
| GCP project | `sogverse` |
| Instance name | `bedrock-portal` |
| Zone | `us-central1-a` |
| Machine type | `e2-micro` (shared-core, 2 vCPU burstable, ~1 GB RAM) |
| CPU platform | AMD Rome (x86_64) |
| OS | Debian 12 (bookworm) |

The `e2-micro` falls inside GCP's Always Free tier in `us-central1`, so compute is $0/month. The portal's steady-state footprint (~64 MB RAM, ~0% CPU) leaves comfortable headroom.

### Runtime layout

| Piece | Path |
|---|---|
| Node 20 (user-local install) | `~/.local/bin/node` |
| Repo checkout | `/home/kyle_hutchinson/Sogverse` |
| Compiled entry point | `services/bedrock-portal/dist/index.js` |
| Env file | `services/bedrock-portal/.env` |
| Auth cache (Xbox refresh tokens) | `services/bedrock-portal/.auth-cache/` |
| systemd unit | `~/.config/systemd/user/bedrock-portal.service` |
| Linger marker | `/var/lib/systemd/linger/kyle_hutchinson` (created by `loginctl enable-linger`) |

The unit runs `node dist/index.js` directly — no `tsx watch`, no npm wrapper — with `Restart=always` and `RestartSec=5`. Memory footprint is ~64 MB.

### Commands to remember

```bash
systemctl --user status bedrock-portal           # is it running?
systemctl --user restart bedrock-portal          # apply code/env changes
systemctl --user stop bedrock-portal             # temporary stop
systemctl --user start bedrock-portal            # start again
systemctl --user disable --now bedrock-portal    # stop and don't auto-start
systemctl --user enable --now bedrock-portal     # re-enable
journalctl --user -u bedrock-portal -f           # tail logs
journalctl --user -u bedrock-portal -n 200       # last 200 lines
journalctl --user -u bedrock-portal --since "1 hour ago"
```

### Updating the code on the server

The service runs compiled JS from `dist/`, so source edits have no effect until rebuilt. After pulling:

```bash
cd ~/Sogverse
git pull
npm install                                              # only if deps changed
npm run build --workspace=sogverse-bedrock-portal        # tsc → dist/
systemctl --user restart bedrock-portal
journalctl --user -u bedrock-portal -n 30                # confirm "session live"
```

Expected healthy log after restart:

```
[portal] session live — redirecting joins to en.mc.sog.gg:19132
[portal] started as "Sogverse" | joinability=FriendsOnly
```

### Changing configuration

Env lives in `services/bedrock-portal/.env`. Edit the file, then:

```bash
systemctl --user restart bedrock-portal
```

### Re-authenticating the alt account

The Microsoft refresh token in `.auth-cache/` lasts ~90 days and auto-refreshes while the service runs. If it ever expires (long downtime, Microsoft invalidation, cache wiped), the service will crash-loop on startup with a device-code prompt that systemd can't respond to. To re-auth:

```bash
systemctl --user stop bedrock-portal
cd ~/Sogverse/services/bedrock-portal
node dist/index.js                    # prints "microsoft.com/link" URL + code
# open URL in a browser, sign in with the ALT account, wait for "session live"
# Ctrl+C once you see it
systemctl --user start bedrock-portal
```

### If the unit file itself changes

After editing `~/.config/systemd/user/bedrock-portal.service`:

```bash
systemctl --user daemon-reload
systemctl --user restart bedrock-portal
```

---

## Dependency notes

### `axios` override in root `package.json`

The root `package.json` has:

```json
"overrides": { "axios": "^1.7.9" }
```

This exists because `prismarine-auth` (pinned to the `LucienHH/prismarine-auth#playfab` fork) pulls in `@xboxreplay/xboxlive-auth@3.3.3`, which declares `axios@^0.21.1` — a version with 7 open high-severity advisories (SSRF, CSRF, proto-pollution DoS, NO_PROXY bypass, cloud metadata exfiltration). Most aren't practically exploitable here — this service only makes outbound HTTPS calls to hardcoded Microsoft OAuth endpoints with no attacker-controlled input — but the override is cheap and gets `npm audit` to a clean 0.

The API surface `xboxlive-auth` uses (`axios.post(url, body, { headers })`, `response.status/data`, `err.response.status`) is stable between 0.21 and 1.x, so forcing the axios 1.x line is safe without needing to fork xboxlive-auth.

`npm ls axios` will show `invalid: "^0.21.1"` against the overridden copy — that's the override doing its job, not a real problem.

**When to revisit:** if the `LucienHH/prismarine-auth` fork ever updates to `@xboxreplay/xboxlive-auth@5.x` (zero-dep, uses native fetch), the override becomes a no-op and can be removed.
