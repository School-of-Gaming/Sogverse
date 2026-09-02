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
| `seed.mjs` | Builds the fleet and the two temp clubs on staging. Writes `seed-state.json`. |
| `capture.mjs` | Reads `seed-state.json`, drives Playwright, writes PNGs + `manifest.json`. |
| `cleanup.mjs` | Deletes everything one seed made, then reads the database back to prove it. |
| `serve.mjs` | Starts a dev server, if you do not already have one. |
| `run.mjs` | seed → capture → cleanup, in one command. |
| `pages.mjs` | **The list of surfaces.** This is the file you edit for a review. |
| `lib.mjs` | Environment, the three guards, Supabase over `fetch`. |

## The three guards

Every trust decision this tool makes lives in `lib.mjs`, together, so the whole
boundary can be read in one place. **None of the three has an override flag**,
and none should: each of them exists because a single mistyped argument would
otherwise do real damage quietly, and a flag that lets that happen is a flag
someone eventually types.

### It only ever writes to staging

A hardcoded allowlist of Supabase project refs, checked by `seed.mjs` and
`cleanup.mjs` alike before either does anything. It reads the project ref
**twice** — from `SUPABASE_PROJECT_REF` and from the host of
`NEXT_PUBLIC_SUPABASE_URL` — and refuses unless the two agree *and* the answer is
on the list. Production is not on the list. This tool invents accounts, enrols
them into a club and then deletes them, none of which has any business happening
near a family's real data.

### It only ever signs in against a local server

The capture logs in through the real UI, which means it **types the fleet's
staging password into a form** at whatever `--base-url` names. So that flag
decides who receives a working credential, and it is checked against a hardcoded
loopback allowlist — `localhost` or `127.0.0.1`, any port, `http` or `https` —
before the browser is launched. A pasted URL, a typo or a copied command line is
all it would otherwise take to hand the password to a stranger's server, and the
person running it would see nothing but an ordinary sign-in failure afterwards.

If the tool is ever wanted against a deployed staging preview, that origin is
added to the allowlist in `lib.mjs` as a literal — never as a flag, an
environment variable or a suffix pattern, since anyone can register a hostname
that ends the right way.

### The state file cannot leave this directory

`seed-state.json` holds the fleet's password and the parent's PIN in plain text,
and this directory is the one path the repo's `.gitignore` accounts for. So
`--out` (seed) and `--state` (capture, cleanup, run) name **a file in this
directory** and nothing else: the value is resolved against the tool's own
directory rather than the working directory, so a bare name means the same thing
from any cwd, and anything that lands outside — `../../creds.json`, an absolute
path into a synced folder — is refused rather than silently re-anchored. A path
that quietly became a different path is exactly the failure worth making visible.

## What the seed builds

Five accounts and two clubs, all prefixed `TEMP-capture-<runId>` so repeated runs
never collide:

- a **parent**, with a PIN already set,
- two **gamers** linked to that parent (synthetic addresses, no password — they
  are entered by switching down from the parent, exactly as a family does it),
- a certified **gedu**, with a criminal-record check recorded,
- an **admin**,
- two free **consumer clubs**, remote, visible, each with one group the gedu is
  assigned to and both gamers placed in it.

The two clubs are the same product in two different moments, because a family
dashboard shows one card per enrolment and the interesting picture is two cards
beside each other rather than one at a time:

| Club | Stored status | Its calendar |
|---|---|---|
| **live** — `… — redstone club` | `running` | started 5 weeks ago, runs 6 more; a session is under way *right now* |
| **upcoming** — `… — creative club` | `pending` | starts in 4 days and runs 8 weeks; nothing behind it, nothing written on it |

The upcoming club is stored `pending` rather than `running` because that is what
it is: the effective status a family sees is derived, and it upgrades itself to
running the day the club starts. Writing `running` on a club that has not begun
would be a state the product itself could never produce.

The **live** club's group carries a written-up history, which is the part that
makes the family and gedu pages worth photographing at all. The upcoming club
has none by design — an enrolment with nothing behind it yet is a real state,
and the card that shows it is the reason the club exists:

| Session | What is on it |
|---|---|
| 3 weeks ago | gedu's family-facing report (markdown), private gedu note, attendance |
| 2 weeks ago | the same, with one gamer marked absent so the roster shows two states |
| 1 week ago | the same |
| **today, in progress** | report + attendance, **and the voice room is joinable** |
| in 7 days | nothing — an unwritten upcoming session is what one really looks like |

