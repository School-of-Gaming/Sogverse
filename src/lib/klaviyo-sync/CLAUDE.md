# Klaviyo parent sync

Every parent account has a Klaviyo profile that says who they are, their gamers, their
seats, their subscription and their payments, and Klaviyo hears of what happens to them —
an account opened, a seat taken, waited for or offered, a payment, a subscription
cancelled — as events. One way only: nothing Klaviyo holds is ever read back except the
profile's own Klaviyo id. The newsletter form on landing pages writes to the same Klaviyo
account (`src/services/landing-pages/`), through the same client.

## The database announces ids, never payloads

**Rule: the database says only *which parent* changed or *which event* happened; this
directory decides what Klaviyo is told.** Triggers on every table a parent's picture reads
put the parent's id in the profile outbox, and the rows that are events put themselves in
the event outbox. The sync reads one snapshot of each parent as they stand now and writes
the whole profile from it, so a new property needs no database change unless it needs data
the snapshot does not carry, and a new kind of change that should reach Klaviyo needs only
to enqueue the parent. Once per transaction the database kicks the sync route with a
Vault-gated `pg_net` call after commit; with no Vault secrets — every local stack and CI —
the outboxes fill and nothing is sent.

**A parent the snapshot read no longer returns is deleted from Klaviyo**, found by their
external id (the Sogverse profile id), through Klaviyo's data-privacy deletion, which also
takes any newsletter subscription that address held. That is the erasure path: an erased
account must not survive as a marketing profile. Their unsent events are finished unsent.

**Opting a parent out of Klaviyo is one predicate.** The drain asks one question of each
snapshot — is this parent kept out of Klaviyo? — and a yes deletes the profile and drops
the events exactly as for a parent who is gone. Nobody is kept out today; an opt-out is a
snapshot field and that one predicate in the drain, nothing more.

## The contract is public

`contract.ts` is the only place a name Klaviyo sees is written: every profile property,
the gamer objects' keys, every metric and every event property, and the newsletter form's
properties. **A name there is a dependency marketing has built on in Klaviyo**, where this
repo cannot see it, so a rename is a breaking change: add the new name, send both, tell
marketing, and drop the old only once nothing uses it. The unit test pins every name and
its value type and fails on any change, so the change is always deliberate.

- Custom profile properties are `Sogverse ` plus a Title Case name; event properties need
  no prefix, since the metric carries it.
- Dates are ISO strings Klaviyo segments on as dates, never a countdown, which would be
  wrong the day after it was sent. An absent value is sent as `null`, which clears it.
- `Sogverse Environment` is `production` on the production deployment and `staging`
  everywhere else, preview and local included: one Klaviyo account holds both, and every
  segment and flow has to filter on it.
- The account's `Sogverse Signup …` properties and the newsletter's `Sogverse Newsletter …`
  ones are separate on purpose: a subscriber who later opens an account is one profile.

## Consent is sent once

**Klaviyo owns marketing consent; Sogverse sends it exactly once.** When the account's
creation event goes out for a parent who ticked the registration form's mailing-list box,
the sync subscribes them to email marketing, with no list, under the custom source
`Sogverse account registration`. Nothing else ever touches consent: the profile sync never
sends a subscription status, and an unticked or never-asked answer is only the
`Sogverse Registration Marketing Answer` property. Whether that subscription sends a
confirmation mail is the Klaviyo account's default opt-in setting. An unsubscribe in
Klaviyo is therefore never undone by Sogverse.

## The outboxes and the drain

- **Profiles drain before events**, so an event lands on a profile that already says what
  it is about. Events name their profile by address and external id together.
- **A profile is updated by its Klaviyo id**, looked up by external id on each sync, so a
  changed address moves across rather than splitting the parent into two profiles. An
  address change onto an address Klaviyo already holds as another profile is refused by
  Klaviyo, and that row fails until it parks.
- **A claim leases rows for two minutes; finishing compares the seq**, so a parent changed
  mid-sync is synced again. A failed row backs off 2^attempts minutes, capped at an hour,
  and after twelve attempts is **parked** (`next_attempt_at` infinity, `last_error` saying
  why) until the parent next changes. A 429 is an ordinary failure.
- **One row's failure is that row's**, recorded on it as a label — the call and Klaviyo's
  error codes, never an address or a name — and the batch goes on.
- **No key, no claim.** Where `KLAVIYO_PRIVATE_API_KEY` is unset the drain claims nothing,
  so every row stays due and goes out once the environment is configured.
- The sync route answers 202 at once and drains after the response, for up to 45 seconds
  of a 60-second function; whatever is left is the next kick's.

## Nothing runs on a clock

An admin opening the Users list calls the observation route, which kicks the sync when a
row in either outbox is due and unleased (a lost kick, a sync that died holding its lease,
a backoff run out), and answers how many rows are parked; the page shows one quiet line
when any are. That is the whole of the sync's clock: until somebody looks, a stuck row
waits.

**When parents stop reaching Klaviyo**, look at the outboxes' parked rows and their
`last_error` first, on the hosted project (`supabase/CLAUDE.md` governs reading it).

## Operator setup

These are writes to a hosted project and its deployments, made by the owner or with the
owner's say — never by a session on its own initiative.

- **The key.** `KLAVIYO_PRIVATE_API_KEY` is one private key for the one Klaviyo account,
  with Profiles read and write, Lists write, Subscriptions write, Events write and Data
  Privacy write. A key missing a scope fails every call that needs it.
- **The secret.** `KLAVIYO_SYNC_SECRET`, one random value per environment, on Vercel
  Preview (the unsuffixed value) and Production (`KLAVIYO_SYNC_SECRET_PRODUCTION`),
  sensitive, then a redeploy. The code reads only the unsuffixed name, and an unset secret
  refuses every call to the sync route.
- **Vault, per hosted Supabase project**: where its deployment's sync route is, and that
  deployment's secret.

```sql
SELECT vault.create_secret('https://sogverse-staging.sog.gg/api/klaviyo-sync/sync', 'klaviyo_sync_url');
SELECT vault.create_secret('<that environment''s KLAVIYO_SYNC_SECRET>', 'klaviyo_sync_secret');
```

Prod points at `sogverse.sog.gg`. The order against the deployment does not matter: a kick
the route refuses leaves its rows due, and the next observation kicks again once both sides
hold the same secret.
