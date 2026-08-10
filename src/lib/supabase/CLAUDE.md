# Supabase clients & the paged-read discipline

This directory holds the Supabase client factories — browser (singleton), server
component, the privileged service-role one, and a cookie-free anon one — plus the shared
paging primitive every list read that can outgrow a single response goes through. The
first three are described in the root `CLAUDE.md`; the fourth is described below, and the
rest of this file is about the paging rules, which are normative for every service in the
codebase and not only the ones that happen to page today.

## The cookie-free anon client

**Rule: server work whose answer is the same for every visitor must not read cookies to
get it.** Touching cookies in a server render permanently opts that render out of caching
— the framework can no longer prove the output is shareable — so a public route pays a
per-request render for an identity the read never used. A page's robots policy, derived
from a column on the row it is about, is the shape this bites hardest: it sits on the
highest-traffic public routes and asks nothing about who is looking.

The anon factory is the answer: the anon key and no cookies, so it reads exactly what a
signed-out visitor reads. **Use it only where an anonymous answer is the correct answer.**
Anything varying by who is asking — anything behind an RLS policy keyed to `auth.uid()` —
must keep the cookie-bound server client, or it will read as a stranger and silently
return nothing rather than failing. Where a read can miss, the caller has to be built so
the miss lands somewhere safe.

## The problem paging exists to solve

PostgREST caps every response at its `max_rows` setting and enforces the cap by
**truncating** the response rather than by erroring. A select that returns exactly the cap
is byte-for-byte indistinguishable from one that returned everything: same status, no
warning, no flag on the response. So an unbounded list read does not fail loudly when its
table outgrows the cap — it starts quietly returning a prefix of the answer, and every
consumer downstream treats that prefix as the whole.

That is worse than a short list wherever a surface *cross-references* what it fetched.
A page that builds lookup maps from one read and resolves ids against them will not merely
omit the rows that fell off the end; it will render the rows it did get as though the
missing ones do not exist — an unlinked family, a badge asserting a state that was never
read. A missing row becomes a wrong answer.

## Rules

**Rule: any list read whose result is not bounded by construction must page through
`walkPages`.** "Bounded by construction" means the query itself can only ever match a
small, known number of rows — one row per key in a chunked key lookup, one child level of
a node that is small by definition. A filter that happens to match few rows today is not
bounded; a table that only ever grows will reach the cap, and the read will not tell you
when it does. If you cannot state the bound as a property of the query rather than a fact
about current data, page it.

**Rule: a paged query must ask for an exact count, and this is mechanically enforced.**
The walk stops when a page comes back short, which is only sound if a short page really
means "nothing follows". It does not when `max_rows` sits below the walk's page size —
then *every* page is short and a naive walk returns a fraction of the table on the first
request. Comparing the rows collected against the server-reported total is what turns that
into a thrown error, so the count is load-bearing rather than informational. A caller who
omits it disarms the guard, so the walk now refuses the first page that reports no total
instead of proceeding half-guarded. `max_rows` is a hosting setting nothing in this repo
controls, which is exactly why the walk cannot assume its value.

**Rule: a paged query must impose a *total* order.** Pages are windows into an ordered
result, so if two rows can tie on the sort key their relative order is free to differ
between two requests — and a tie straddling a page boundary lets the walk return one row
twice and drop another. The column a surface wants to sort by is almost never total on its
own: display names collide, and timestamps collide across rows written in the same
transaction. The fix is always the same shape — the sort key the surface wants, followed
by a unique tiebreaker, which in practice is the primary key. This binds one-page-at-a-time
reads exactly as hard as walking ones: under a partial order a page boundary silently
drops rows a user was about to scroll to.

## Three shapes of list read

Pick deliberately; they are not interchangeable.

- **Walk it** when a surface genuinely needs the *whole* result — something it groups,
  cross-references, or builds a lookup map from. The payload is proportional to the data,
  which is the cost you accept for completeness.
- **One page at a time** when the surface is browsing, and the payload must stay
  proportional to the screen rather than to the node. Returns the rows plus the true total
  and whether more follow, so the caller can render a count and a next-page control
  without a second query. Same two disciplines as the walk — exact count, total order.
- **Chunked keyed reads** when the caller already holds the ids. Splitting the key list
  into batches sized well under the cap means each request can return at most one row per
  key, so the read is bounded by construction and skips the walk entirely rather than
  reimplementing it. Two things bound the chunk size: the cap, and a query string long
  enough for a proxy to refuse.

## Accepted limitation: the offset race

Paging is offset-based, so a concurrent write can shift the pages under a walk in
progress. A row inserted ahead of the cursor pushes every later row down one position; the
next page then re-reads a row the previous page already collected and skips the one that
crossed the boundary. The count reconciliation cannot detect this — the walk still ends
holding the number of rows the server promised — and the duplicated row can go on to
collide as a React key wherever the list is rendered.

Keyset paging (carrying the last row's sort key forward instead of an offset) would close
this and is **deliberately not implemented**. These reads are rare, idempotent, and
refetched by the query cache, so the exposure is at most one wrong row for one load and it
self-corrects on the next fetch. That is the accepted tolerance, React-key collision
included. Revisit it if a walked read ever backs something that must be exactly right on a
single load — a total shown to a user, an export, anything written back to the database.