The default page list photographs the **live** club's own pages and both
dashboards. The upcoming club's product, workspace and admin pages are the same
pages minus the history, so they are not shot — `seed-state.json` names them
under `routes.upcoming*` for anyone following the fixture by hand.

### How "in progress right now" works

A group session is not stored ahead of time: one exists on any date whose
weekday matches a schedule slot, and the window is derived from the slot. So the
seed writes **one** slot, on today's weekday, starting a few minutes ago
(`--live-started`, default 15) and running `--live-minutes` (default 90). Today's
session is therefore under way while the tool runs, and every other session —
7, 14, 21 days back, 7 days forward — lands on that same weekday and reuses that
same slot.

The upcoming club is the same mechanism read backwards. Its one slot sits on the
weekday of a date four days out, at a fixed after-school hour, and its start date
*is* that date — so the earliest session the schedule can materialize is its
first one, and there is nothing before it. Four days is not a multiple of seven,
so that weekday cannot be today's, and its clock face is a constant rather than
anything derived from `now`: a slot that is never meant to be open should not be
computed from the time of day it might accidentally be open at.

The practical consequence: **the live session expires.** With the defaults you
have about 75 minutes from the seed to capture the voice room. Past that, re-seed
or pass a longer `--live-minutes`.

### Which writes go through a user's token, and which through service_role

The product, group and enrolment work is called with the **admin's** token and
the session write-ups with the **gedu's** (so the feed is attributed to the
gedu, which is what a screenshot shows). That is not ceremony: those RPCs guard
on `assert_admin()` and on the caller's role, both of which read `auth.uid()`,
so the service-role key cannot call them at all.

The **service client** does the rest, and it is a wider surface than "the few
writes with no RPC" — worth stating exactly, because a security story that
undercounts its own privileged calls is worse than not telling one:

| Through the service client | Why nothing else can |
|---|---|
| `register_gedu` | granted to `service_role` only; the app calls it from a server route |
| `create_gamer` | the same, from the parent's create-gamer route |
| `set_pin_for_user` | the same; the PIN is bcrypt-hashed by `crypt()` inside Postgres, so a script has nothing it could write directly |
| create auth users (`/auth/v1/admin/users`) | the auth admin API is service-role by definition |
| promote a profile's role | no RPC — the by-hand step in `docs/runbooks/create-admin-account.md`; `create_gamer` and `register_gedu` are the only promotion RPCs the database has, and neither makes an admin |
| stamp `email_verified_at` | no RPC |
| delete the products, at cleanup | no `delete_product` |

So three of those are RPCs the tool *has* to call as `service_role` rather than
writes it chose not to route through one — the grant is the constraint, not the
absence of a function.

One deliberate departure from that runbook: these accounts are created **with a
password**. The runbook has a real admin set their own through the reset mail,
which is right for a person; these are logged into by a script minutes later and
deleted at the end of the run. The password is 24 random bytes from
`crypto.randomBytes`, sharing nothing with the run id — the run id is printed,
carried in every seeded address and stamped on every product name, so a
credential derived from it would be one that anyone who could see a fleet could
reconstruct.

## Capturing

```
--base-url    default http://localhost:3002 (localhost / 127.0.0.1 only — see the guards)
--state       default seed-state.json, and always inside scripts/page-capture/
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

`voice-room-gedu` and `voice-room-gamer` open the live session's room and shoot
the joined call. It is one URL and two viewers: `/voice/group/[id]` does no
membership check of its own, so the same page renders the gedu's moderator
controls and the child's participant view, and a design pass over the room needs
both.

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
- **`@playwright/test`**, already a declared devDependency — which is why the
  capture imports the browser from it rather than from the bare `playwright`
  package the manifest does not name. From a git worktree, `node_modules`
  resolves upward from the main checkout, so there is nothing to install.
- Playwright's bundled Chromium. The machine's own Chrome is not used — it has
  no debug port.

## Adding a surface

Edit `pages.mjs`. An entry needs a `slug` (the file-name stem, and what `--only`
matches), a `route` (a path, or a function of the seed state for anything
carrying an id), and `as` — which viewer sees it. `viewports`, `fullPage`,
`waitFor` and `notes` are optional.

Slugs are the thread between one run and the next, so renaming one deliberately
breaks that comparison. Do it when the surface really is a different surface.
