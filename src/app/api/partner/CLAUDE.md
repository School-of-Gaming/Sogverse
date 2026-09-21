# The partner API

`/api/partner/v1/*` is a read-only API published to one outside partner, Lynx Educate,
for the Roblox Programme. Eight resources answer it: six return records a page at a time
(products, families, enrolments, sessions, feedback, research rows) and two return
aggregates (traffic, campaigns). The routes here are thin — gate, parse, read, validate —
and the reads live in `src/services/partner/`, over a shared layer of scope, lookups and
pure derivations that every resource goes through.

**Rule: the published documentation page is the contract, not this code.** The page at
`/docs/lynx-api` (copy under `docs.lynxApi` in the message catalogs) states every
resource, parameter, enum value and field. A change here that the page does not describe
is a breaking change to somebody's dashboard — write the page first, then the code.

**Rule: additions ship freely; removals and renames do not.** A new field or filter goes
out without notice, because a partner is told to read the fields it uses and ignore the
rest. A field removed or renamed, or a value whose meaning changes, is a new version
under a new path segment — which is what `v1` is for.

**Rule: errors on this surface carry `{ error: { code, message } }`, not the app's
`{ error: string }`.** The partner's own error handling is written against the published
envelope, so the partner contract wins here and nowhere else. Codes are stable
identifiers the partner may branch on (`unauthorized`, `server_misconfigured`,
`invalid_query`, `not_found`, `internal_error`); the message is English for a log, never
for display. Every response, success or failure, goes through the partner response
builder in `src/lib/api/`, which is what marks it `private, no-store` — the answer is
children's data, and nothing between us and the partner may keep a copy of it. An unknown
path under the prefix answers `not_found` in the envelope rather than the framework's
HTML 404; a method a real resource does not take keeps the framework's 405.

**Rule: every handler starts with `requirePartnerKey()` from `src/lib/api/`.** One issued
bearer token is both the partner's identity and the whole of its scope, compared in
constant time; a per-route copy is how one of them ends up comparing with `===`. Auth
precedes validation, so a caller without the key cannot probe the input handling — and
precedes the 404, so it cannot map which paths exist either. A missing key on our side is
a 500 and never a 401 — the caller did nothing wrong. The call stays in the route file
itself, where the route registry can see it.

**Rule: any throw inside a handler answers 500 `internal_error` in the envelope.** The
body after the gate runs inside `partnerRead()`: a caller's mistake found below the route
(a cursor that does not decode) is thrown as a query error and answers 400
`invalid_query`; anything else is logged server-side in full and answers a fixed message,
because a database error quoted over the wire tells an outsider about our schema. Lean on
this rather than around it. A partner pull treats a missing record as a deleted one, so a
broken invariant — a product with no name, a document version that is not a date, a
response the schema refuses — throws, and a loud 500 is always preferred to a plausible
answer that is quietly wrong.

**Rule: both directions of every resource are zod schemas in the partner contracts
module under `src/services/partner/`** — the query schema a route parses with, and the
response schema it validates what it returns against before answering. A schema is never
relaxed to let a read through: when a record fails its response schema, the read is what
is wrong. Enum values come from the generated `Constants` wherever the vocabulary is
genuinely the database's, and the tuples that are the API's own invention say so in a
comment. A tuple narrowing a database enum to the states the API describes — the enrolment
states without `reserving`, and the product states — is the API's own too, and stays
written out even where it happens to name every value the enum holds: what the partner
reads changes when somebody decides to change it, never because a migration widened an
internal enum underneath it. Such a tuple is written with a `satisfies` against the
generated type, so a rename fails to compile, and a record whose value falls outside it
throws rather than being mapped onto a value the page states. The documentation page
renders such a tuple rather than restating its values, and a test holds the rendered row
and the tuple together — so widening the contract is one edit, in one place, and a value
left out of it reaches neither the page nor the wire.

**Rule: an empty answer is a well-formed answer.** A record-returning resource answers
`{ "data": [], "next_cursor": null }` — a last page, not an error — and an aggregate
answers with its empty list and the range it covers. A filter naming an unknown or
non-Programme id is not a 404; it matches nothing. Every partner pull is a full pull that
treats a record's absence as "no longer in scope", so a resource must never fake a record
and must never answer 200 with a shape the page does not describe.

## What the partner may see

**Rule: the Programme scope is defined once, in the partner scope module, and every
resource reads through it.** A Programme product is one that requires the Programme's
terms document — the slug read from the consent registry's Programme bundle, never spelled
as a literal — whether or not the shop lists it. A live seat is an active, waitlisted or
completed seat on a Programme product; a reservation is never one. A resource that reads
seats, sessions, feedback or products selects through the scope's inner embeds rather
than restating the join or fetching an id list, and the `!inner` on every step of such an
embed is load-bearing: without it the filter narrows only the embedded rows and every
parent row still comes back. A row that references a person rather than a seat — a
feedback row, an attendance mark — outlives the seat it was made under, since cancelling,
removing or moving a seat deletes neither, so such a row is in scope only while its person
holds a live seat on the row's product, checked per batch against the scope's seat read.
Whether a session was recorded is not scoped that way: it is a fact about the session, and
a child leaving never makes one disappear for the children still in its group. `/campaigns` is the one resource that starts outside the
scope, from parent accounts, so nothing leaves it but counts — no identifier and no record
of any family — each withheld below the published minimum, and a count under it fails the
response schema, so a mistake there is a 500 rather than a small count. The minimum bounds
each count on its own and nothing more: two counts in one answer, the same range read on
two days, or two overlapping ranges can differ by one family, and the page promises no
more than that.

