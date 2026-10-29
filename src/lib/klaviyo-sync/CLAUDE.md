# Klaviyo parent sync

Every parent account has a Klaviyo profile that says who they are, their gamers, what
seats they hold and what they have paid; Klaviyo lists that record what kinds of seat they
have ever held; and Klaviyo hears of what happens to them — an account opened, a seat
taken, a session attended or missed, a waitlist joined, a seat offered, a subscription
cancelled — as events. One way only:
nothing Klaviyo holds is ever read back except the profile's own Klaviyo id. The newsletter
form on landing pages writes to the same Klaviyo account (`src/services/landing-pages/`),
through the same client. Klaviyo is the source of truth for School of Gaming's own mailing
list; the `school_of_gaming` consent rows Sogverse wrote before it moved stay in the
database unread, and carrying them into Klaviyo and removing them are later changes.

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

**A snapshot carries no gamer's name and no birth month** — a gamer is their birth year,
their gender and which game accounts are linked. Adding a child's name or birth date back
is a decision about children's data, not a new property.

**Only a registered parent has a snapshot** — a `customer` row whose
`registration_completed_at` is set. A Google sign-up is a customer row, with a verified
address, before it has registered, and it may never register, or register as a gedu; none
of those reaches Klaviyo. The profile trigger watches the role and the registration stamp
as well as what the snapshot reads, so completing a registration files the parent, and a
row leaving `customer` is filed one last time. An event filed while its parent still owes
the registration — a Google parent's terms are recorded a moment before the stamp — waits
unclaimed until it lands, rather than meeting no snapshot and being dropped.

**A parent the snapshot read no longer returns is deleted from Klaviyo**, found by their
external id (the Sogverse profile id), through Klaviyo's data-privacy deletion, which also
takes any subscription and list membership that address held. That is the erasure path: an
erased account must not survive as a marketing profile. Their unsent events are finished
unsent.

**Opting a parent out of Klaviyo is one predicate.** The drain asks one question of each
snapshot — is this parent kept out of Klaviyo? — and a yes deletes the profile and drops
the events exactly as for a parent who is gone. Nobody is kept out today; an opt-out is a
snapshot field and that one predicate in the drain, nothing more.

## The contract is public

`contract.ts` is the only place a name Klaviyo sees is written: every profile property,
every metric and every event property, the newsletter form's properties, and which lists a
parent belongs to. **A name there is a dependency marketing
has built on in Klaviyo**, where this repo cannot see it, so a rename is a breaking change:
add the new name, send both, tell marketing, and drop the old only once nothing uses it.
The unit test pins every name and its value type and fails on any change, so the change is
always deliberate.

- Custom profile properties are `sog_` plus a snake_case name; metrics are `SV ` plus a
  Title Case name; event properties are snake_case with no prefix, since the metric carries
  it. Klaviyo's own attributes — address, names, a valid E.164 phone, locale, country,
  external id — are sent as its built-ins.
- `sog_locale` is the app locale the parent reads Sogverse in, and `sog_spoken_languages`
  the languages their children may be placed in: two things, never called "language".
- Dates are ISO strings Klaviyo segments on as dates, never a countdown, which would be
  wrong the day after it was sent. An absent value is sent as `null`, which clears it.
- **A seat is a seat, whatever its billing mode.** `sog_product_types`,
  `sog_product_topics`, the type lists and `SV Enrolled` count every held seat — paid,
  free or a municipality's contract — and the event carries `billing_mode`, so a segment
  that wants paying families asks for it. Only `sog_paid_until` reads paid seats alone:
  the latest date any of them runs to, a club's subscription paid period end as a date in
  the club's zone, and a camp's or event's last day. A cancelled seat is deleted from the
  database, so the profile describes the seats held now; the lists and the events are
  what keep history.
- `SV Enrolled` is one event per held seat, with no money value: renewals reach Klaviyo
  through Stripe's own integration, and payments are profile totals
  (`sog_first_payment_at`, `sog_last_payment_at`, `sog_total_paid_eur`), never events. It
  says who holds the seat and, on a gamer's, the child's birth year and gender, and it
  carries the UTM tag of the visit that led to the booking — stored on the seat when it is
  made, and only under marketing cookie consent, the same gate as the account's own tag.
- `SV Session` is one event per attendance mark a gedu writes, present or absent. A mark
  changed to the other status is a new event, keyed by session, gamer and status, so a
  mark set back to what it was is the earlier event again and Klaviyo does not count it
  twice; a deleted mark sends nothing.
- A gamer is `sog_gamer_birth_years` — one string per gamer, so twins appear twice and a
  segment asks whether the list contains `2016` — and `sog_gamer_genders`, the distinct
  genders given. Never an age, which would be stale a year after it was sent.
- `sog_env` is `production` on the production deployment and `staging` everywhere else,
  preview and local included: one Klaviyo account holds both, and every segment and flow
  has to filter on it.
- **The property filters segments; it does not separate the two.** Klaviyo identifies a
  profile by its email address, so a staging account under an address that also exists
  in production writes onto that production profile, or collides with it and fails, and a
  staging registration with the mailing-list box ticked subscribes that real address.
  Staging accounts therefore use addresses that exist nowhere in production — a
  plus-address of a mailbox the tester owns (`name+staging-1@…`) is the usual one.
- The account's `sog_utm_…` properties — the visit the account was created on — and the
  newsletter's `sog_newsletter_…` ones are separate on purpose: a subscriber who later
  opens an account is one profile.

## Sogverse sends facts; Klaviyo derives

