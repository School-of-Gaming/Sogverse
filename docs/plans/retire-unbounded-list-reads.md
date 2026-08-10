# Retire the remaining unbounded list reads

## Problem

PostgREST enforces `max_rows = 1000` (`supabase/config.toml`) by **truncating** the
response, not by erroring, so an unbounded list read returns a confidently wrong partial
answer the moment its underlying set passes 1000 rows. Confirmed against the hosted
staging project on 2026-07-30: an anon select on `locations` (~35k rows) returns exactly
1000 rows and no error. The cap applies to every client including service-role, and to
set-returning RPCs; RPCs returning a single jsonb document are immune, and relations
embedded inside a row ride along uncapped.

The pattern that kills this class already exists and is proven: the admin users surface
was fixed in August 2026 via the shared paging primitive in `src/lib/supabase/`
(`walkPages` — pages until a short page, **requires and enforces** `count: "exact"`,
cross-checks the collected total, and demands a total order; its colocated `CLAUDE.md`
states the rules). A full-repo sweep on 2026-08-05 inventoried every remaining list read.
This plan converts the remaining risky ones and adds a ratchet so the class cannot
quietly return.

## Scale

- **WhatsApp (worst):** one row per message per conversation and one contact row per
  distinct phone number, both admin-surface reads with no bound. An active conversation
  is the fastest-growing set in the app.
- **Products:** the admin product list fetches every product ever created of a type
  (ended ones included, nothing pruned). `/schools` reads every visible
  municipality club — staging 50 / prod 20 on 2026-07-30 — but its row budget is consumed
  by ended clubs that keep matching the SQL filter.
- The failure is silent in every case: no error is thrown, surfaces render and act on
  incomplete data.

## The decision

Every list read that can exceed 1000 rows walks pages through the shared primitive, and
every keyed read whose key array is itself unbounded chunks its keys. Reads audited as
structurally bounded are recorded below and left alone. A mechanical check (workstream 5)
makes an unregistered unbounded read a build failure.

## Rejected alternatives

- **Raising `max_rows`.** Moves the cliff and keeps it silent. Rejected.
- **Keyset (cursor) paging.** Would close the offset race a concurrent insert can cause
  mid-walk, but was rejected as not worth the complexity: these reads are rare,
  idempotent, and refetched by the query cache. The race is documented in the primitive's
  doc comment as an accepted tolerance. Do not implement it here.
- **Fixing only the urgent reads and leaving the rest as TODOs.** The whole point of this
  plan is that the class dies: the cheap hardenings cost minutes each once the pattern is
  set, and the ratchet is what prevents regression.
- **Client-side search/filtering as a substitute for capped server reads** (considered
  for the admin users page): rejected because it forks matching semantics across surfaces
  and dies anyway under any future server-side pagination. Search stays server-side with
  a truncation indicator — the admin users page shows the settled shape.

## Workstreams

Ordered by urgency. Each is independently shippable and verifiable.

### 1. Admin WhatsApp inbox — most urgent

The conversation read (in `src/services/whatsapp/`) fetches one phone number's entire
message history ordered by creation time **ascending**, unbounded. Ascending order means
truncation drops the **newest** messages: past 1000 messages in one conversation the
thread freezes at message 1000 while looking live — the realtime subscription only
invalidates the query, and the refetch re-runs the same truncated read. The contact list
read (every contact row, ordered by last-message time descending) caps at 1000 distinct
phone numbers; it degrades gracefully (oldest-idle contacts drop) but is still wrong.

- Walk both reads through the shared primitive. Total orders: creation time plus the
  table's primary key for the messages; last-message time plus the primary key (the phone
  number) for contacts. Check `supabase/schema.sql` for the actual key columns.
- Consumers keep receiving plain arrays; no UI change. Fixing the read fixes the realtime
  path for free (hooks only invalidate — a repo rule — so the refetch is the same read).
- Unit tests per the users-service pattern: order params in the requested URL, the exact
  count requested, a two-page walk concatenating.

### 2. Admin product lists

The by-type product list read (in `src/services/products/`) fetches every product of a
type ever created — every status, ended ones included, with translation / schedule /
assignment / location embeds — ordered by creation time descending, unbounded. Past the
cap the oldest products silently vanish from the admin list.

- Walk it; creation time descending plus primary-key tiebreaker.
- The embeds ride inside each row and are not subject to `max_rows`; page payloads are
  heavy but correct, and this surface is admin-only. No embed changes.

### 3. `/schools` catalog reads — four coupled changes, one workstream

The visible-municipality-clubs read feeds both the `/schools` index and the
per-municipality page, which narrows client-side. Past 1000 rows the oldest clubs vanish
from their municipality's page, the index stops flagging that municipality, and the
municipality page's not-found gate can fire wrongly.

a. **Push the ended-club predicate into the query.** The SQL filter keeps clubs whose
   stored status is pending/running while the "this club has ended" judgement runs in JS
   after the fetch (nothing ever flips stored status), so every past term's clubs consume
   row budget while contributing nothing. Mirror the client-side ended judgement (the
   effective-status helpers in `src/lib/`) as query filters. **Timezone constraint:** the
   judgement compares against dates in the product's own zone (products are authored in
   `Europe/Helsinki`); the query-side predicate must not quietly substitute UTC "today" —
   follow the root `CLAUDE.md` date rules.