**Rule: seats placed without an acceptance on file count as consented (owner decision).**
An admin moving a seat, a requirement added after the seat, or a seat older than
acceptance tracking all leave no acceptance row, and in each an admin acted on the
parent's behalf — so the seat is in scope and reports both Programme documents as
accepted: the latest version published on or before its sign-up day (the earliest version
when none precedes it), accepted at its sign-up time. Where acceptance rows exist, the
latest one at or before now is reported instead. A document version is free text in the
database and a date on the wire; one that is not a date throws.

**Rule: an enrolment's status is derived, never the stored one.** Nothing flips a seat
when its product runs its course, so an active seat on a product whose effective status
is completed reports `completed`, as does a stored `completed`; a waitlisted seat stays
`waitlisted`. The `status` filter matches the reported value: the query narrows to the
stored statuses that could report it, and the rest is decided per row after the
product's status is known. The same shape holds for every value the database does not
store — a product's effective status, whether a session was ever recorded — and each is
derived in one shared place so two resources cannot disagree about it.

## How it reads

**Rule: the service-role client is constructed in exactly one module, and a read module
never names the admin client.** There is no Sogverse session behind a partner request, so
no row policy has anyone to evaluate and every read runs as the service role; the key is
the authorization, and what bounds what leaves is the Programme scope and the response
schemas. The route registry pins every file that names the service-role factory to a
written justification, and the partner surface has one justification for all of its
reads — so a route obtains the client through `partnerDb()` and passes it to the read
modules as a parameter, which is also what lets a test drive them over a stubbed
transport. The registry confines that accessor to the partner routes and services, so it
cannot become a way for the rest of the app to reach the service role unjustified.

**Rule: every record-returning resource pages through `readPartnerPage()`, keyset and
never offset.** A partner walks a whole resource while families keep signing up, and an
offset shifts under an insert — one record read twice, another never — which the general
paging tolerance in `src/lib/supabase/CLAUDE.md` accepts and this surface cannot. The
disciplines the reader holds a resource to:

- **A page is the next `limit` records after a key, in ascending key order**, fetched
  `limit + 1` at a time so a cursor is issued only when a record is known to follow. A
  key compares in code-unit order, which is the database's order for a uuid and for a
  timestamp as PostgREST emits it; a collated text column must never be a key.
- **The cursor is bound to its resource and its filters.** It carries a fingerprint of
  every parsed filter except `limit` and `cursor`, is unsigned because it holds only
  positions the caller was already given, and never expires. Replayed against another
  resource or under different filters it answers `invalid_query` rather than silently
  skipping or repeating records.
- **Every fetch selects an exact count, orders by its key and applies the cursor.** The
  reader throws on a batch shorter than asked whose count says more rows match (a
  truncated response looks exactly like the end of the data), on a fetch with no count,
  and on rows out of key order or not after the cursor.
- **A condition the database cannot state is applied per row, after the fetch** — the
  row's record comes back `null` — never by reshaping the fetch. The cursor stays a
  position in the one order every page walks, kept rows and dropped rows alike.
  Enrichment runs after the drop, batched per fetch, never per row. A record that only
  exists once a whole set is assembled (a family is a connected component) is sorted in
  memory and paged over with the same reader.
- **Every lookup behind a page follows `src/lib/supabase/CLAUDE.md`**: key lists chunked,
  anything with several rows per key walked, every walk totally ordered.

**Rule: every timestamp the API emits is normalised to ISO 8601 UTC with a `Z`.**
PostgREST serialises a timestamptz with an offset, which the contract's timestamp schema
refuses, and the page promises UTC. Bare dates keep the meaning the page gives each
filter: a session's product-local calendar day for sessions and feedback, the product's
start date for research rows, UTC days for traffic and UTC months for campaigns.

**Rule: `/traffic` reads Vercel Web Analytics, and its answer is at most an hour old.**
The source is configured by `VERCEL_ANALYTICS_TOKEN`, `VERCEL_ANALYTICS_TEAM_ID` and
`VERCEL_ANALYTICS_PROJECT_ID`; any of them unset answers 500 `server_misconfigured`, after the gate
and before the query is read, exactly as an unset partner key does. The resolved answer is
cached in Next's data cache across instances, keyed by the normalised query and the
current UTC hour, so no entry outlives the hour it was computed in and the page's "up to
an hour old" stays true. Each page's splits must sum to its total, and Vercel folding
groups into an "Others" row is a thrown error: a miscount is never answered. A fold is a
full response carrying that row — "Others" under the cap is somebody's real campaign. The
range is clamped to the days a count can exist on, from the earliest day the page says the
data reaches back to through today, because `range` is the days the counts cover; a range
sharing no day with them is refused.

**Rule: there is no rate limiting (owner decision).** Lynx is trusted to pace its own
pulls, so no resource answers 429 or sends `Retry-After`, and the page promises neither.
Adding a limit is a change to the contract and to that decision, not a hardening pass.
