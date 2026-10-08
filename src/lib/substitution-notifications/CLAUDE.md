# Substitution notifications

When a substitution request is open, every gedu who could take it and has a linked Discord
account gets a DM with Offer and Decline buttons, and the admins' Slack channel gets one
message listing the request — who is absent and why, the session, what it requires, and
every gedu it concerns with their DM status and answer — with an Accept button on each
offer. Every later change to the request redraws all of them in place, and whoever ends up
seated on it gets a DM saying the session is theirs. The request itself is
`src/services/session-substitution/`; the DM buttons are answered in `src/app/api/discord/`
and the Slack app in `src/app/api/slack/`.

## The database announces ids, never messages

**Rule: the database says only *which request changed*; this directory decides what every
message should now say.** Triggers on the requests, on the answers to them and on session
cancellations (every non-withdrawn request on the cancelled or restored date) put the
request's id in an outbox, and nothing about Discord, Slack or wording reaches SQL. That is
the owner's answer to coupling the schema to the messaging *(owner, 2026-10-08)*: a trigger
cannot know which message a change affects, so it does not try — the sync reads one snapshot
of the request as it stands now and redraws everything from it. A new kind of change that
should move a message therefore needs only to enqueue the request; a new message needs no
database change at all.

**Enqueueing kicks the sync, and the kick can never fail the write.** Once per transaction
the database queues a `pg_net` POST to the sync route, bearing the shared secret, both read
from Vault. `pg_net` sends after commit and never on rollback, so the route always finds the
change committed; any failure in the kick is a warning, because an approval must not fail
over a notification. With no Vault secrets — every local stack and CI — the outbox fills and
nothing is sent.

## The outbox: lease, seq and retry

- **One row per request.** Enqueueing again bumps its `seq`, makes it due now and resets
  its attempts.
- **A claim leases the row for two minutes**, so one worker syncs a request at a time; two
  drains running at once skip each other's rows rather than wait.
- **Finishing compares the seq.** Unchanged, the row is deleted. Moved — the request changed
  while it synced — the row is handed back due and is claimed again, so a change made
  mid-sync is never lost.
- **A failed sync backs off** 2^attempts minutes, capped at an hour; after twelve attempts
  the row is parked (`next_attempt_at` is infinity, `last_error` says why) until the request
  next changes. A parked or failing row is the first place to look when messages stop
  moving.
- **Two `pg_cron` jobs:** a retry every minute that kicks the sync when a row is due and
  unleased (a lost kick, a sync that died holding its lease, a backoff run out), and a
  daily close-out at 00:15 UTC that enqueues every announced request still open whose
  session date was yesterday in its product's zone — nothing writes to a request when its
  date passes, so without it the buttons would stay up for a write that refuses them.

The sync route answers 202 at once and drains after the response, one claim at a time, for
up to 50 seconds of a 60-second function; whatever is left is the next kick's.

## What the sync decides

**Announced means open, whatever the request's history** *(owner, 2026-10-08)*. A sync that
finds a never-announced request open announces it; one never open — filed already
substituted, which is how an admin seats somebody on a seat with no request — sends
nothing. Cleared back to open later, it is announced then. Once announced, every change
redraws its messages, whatever state it is in, and a reopened request gets its buttons back.

**One derivation gives the state every message draws**: open, filled, withdrawn, cancelled
or past (still open, its product-local date gone by). Withdrawn outranks everything and a
cancelled session outranks the sub seated on it; a filled request stays filled after its
date, because who covered it is the history worth keeping.

**Eligibility is computed at each sync, and a DM is never taken back.** Eligible is exactly
the pool's four tests, so a DM goes to exactly the gedus whose pool lists the request. A
gedu eligible now, with a linked Discord account and no DM yet, is sent one while the
request is open. Nothing enqueues a request when a *gedu* changes — a newly certified gedu
or a new language reaches an open request at its next change, not before. A DM already sent
is never deleted when its gedu stops being eligible; it follows the request's state like
any other, and a press on it is answered by the write's own refusal. The Slack message lists
the eligible together with everyone who answered or was sent a DM, and marks no one as
no longer eligible: an offer from a gedu who has since stopped meeting the session's
requirements stays approvable, as on the admin page.

**A DM goes only to the Discord account that acts as that gedu** — the account whose most
recently linked gedu is them. A Discord account linked to two gedu accounts answers as the
later one, so a DM about the other would be answered as the wrong person.

**The accepted DM goes to whoever is seated on an announced request, however they were
seated, at most once per (request, gedu)** *(owner, 2026-10-08)* — an approved offer, an
admin's seating of somebody who never offered, a re-pointed substitution. Never for a
session already past or cancelled, never on a request that was never announced, and never
twice: a sub unseated and seated again is not told again.

**Order within one sync:** the announcement, then the DMs, then the Slack message last, so
its tags say who was reached.

**The Slack message is English, written in the renderer** *(owner, 2026-10-08)*. The channel
is staff-only and has no locale. The DMs are in the gedu's own app locale, else the default;
times in both are the product's wall clock with its zone's short name, as `/sub` writes them
(`src/app/api/discord/` has the ruling).

**The state leads the Slack message as a plain section, never Slack's alert block**, which
Slack accepts in modals only: a message carrying one is refused whole as `invalid_blocks`,
so every sync's post and edit would fail. The offers' carousel and the two data tables —
the session's facts and the gedus — are message blocks, but Slack documents no fallback
for a client that cannot draw them, so the top-level `text` — what notifications and screen readers get — has to say on its own
what the request is and where it stands.

