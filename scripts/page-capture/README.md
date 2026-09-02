# scripts/page-capture

Photograph the whole app, as every role sees it, against a throwaway staging
fleet — so a design or feature review looks at the product rather than at a
description of it.

This is a **tool, not a test**. Nothing here asserts anything. It builds a
fixture, drives a browser over it, leaves PNGs and a `manifest.json` on disk,
and stops. What you do with the pictures — a before/after page, a deck, a
scroll through a directory — is per-review and deliberately not its business.

## The lifecycle

```bash
# Everything, cleaning up after itself:
node scripts/page-capture/run.mjs --base-url http://localhost:3002

# Or the same thing by hand, which is what you want while iterating:
node scripts/page-capture/seed.mjs
node scripts/page-capture/capture.mjs --base-url http://localhost:3002
#   …change the design, capture again, repeat…
node scripts/page-capture/cleanup.mjs
```

`run.mjs --keep` does seed + capture and leaves the fleet standing, which is the
same thing as the second form with one command instead of two.

| Script | What it does |
|---|---|
| `seed.mjs` | Builds the fleet and the temp club on staging. Writes `seed-state.json`. |
| `capture.mjs` | Reads `seed-state.json`, drives Playwright, writes PNGs + `manifest.json`. |
| `cleanup.mjs` | Deletes everything one seed made, then reads the database back to prove it. |
| `serve.mjs` | Starts a dev server, if you do not already have one. |
| `run.mjs` | seed → capture → cleanup, in one command. |
| `pages.mjs` | **The list of surfaces.** This is the file you edit for a review. |
| `lib.mjs` | Environment, the staging guard, Supabase over `fetch`. |

## It only ever runs against staging

`lib.mjs` holds a hardcoded allowlist of Supabase project refs, and both
`seed.mjs` and `cleanup.mjs` call the same guard before doing anything. It reads
the project ref **twice** — from `SUPABASE_PROJECT_REF` and from the host of
`NEXT_PUBLIC_SUPABASE_URL` — and refuses to run unless the two agree *and* the
answer is on the list. Production is not on the list.

There is no override flag, and there should not be one: this tool invents
accounts, enrols them into a club and then deletes them, and a flag that lets
that happen near a family's real data is a flag someone eventually types.

## What the seed builds

Five accounts and one club, all prefixed `TEMP-capture-<runId>` so repeated runs
never collide:

- a **parent**, with a PIN already set,
- two **gamers** linked to that parent (synthetic addresses, no password — they
  are entered by switching down from the parent, exactly as a family does it),
- a certified **gedu**, with a criminal-record check recorded,
- an **admin**,
- a free **consumer club**, remote, visible, with one group the gedu is assigned
  to and both gamers placed in it.

The club's group carries a written-up history, which is the part that makes the
family and gedu pages worth photographing at all:

| Session | What is on it |
|---|---|
| 3 weeks ago | gedu's family-facing report (markdown), private gedu note, attendance |
| 2 weeks ago | the same, with one gamer marked absent so the roster shows two states |
| 1 week ago | the same |
| **today, in progress** | report + attendance, **and the voice room is joinable** |
| in 7 days | nothing — an unwritten upcoming session is what one really looks like |

### How "in progress right now" works

A group session is not stored ahead of time: one exists on any date whose
weekday matches a schedule slot, and the window is derived from the slot. So the
seed writes **one** slot, on today's weekday, starting a few minutes ago
(`--live-started`, default 15) and running `--live-minutes` (default 90). Today's
session is therefore under way while the tool runs, and every other session —
7, 14, 21 days back, 7 days forward — lands on that same weekday and reuses that
same slot.

The practical consequence: **the live session expires.** With the defaults you
have about 75 minutes from the seed to capture the voice room. Past that, re-seed
or pass a longer `--live-minutes`.

### Which writes go through RPCs

Every write that has an RPC uses it, called with a **real signed-in user's
token** — the admin's for the product, group and enrolment work, the gedu's for
the session write-ups (so the feed is attributed to the gedu, which is what a
screenshot shows). That is not ceremony: the admin RPCs guard on
`assert_admin()`, which reads `auth.uid()`, so the service-role key cannot call
them at all.

The service-role key does four things, each because nothing else can:

- create auth users (`/auth/v1/admin/users`),
- promote a profile's role — the by-hand step in
  `docs/runbooks/create-admin-account.md`; `create_gamer` and `register_gedu`
  are the only promotion RPCs the database has, and neither makes an admin,
- stamp `email_verified_at`,
- delete the product at cleanup — there is no `delete_product`.

