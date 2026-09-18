# Supabase clients & the paged-read discipline

This directory holds the Supabase client factories — browser (singleton), server
component, and the privileged service-role one — plus the shared paging primitives every
list read that can outgrow a single response goes through. The factories are described in
`src/CLAUDE.md`; the rest of this file is about the paging rules, which are
normative for every service in the codebase and not only the ones that happen to page
today.

(A cookie-free anon factory existed briefly in August 2026 for visibility-conditional
robots metadata and was deleted when that policy became an unconditional static noindex —
if a genuinely identity-free server read ever returns, that shape is in the git history,
along with the caveat that it buys no caching while the root layout reads the session on
every request.)

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

**The one exemption is a keyset page, and it holds only on a stated condition.** Such a
page is a screenful — a couple of dozen rows, orders of magnitude below any plausible
`max_rows` — so a short page there really cannot be a truncated one, and the count buys
nothing but a round trip. The exemption is exactly as good as the page size: size a keyset
page anywhere near the cap and the truncation is indistinguishable again, and the count
guard comes back with it.

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
  without a second query. Same two disciplines as the walk — exact count, total order —
  and the paging rule below decides whether the page is addressed by offset or by key.
- **Chunked keyed reads** when the caller already holds the ids. Splitting the key list
  into batches sized well under the cap means each request can return at most one row per
  key, so the read is bounded by construction and skips the walk entirely rather than
  reimplementing it. Two things bound the chunk size: the cap, and a query string long
  enough for a proxy to refuse. The chunking primitive lives here beside the walk, so one
  size answers to both bounds in one place.

  **Chunking and walking are not alternatives, and a read over an id list may need both.**
  Only a *keyed* read gets one row per key; a read that filters by a key list and returns
  many rows per key — a tally, a child list — is chunked for the URL's sake and still
  unbounded inside each chunk. Chunk it and walk each chunk: the chunk bounds the request,
  the walk bounds the response, and neither substitutes for the other.

## Offset or keyset: how a page is addressed

An offset page is "rows 25–49 of the current ordering", so a concurrent insert ahead of
the cursor shifts it: every later row moves down one position, the next page re-reads a row
the previous one already collected, and the row that crossed the boundary is never read at
all. The count reconciliation cannot see it — the read still ends holding the number of
rows the server promised — and the duplicate goes on to collide as a React key wherever the
list is rendered. A keyset page is "the rows after this row", expressed against the
ordering columns themselves, so nothing an insert does to the row count can move it.

**Rule: offset paging is for a read that happens once and is thrown away — a whole-table
walk, or a page nobody pages past. A list a person pages through interactively is keyset,
always.** The difference is not how likely the race is but what it costs when it lands. A
walk absorbs it: the result is one load, idempotent, refetched by the query cache, so the
exposure is at most one wrong row for one load and it self-corrects. An interactive list
cannot: every page is on screen at once, so the duplicate is a React-key collision between
two rendered rows and the dropped person is simply absent with nothing to say so — and on a
newest-first list of accounts, the insert that causes it is an ordinary signup while an
admin scrolls. Walking is still the right shape for the reads it was written for, and
nothing about this converts them.

**Rule: a keyset cursor is the ordering columns' own values, carried as the strings the
database emitted.** Not re-serialised, not parsed and reformatted: a `timestamptz` arrives
at microsecond precision and a JavaScript clock holds milliseconds, so a value round-tripped
through one is strictly *earlier* than the row it came from and re-reads every row written
inside that millisecond. The tiebreaker rule above binds here exactly as hard — a cursor on
a non-unique column alone repeats and drops rows at every tie — so the ordering, the
resume filter and the derivation of the next cursor belong to one place per order, never
assembled per call site.

**The resume filter is the query's top-level `or`, which is the one composition constraint
this shape carries.** Every other filter is its own parameter and PostgREST ANDs them, so a
search, a role filter and a set of ids compose freely; a second top-level `or` is a second
thing to get wrong, so a search that genuinely wants several columns ORed together belongs
in a searchable column on the view, where it is one filter again.