b. **Walk the read** through the shared primitive (total order: whatever the surface
   sorts by, plus primary key).
c. **Chunk the two keyed reads whose key array is the whole visible catalog** (both in
   `src/services/participations/`): the seat-count read and the customer's own
   participations read, each `.in("product_id", …)` over every visible product id. An
   unchunked key list caps the response exactly like an unbounded select. Chunk at ~100
   keys per request, the shape the locations service uses; if a shared chunked-keyed-read
   helper doesn't exist yet, extract one beside the paging primitive rather than
   hand-rolling per service.
d. **Scope the per-municipality page server-side and slim the select.** Today the page
   deliberately prefetches *all* visible clubs so `initialProducts` seeds the shared
   all-clubs query cache (flicker-free refetch); measured 2026-07-30: 50 clubs = 92.6 KB
   of JSON inside a 249 KB page, ~1.85 KB/club — and that is a floor, because the
   translations embed pulls `long_description` for every locale while no browse card
   renders it (only 3 of 130 translations have one today; real marketing copy across five
   locales inflates severalfold). Decided: scope the fetch to the one municipality
   server-side — it then needs its own query key, keyed by municipality, accepting the
   loss of the shared-cache seeding — and stop selecting `long_description` in browse
   reads.

### 4. Small hardenings — same pattern, minutes each

- **Feedback notification recipients** (the feedback API route): builds the admin email
  recipient list from an uncapped profiles read. Bounded by admin headcount today; walk
  it anyway — it is an action-on-incomplete-data shape (an email send), and shape is what
  the ratchet will check.
- **Gedu coverage read** (in `src/services/gedu-locations/`): one gedu's claims, bounded
  only by picker granularity — and the save is delete-then-reinsert of the full set, so a
  truncated read would silently **delete** the claims that fell off the end on the next
  save. Walk it.
- **Family resolution read** (in `src/services/family/`): an unfiltered profiles select
  that is scoped only by RLS to the calling customer's own family. Safe while only
  customers reach it; a future caller with broader row visibility turns it into an
  all-profiles truncating read. Walk it with a total order so that failure mode degrades
  loudly instead of silently.

### 5. The ratchet

Model on the integration suite's route posture registry (see `tests/CLAUDE.md`): a unit
test that statically sweeps `src/services/` and `src/app/` for `.from(…).select(` list
reads and asserts every one is bounded — terminated by a single-row modifier, carrying an
explicit limit, ranged/walked, or a chunked keyed read — or else registered beside the
test with a written reason. A string-level scan is acceptable; anything it cannot
classify goes in the registry with a reason rather than being special-cased in the
scanner. The check fails naming the offending file, and a registry entry for a read that
no longer exists also fails, so exceptions expire on their own (the same ratchet
discipline the route registry uses).

## Explicitly out of scope

- **The `/admin/users` server-side pagination restructure** — deliberately deferred with
  a written trigger (~5k profiles / DOM weight); tracked in `TODO.md`, not here.
- **Keyset paging** — rejected above.
- **Audited and deliberately unchanged** (bounded by construction; recorded so the next
  sweep doesn't re-litigate): voice zone/occupant reads (one group's roster), per-family
  participation and subscription reads, parent↔gamer link reads by parent or gamer, the
  holiday-calendar read (a handful of rows; its per-calendar embed is nested and uncapped),
  the spoken-languages reference read, all set-returning RPCs (each caller-scoped to own
  family / own assignments), and all jsonb-returning RPCs (structurally immune). These
  belong in the ratchet's registry with these reasons, which is where the audit record
  lives from then on.

## Constraints discovered while deciding

- `max_rows` truncates silently, for every role including service-role, and for
  set-returning RPCs. Embedded relations inside a row are not capped. A single-jsonb RPC
  is immune.
- The paging primitive **throws** if the first page reports no total (so `count:
  "exact"` cannot be forgotten silently) and requires a **total** order — the sort key
  the surface wants plus a unique tiebreaker, because `created_at` ties and names
  collide.
- The primitive's offset walk has a documented, accepted race: a concurrent insert can
  duplicate one row and drop another for one load, invisible to the count guard. Accepted
  because reads are idempotent and refetched; do not "fix" it in passing.
- Realtime hooks only invalidate queries (repo rule), so walking a read transparently
  fixes its subscription-driven refetches too.
- WhatsApp messages are the one set here ordered ascending by design (a chat thread);
  ascending + truncation drops the *newest* rows, which is why that read outranks
  everything else in this plan.

## Acceptance criteria

- Every read named in workstreams 1–4 walks or chunks, with unit tests pinning its total
  order and exact count (the users/gedu-profiles service tests are the template).
- The `/schools` fetch excludes ended clubs in SQL, the per-municipality page fetches one
  municipality under its own query key, and no browse read selects `long_description`.
- The ratchet test exists, passes with a registry whose every entry carries a reason, and
  fails on a new unregistered unbounded read (verify by temporarily adding one).
- `npm run lint`, `npm run type-check`, and `npx vitest run` green; no schema migrations
  (every change is query-side).
- This plan file is deleted in the change that completes the last workstream.