## Failures, edits and duplicates

- **Discord refusing a DM for good is recorded and never retried**: "cannot send messages to
  this user" (no shared server, or DMs closed) and "unknown user". The gedu's record keeps
  the error, Slack tags them "DM failed", and that request never tries them again — even
  after they open their DMs. Any other failure lets the rest of the sync run, then fails the
  job so the outbox retries it.
- **An edit is skipped when the rendering's hash is unchanged.** Each message's last-sent
  rendering is stored as a hash, so a sync with nothing new to say makes no Discord or Slack
  call. A DM press forgets its DM's hash before answering, so the next sync redraws that DM
  whatever the press left on it.
- **A duplicate post is accepted; a duplicate accepted DM is not.** The offer DMs and the
  Slack message are stored right after they are sent, so a crash between the two posts a
  second copy on the retry — rare, and harmless. The accepted DM is claimed *before* it is
  sent, so a crash after the claim loses it rather than sending it twice; a transient
  failure hands the claim back and retries.
- **Discord and Slack are each skipped where the environment has no credentials** for them,
  and the logo and the My SOG button are left off where `NEXT_PUBLIC_SITE_URL` is not an
  origin Discord can reach.

## A press drains in-process

An Offer or Decline in a DM, and an Accept in Slack, sync the request they changed in the
route that answered them, before the press's own reply, so the presser sees their message
change without waiting on the kick. A request another worker holds is left to it; its seq
check runs the change again.

## Local development

A local stack has no Vault secrets, so writes only fill the outbox. To send what it holds,
run the drain script against the running dev server; it calls the sync route with
`SUBSTITUTION_SYNC_SECRET` from `.env.local` and reports only that the drain started — the
outcome is in the server's log:

```bash
npx tsx scripts/drain-substitution-notifications.ts                       # http://localhost:3000
npx tsx scripts/drain-substitution-notifications.ts http://localhost:3001
```

`.env.local` holds the **staging** Discord bot and Slack app, so a local drain sends real
DMs, as the staging bot, to whatever Discord accounts the local database links, and posts in
the staging channel. Their buttons are answered by the deployment those apps point at —
staging — which knows nothing of a local request, so a press on one does nothing.

## Operator setup

These are writes to a hosted project and its deployments, made by the owner or with the
owner's say — never by a session on its own initiative (`supabase/CLAUDE.md`).

### Vault, per hosted Supabase project

Each project gets two Vault secrets: where its deployment's sync route is, and that
deployment's `SUBSTITUTION_SYNC_SECRET`. Staging points at `sogverse-staging.sog.gg` with the
unsuffixed secret from `.env.local`; prod at `sogverse.sog.gg` with
`SUBSTITUTION_SYNC_SECRET_PRODUCTION`.

```sql
SELECT vault.create_secret('https://sogverse-staging.sog.gg/api/substitution-notifications/sync', 'substitution_sync_url');
SELECT vault.create_secret('<that environment''s SUBSTITUTION_SYNC_SECRET>', 'substitution_sync_secret');

-- Changing one later:
SELECT vault.update_secret(id, '<new value>') FROM vault.secrets WHERE name = 'substitution_sync_secret';
```

The order against the deployment does not matter: a kick the route refuses leaves its row
due, and the minute's retry kicks again once both sides hold the same secret. A
feature-branch preview against staging's database is synced by the staging deployment's
code, since that is the URL in Vault.

### The Slack apps

Staging and prod are **two Slack apps** in one workspace, like the two Discord apps. The
staging app ("Sogverse Staging") was made from a manifest; the prod app is set up by hand to
the same shape. For each, at api.slack.com/apps:

1. **Bot token scopes `chat:write` and `commands`.** Adding a scope later only takes effect
   after the app is **reinstalled** to the workspace, which mints the token again.
2. **Interactivity** on, and **one slash command**, both with the request URL
   `https://<host>/api/slack/interactions` — `sogverse-staging.sog.gg` or `sogverse.sog.gg`.
   The command is `/link-staging` on staging and `/link` on prod, so both fit in one
   workspace; the route treats any command as the link command.
3. **Install** to the workspace (it may need a workspace admin's approval). The Bot User
   OAuth Token (`xoxb-…`) is `SLACK_BOT_TOKEN`; Basic Information → Signing Secret is
   `SLACK_SIGNING_SECRET`.
4. **`/invite @<bot>` in the substitutions channel**, whose id (channel details, at the
   bottom) is `SLACK_SUBSTITUTIONS_CHANNEL_ID`. Without the bot in it, posting fails with
   `not_in_channel`.

Each admin then runs the command once and confirms on `/link-slack`; until they do, their
Accept answers with the link button and changes nothing.

### Vercel

`SUBSTITUTION_SYNC_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` and
`SLACK_SUBSTITUTIONS_CHANNEL_ID` must be on **Preview** (the staging values, as in
`.env.local`) and **Production** (the `*_PRODUCTION` values), sensitive, followed by a
redeploy. The code reads only the unsuffixed names. The DMs also need the Discord bot's
variables (`src/app/api/discord/`), and the logo and the My SOG button need
`NEXT_PUBLIC_SITE_URL`.