**Rule: the contract sends what happened and what is so, and leaves to Klaviyo anything its
own segment and flow filters can work out from those.** A derived property is a second
copy of a fact that can only lag it, and every one is another public name to keep. So there
is no youngest or oldest child (a segment filters the birth years), no first purchase (a
new customer is `sog_first_payment_at` within the last day, and a first booking of a kind
is a filter over `SV Enrolled`), and no last-attended date (a filter over `SV Session`).
A new property earns its place only when Klaviyo cannot reach the answer from what is
already sent.

## Lists are history

**Lists are only ever added to.** Every profile sync in production adds the parent to
`SV Account`, and for every seat held, whatever its billing mode, to its type's list:
`SV Club` for a consumer club, `SV Camp`, `SV Event` and `SV Municipal club`. Klaviyo's add is a no-op for a
member, so repeating it every sync costs nothing, and nothing ever removes anyone: a list
answers "ever had", which the snapshot alone cannot once a seat is deleted. **Staging adds
to `SV Staging` and to no other list**, so staging traffic never lands in a production
list. The ids are deployment configuration (`lists.server.ts`), and an unset id fails the
row, naming the variable, before anything is written.

## Consent rides on the event that recorded it

**Klaviyo owns marketing consent; the sync sends a yes once, with the event of the moment
it was given, and never sends a no.** Two moments give one:

- **Registration.** When the account's creation event goes out for a parent who ticked
  the registration form's mailing-list box, the sync subscribes them under the custom
  source `Sogverse account registration`. The answer, yes or no, is also the
  `sog_registration_marketing_answer` property.
- **A product sign-up that asked.** A product may ask "I want emails from School of
  Gaming", unticked, with every booking. The answer is stored on the seat, never in
  `marketing_consents`, and a yes subscribes the parent when that seat's `SV Enrolled`
  goes out, under the custom source `Sogverse product sign-up`.

Both subscribe to email marketing into the marketing-consent list — `SV Marketing consent`
in production, `SV Staging` elsewhere, the same list the newsletter form subscribes into.
The profile sync never sends a subscription status, and an unticked or never-asked answer
sends nothing, so an unsubscribe in Klaviyo is undone only by a fresh yes the parent gives
later.

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
- **A drain runs until both outboxes are empty, with no time limit of its own.** The sync
  route answers 202 at once and drains after the response; the platform's default limit
  on the function is the only one, and the route sets none. A drain stopped mid-batch
  loses nothing: its leased rows are taken by a later drain once the lease runs out, and
  every call repeats harmlessly. A backlog larger than one drain gets through — the first
  sync after deploy, which files every parent — is finished by the next kicks, or by
  calling the route by hand with the environment's secret.

## Nothing runs on a clock

**A failed row waits for the next write anywhere.** Every write that files a parent or an
event kicks the sync, and the drain claims every row that is due, not only the one that
kicked it — so a lost kick, a sync that died holding its lease or a backoff run out is
picked up by whichever write comes next, from any family. Nothing kicks a quiet database;
that latency is accepted. A parked row waits for its own parent to change.

**When parents stop reaching Klaviyo**, look at the outboxes' parked rows and their
`last_error` first, on the hosted project (`supabase/CLAUDE.md` governs reading it).

## Operator setup

These are writes to a hosted project, its deployments and the Klaviyo account, made by the
owner or with the owner's say — never by a session on its own initiative.

- **The key.** `KLAVIYO_PRIVATE_API_KEY` is one private key for the one Klaviyo account,
  full access, or custom with at least Profiles read and write, Lists write, Subscriptions
  write, Events write and Data Privacy write. A key missing a scope fails every call that
  needs it.
- **The lists**, all single opt-in, their ids from Lists & segments → the list → Settings:
  `KLAVIYO_MARKETING_CONSENT_LIST_ID` on Preview (`SV Staging`) and Production
  (`SV Marketing consent`, from `…_PRODUCTION`), and `KLAVIYO_ACCOUNT_LIST_ID`,
  `KLAVIYO_CLUB_LIST_ID`, `KLAVIYO_CAMP_LIST_ID`, `KLAVIYO_EVENT_LIST_ID` and
  `KLAVIYO_MUNICIPAL_CLUB_LIST_ID` on Production alone (each from its `…_PRODUCTION`). The code reads only the unsuffixed names.
  `KLAVIYO_MARKETING_CONSENT_LIST_ID` replaces `KLAVIYO_NEWSLETTER_LIST_ID`, and has to be
  on Vercel Preview and Production before this code deploys — the sign-up and the
  registration tick fail without it. It is already set on both. Once this is released,
  `KLAVIYO_NEWSLETTER_LIST_ID` is deleted from Vercel and from `.env.local`.
- **The secret.** `KLAVIYO_SYNC_SECRET`, one random value per environment, on Vercel
  Preview (the unsuffixed value) and Production (`KLAVIYO_SYNC_SECRET_PRODUCTION`),
  sensitive, then a redeploy. An unset secret refuses every call to the sync route.
- **Vault, per hosted Supabase project**: where its deployment's sync route is, and that
  deployment's secret.

```sql
SELECT vault.create_secret('https://sogverse-staging.sog.gg/api/klaviyo-sync/sync', 'klaviyo_sync_url');
SELECT vault.create_secret('<that environment''s KLAVIYO_SYNC_SECRET>', 'klaviyo_sync_secret');
```

Prod points at `sogverse.sog.gg`. The order against the deployment does not matter: a kick
the route refuses leaves its rows due, and the next write kicks again once both sides hold
the same secret.