One deliberate departure from that runbook: these accounts are created **with a
password**. The runbook has a real admin set their own through the reset mail,
which is right for a person; these are logged into by a script minutes later and
deleted at the end of the run.

## Capturing

```
--base-url    default http://localhost:3002
--state       default scripts/page-capture/seed-state.json
--out         default a timestamped dir under the OS temp area (never in the repo)
--only        comma-separated slugs from pages.mjs
--viewport    desktop | mobile (default: both)
--headed      watch it work
```

Two viewports, both shot for every page: **1440×900**, the desktop the gedu and
admin surfaces are designed for, and **360×800**, the mobile design floor the
parent and gamer surfaces are designed at. A narrow admin page still has to not
break, and that is worth a picture.

The run logs in through the real UI — one context per role per viewport, no
forged cookies. Two flows are worth knowing about:

- **The parent has to clear the PIN gate.** A customer with no unlock cookie is
  bounced to `/parent/unlock` from every non-exempt path. The pad has no input
  elements at all: four digits typed at the window, and the fourth submits.
- **The gamer is not logged into.** The parent signs in and switches down
  through `/select-profile`.

Sign-in navigations wait for `networkidle`, not `domcontentloaded`. The login
form's submit handler is React's, so a click landing before hydration falls
through to a native form submit and the browser simply reloads `/login` — which
from the outside looks exactly like a bad password.

Each shot also gets: the Next dev-tools badge hidden, animations and transitions
zeroed, the caret made transparent, the locale pinned to `en`, and a wait on
`document.fonts.ready` — all so two runs of the same page differ only where the
design does.

A page that fails is a **warning in the manifest**, never the end of the run.

### The voice room

`voice-room-gedu` opens the live session's room and shoots the joined call.
Chromium is launched with `--use-fake-ui-for-media-stream` and
`--use-fake-device-for-media-stream` (always, not just for that page — they are
inert elsewhere, and a room that silently fails behind a permission prompt is a
worse failure than a flag that did nothing). The page auto-joins on mount, so
there is nothing to click; the capture waits for the **Leave** control, which
only exists once the room is rendered.

**It can legitimately fail, and that is a warning rather than a crash.** It
depends on `DAILY_API_KEY` and `NEXT_PUBLIC_DAILY_DOMAIN` being set, on Daily
being reachable, and on the seeded session window still being open. All three
produce a manifest warning and a shot of whatever is on screen, because a
picture of the failure is more useful than a stack trace.

## Serving

`capture.mjs --base-url` works against any server you already have — which is
usually the right answer, since whoever is running a design pass generally has
one up. If you need one from cold:

```bash
node scripts/page-capture/serve.mjs --port 3002 [--dir <checkout>]
```

It **refuses to start if the port is already answering**, and it kills only the
process id it spawned. It never kills by port: the machine running a capture is
usually the machine someone is also developing on.

## Cleanup

`cleanup.mjs` reads `seed-state.json` and deletes exactly what that run made,
then reads the database back — a `DELETE` that matched nothing returns 204
exactly like one that matched everything, so looking is the only way to know.
There is no "sweep everything TEMP-prefixed" mode, and there should not be: a
fleet from someone else's run, or from an earlier one whose screenshots are
still being looked at, is indistinguishable from yours by prefix alone.

Participations are deleted in their own statement before the product, and that
ordering is load-bearing. Deleting a participation fires the trigger that
recomputes cached seat counts, which INSERTs into `product_seat_counts`. Inside
a single `DELETE FROM products` those participations go by cascade while the
product is on its way out, so the trigger tries to write a counts row for a
product that will not exist by the end of the statement and the whole delete
fails on that foreign key.

If a seed dies halfway it prints the exact recovery command, for the case where
the state file was never written:

```bash
node scripts/page-capture/cleanup.mjs --users <id,id> --products <id,id>
```

## Prerequisites

- **`.env.local`** with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` — read by the scripts
  themselves; nothing is ever hardcoded. Plus `DAILY_API_KEY` and
  `NEXT_PUBLIC_DAILY_DOMAIN` on the server being captured, for the voice room.
- **`playwright` and `sharp`**, already project dependencies. From a git
  worktree, `node_modules` resolves upward from the main checkout, so there is
  nothing to install.
- Playwright's bundled Chromium. The machine's own Chrome is not used — it has
  no debug port.

## Adding a surface

Edit `pages.mjs`. An entry needs a `slug` (the file-name stem, and what `--only`
matches), a `route` (a path, or a function of the seed state for anything
carrying an id), and `as` — which viewer sees it. `viewports`, `fullPage`,
`waitFor` and `notes` are optional.

Slugs are the thread between one run and the next, so renaming one deliberately
breaks that comparison. Do it when the surface really is a different surface.
