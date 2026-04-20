# bedrock-portal service

Creates an Xbox Live game session under an **alt Microsoft account** so console Minecraft Bedrock players can see that account online in their friends list and "join" — which redirects them to our actual Bedrock server.

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
- A console player who's friends (or friends-of-friends, depending on `PORTAL_JOINABILITY`) with the alt account can click its profile → Join Game, and end up on our Bedrock server

---

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `BEDROCK_SERVER_IP` | yes | — | Public IP/hostname of the target Bedrock server |
| `BEDROCK_SERVER_PORT` | no | `19132` | UDP port of the target server |
| `PORTAL_ACCOUNT_USERNAME` | yes | — | Cache-key label for prismarine-auth (any stable string; identity is set via browser on first run) |
| `PORTAL_JOINABILITY` | no | `FriendsOfFriends` | `FriendsOfFriends` \| `FriendsOnly` \| `InviteOnly` |
| `PORTAL_WORLD_NAME` | no | `Bedrock Portal` | Shown as world name in session card |
| `PORTAL_HOST_NAME` | no | `Portal` | Shown as host name in session card |
| `PORTAL_AUTH_CACHE_DIR` | no | `./.auth-cache` | Where Xbox tokens are cached (gitignored) |

---

## Ports

- This process makes **outbound HTTPS only** (to Xbox Live). No inbound ports required on the machine running this service.
- The target Bedrock server (`BEDROCK_SERVER_IP:BEDROCK_SERVER_PORT`) must be publicly reachable — that's where players are redirected once they accept the join.

---

## Troubleshooting

- **"Session live" but nobody can join** → verify the alt account is actually friends with the test console account (or friends-of-friends). For first tests, set `PORTAL_JOINABILITY=FriendsOnly` and manually friend the alt from your test console.
- **Auth prompt re-appears every run** → `PORTAL_AUTH_CACHE_DIR` isn't persisting (e.g. running inside a container without a mounted volume). Cache at a stable path.
- **Mobile player sees "NetherNet InitialConnection-1" on join (Xbox joins fine on the same account)** → In the Minecraft app on the mobile device: Settings → Profile → enable both **"Allow mobile data for online play"** AND **"Enable WebSockets"**. Both are required — NetherNet's signaling WebSocket to `wss://signal.franchise.minecraft-services.net/...` is the first step of the join handshake, and without these toggles the client aborts before the portal ever sees the connection. "Require encrypted websockets" does not matter (Microsoft's endpoint is already `wss://`). On iOS, also confirm iPhone Settings → Cellular → Minecraft is enabled. Xbox consoles bypass these toggles because Xbox platform networking handles WebSockets at the OS level, which is why Xbox-works-but-mobile-fails is the signature of this issue rather than a portal or version-pin bug. Toggle names may vary slightly across Android / iOS versions. Switch / PlayStation are untested but expected to "just work" the same way Xbox does, since consoles don't expose these user-facing network toggles.
- **Want verbose logs** → run with `DEBUG=bedrock-portal* npm run dev`.

---

## Deployment (later)

See [HOSTING.md](./HOSTING.md) for the current plan, options considered, and prereqs for the eventual deploy.
