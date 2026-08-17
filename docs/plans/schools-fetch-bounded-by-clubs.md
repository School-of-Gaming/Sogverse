# Bound the /schools reads by clubs, not by Finland

## Problem

All three public municipality-club routes — `/schools`,
`/schools/[municipalityName]` and `/schools/[municipalityName]/[id]` — run the same
whole-country read. The detail route is the starkest case and is covered in full below;
the two listing routes are the ones that matter most, because `/schools` is the landing
page. Stated for the two listing routes first — `/schools` and
`/schools/[municipalityName]` — read **every Finnish municipality** (308 rows, each
carrying a 3-level ancestor embed) on every request, and then narrow that set down to
something bounded by the number of clubs (tens). `/schools` additionally serialises all
308 entries into the RSC payload, so they ship to every visitor's browser.

Measured against production (first request after a 25-minute idle, so all caches cold):

| | measured |
|---|---|
| `/schools` cold TTFB | **1170 ms** |
| `/schools` warm TTFB | ~185 ms |
| Server fetch per request | **238,285 bytes** |
| Client RSC payload per visitor | ~60 KB (estimated from row count) |

Decomposition of the 1170 ms: ~40 ms network, ~107 ms Vercel lambda init, ~145 ms warm
server work, and **~878 ms (75%) is the municipality read running against cold caches.**

The read is not merely large, it is bounded by the wrong variable. Two facts, both
verified in the code, make the whole-country read unnecessary:

- **`/schools` never renders the clubless municipalities in its default view.** The
  browse component filters the entries to those with clubs before grouping them by
  region. The only consumer of the remaining ~290 entries is the client-side search box.
- **`/schools/[municipalityName]` 404s for a municipality that has no clubs**, by an
  explicit guard, identically to how it 404s for a nonsense slug. So the set of slugs
  that can ever produce a page is exactly the club-bearing municipalities' slugs.
  Resolving a slug against all of Finland and then discarding every clubless hit is O(M)
  work for an O(C) answer.

## Scale

`/schools` is the product's main landing page and is expected to become the
highest-traffic page on the site within a month, driven by a marketing push. Today it
sees roughly one visit per day.

Two consequences:

- **Real-user monitoring cannot be used to justify or verify this work.** Speed Insights
  is a lagging indicator; at current traffic it reports nothing useful, and by the time
  it reports anything the affected visitors have already had the bad experience. Use the
  controlled probe described under Verification instead.
- **The cold path is what a traffic ramp actually gets.** A launch burst means many
  concurrent cold lambda invocations each pulling 238 KB against a cold database. The
  performance log records two prior incidents where per-request work that was fine at low
  volume crossed a nonlinear knee under concurrency.

## The decision

**Two changes. The first is contained and obviously right; the second is the one that
actually makes `/schools` fast.**

### 1. Reverse the data flow on both routes — clubs first, geography second

Instead of reading the country's municipalities and narrowing, start from the clubs (both
routes already read them) and derive the geography from what they point at. Always resolve
a club's location **up to its nearest municipality** using the existing resolver — never by
comparing a club's location id against a municipality id, which keeps only the online half
and silently drops every in-person club.

The two routes then diverge, because they need different things:

- **`/schools/[municipalityName]` needs no location read at all.** The product embed
  already carries the municipality's `id`, `name` and `name_i18n` — directly for an online
  club, as the parent for an in-person one — and this page uses only the id, the slug from
  the URL, and the display name. It never uses the region. So the display name, the
  canonical slug and every alternate slug are all derivable from the clubs alone: **zero**
  location reads, and two phases instead of the three a keyed read would have forced.
- **`/schools` does need the keyed read**, because its region grouping is only reachable
  through the ancestor chain (an in-person club's embed stops at the municipality). Read
  exactly the club-bearing municipality ids through the service's **keyed read** — rows by
  id with their chains, chunked under the response cap, so it is bounded by construction:
  no paged walk, no exact-count.

No schema change. The clubless-municipality 404 surface is unchanged, because clubless and
unknown slugs already 404 together.

**One deliberate behaviour change, decided by the owner:** the keyed read does not filter
retired rows (the offer/keyed split in the locations architecture forbids it, and no
application read may select the column at all). So a club anchored to a *retired*
municipality, today hidden from `/schools` and 404ing at its own URL, will now appear.
**This is accepted.** The club is real and already visible in `/shop`, so hiding it means a
family cannot find a club they may be enrolled in; retirement only happens through rare
reconciliation migrations. Do **not** reintroduce a filtered whole-country read to restore
the old behaviour. Non-Finnish and non-municipality rows are a different matter, and the two
routes can no longer treat them identically:

- **On `/schools`**, both are still excluded — the keyed read returns rows carrying `type`
  and `country_code`, so filter its results in memory, which needs no forbidden column.
- **On `/schools/[municipalityName]`, the country cannot be checked at all**, because the
  product's embedded location carries only id, name, name alternates and type. Type is
  handled by the resolver; country has nothing to check against. So a club anchored to a
  non-Finnish municipality would render at its own URL while remaining absent from
  `/schools`. **This is accepted, for the same reason as the retired case and one of its
  own:** on a detail route the club's existence is the authority — if a club is running
  there, its page should render — and the country check was an incidental property of the
  old whole-country read rather than a rule anyone stated. The picker only ever offers
  Finnish municipalities, so this is reachable today only through legacy rows the database
  trigger still permits.

### 1b. The detail route: drop the read, keep the named back link

`/schools/[municipalityName]/[id]` runs the same whole-country read to produce **one
string** — the municipality's display name for the back link's label. Measured cold at
**1102 ms**, against ~295 ms for `/shop/[id]`, which is the identical page without that
read.

**Remove the read, and take the name from the product instead.** The product row this page
already fetches client-side embeds its location with `name` and `name_i18n`, at both the
municipality and the parent level — so the display name is derivable from data already in
flight, at no cost. Resolve the product's location up to its municipality and localise the
name, exactly as the listing routes do.

**The back link keeps its municipality name. Do not replace it with a generic label** — an
earlier attempt did, on the mistaken belief that keeping the name required keeping the
read. It does not, and the generic label was reverted rather than shipped, so no new
translation key is needed for this. Fall back to the existing generic sibling label only
where a product has no resolvable municipality.

There is no latency cost to deriving it client-side: the back link lives inside a body
that does not render until that same product query resolves, so a server-resolved name
could never have painted any earlier either.

Two consequences to keep: the link's **href** is built from the URL slug and is unaffected;
and with the read gone, an unknown municipality slug no longer 404s — it renders the
product with a back link to a listing that will itself 404. That is acceptable on the same
grounds as the other accepted divergences: the route is `noindex`, and the slug never
gated the product.

### 2. Hybrid search on `/schools`

Change 1 alone does **not** fix `/schools`, because the search-any-municipality feature
still wants all 308 rows. That feature is therefore the whole remaining problem.

- Ship only the **club-bearing** municipalities to the browser and search them **in
  memory, instantly** — this covers every *successful* search, so the common path is
  unchanged from today.
- When a query matches nothing locally, fall back to the **existing cached, indexed
  location search route**, scoped to Finland and to the municipality level, to answer the
  long tail (a real municipality where we run no clubs). Flag each such hit "nothing here
  yet" by testing its id against the club-bearing id set the page already holds.

This keeps the instant path for every query that succeeds and pays a network round trip
only on queries that were going to end in disappointment.

**It does not remove the TypeScript fold, and nothing in this plan should claim it does.**
The local arm still folds the query to match pre-computed slugs, so a second
implementation of the matching rule survives — it is merely confined to the small
club-bearing set instead of ranging over the whole country. What the hybrid buys is that
the *long tail* is answered by the database's own index rather than by that fold. See the
Constraints entry before rewriting any documentation about it.

## Rejected alternatives

Each of these was considered and turned down **after** measurement. Do not rebuild them.

- **A generated, indexed `slug` column on locations.** Attractive because slug→row is
  currently an O(M) in-memory scan. Rejected because change 1 removes the scan entirely —
  the question stops being asked rather than getting a faster answer. It is also harder
  than it looks: a slug must invert from the canonical name *and* every `name_i18n`
  alternate (both `helsinki` and `helsingfors` must resolve), and the link a viewer
  follows is built from their own locale's slug — so it is an array column or side table
  with its own index, plus the per-locale slug-collision invariant that the locations
  architecture doc already flags for re-checking whenever a locale is added. If a genuine
  slug→row lookup over a whole country is ever needed, note that the database already
  holds the inversion structure in its folded search column; an RPC over that is cheaper
  than new schema.
- **Trimming the ancestor embed, or fetching the ~19 regions as a separate query.**
  Measured: trimming the embed to one level saves 31% of the payload; dropping it and
  reading regions separately saves 61%; also dropping unread columns saves 82%. All real,
  all irrelevant — they optimise a query that should no longer run.
- **Cross-request caching of the built entry list.** It can amortise the *server* fetch,
  but it cannot touch the per-visitor client payload, which is the larger problem on a
  landing page. It also introduces a staleness window that interacts badly with the
  layout-stability rule (cached HTML showing a just-unpublished club that a client
  refetch then removes is a shift on data's own schedule). Revisit only if a burst test
  shows the *remaining* server work is a problem.
- **Fully server-side search** (every keystroke hits the search route). This was the
  first recommendation, made while the page was believed to be low-traffic. On a
  high-traffic landing page whose primary interaction is "find my town", making every
  keystroke networked is a real downgrade — hence the hybrid.
- **Static generation / ISR for these routes.** The root layout reads the session on
  every request, so these routes are dynamic regardless of what the page itself does.
  Making them static means restructuring root-layout auth, which is a much larger piece
  of work tracked separately in the performance log. Not part of this plan.

## Constraints discovered while deciding

- **The keyed read must stay keyed.** It chunks its id list under the response cap, which
  is what makes it bounded by construction and why it does not page. Do not "improve" it
  into a filtered whole-table read.
- **Club→municipality membership must be *resolved*, never compared.** A municipality
  club's location is the municipality row itself when online, and a site inside it when
  in person. Comparing a club's location id against a municipality id keeps only the
  online half and silently omits every in-person club. Use the existing resolver.
- **The search box currently re-implements the database's name fold in TypeScript**
  (decompose, strip accents, lowercase, hyphenate) and applies it to the query. The
  locations architecture doc records deleting exactly one such second fold already and
  warns against reintroducing one: two implementations of "what counts as a match" agree
  only by habit, and drift silently. The hybrid keeps a local match only over the small
  club-bearing set; the long-tail arm must ask the search index rather than folding
  anything itself.
- **The indexed search route has a minimum query length, a result cap, and a debounce**,
  and it reports the true match count alongside the capped page. It returns hits carrying
  their ancestor chains, so a region sub-line still renders. It takes country and level as
  parameters that the *database* applies — never filter its results afterwards, because
  ranking and capping happen before anything downstream sees them.
- **Loading affordance for the fallback arm: none, and the "no matches" card waits for
  it.** A capped top-N against an index is a near-instant call that still needs a network
  hop, so per the house loading rules it gets no spinner, no skeleton and no delay. That
  leaves a real fork, decided by the owner: **render nothing in the results area until the
  fallback resolves.** The consequence is accepted — the "no matches" card, which appears
  instantly today, will now appear after a round trip. The alternative (show "no matches"
  immediately, then replace it with fallback hits) resizes the results container on data's
  own schedule, which the layout rule forbids. Only the very first fallback query is blank
  in practice, because the search hook keeps previous results as placeholder data.
  **Withhold the empty state only while a fallback is actually pending.** The local arm has
  no minimum length but the fallback is gated at two characters, so a one-character query
  with no local match has no request in flight and nothing to wait for — it must show the
  empty state immediately, exactly as today. Withholding it there would leave the results
  area permanently blank.
- **Layout stability:** search results changing in response to typing is user-initiated
  and therefore permitted, but the results container must not resize the page around it
  as the two arms swap.
- **The slug helper is not the "second fold" to remove, and cannot be removed.** It builds
  every `/schools/<slug>` URL and is what slug resolution matches against; it has its own
  unit test and a DB uniqueness test. What must not exist is a *second matcher*: the
  long-tail arm asks the search index and folds nothing itself. The local arm may keep
  matching pre-computed slugs, because it only ever narrows the small club-bearing set the
  page already holds. Note that `src/services/locations/CLAUDE.md` currently claims the
  TypeScript fold is already gone, which is false while the browse component folds a query
  — correct that claim as part of this work.
- **The search box has no debounce today** and will need one added. The minimum query
  length and the result cap are enforced by the route and the database function; the
  debounce is a client-side concern that the existing picker solves with a shared hook.
  Also note the local arm has no minimum length, so a one-character query narrows locally
  and never reaches the fallback — which is intended.
- **A fallback hit can legitimately be club-bearing**, so testing each hit's id against the
  club-bearing set is not a no-op. The search function has a postal-code arm: typing a
  postcode finds its municipality, which no local slug match can reach. Such a hit must
  render as a normal link, reusing the slug from the entry the page already holds.
- **No new message keys are needed.** The existing "no clubs here" status and "no matches"
  empty state already cover both new states; "nothing here yet" in this plan is prose, not
  a copy request. Do not open a translation sweep for this.
- **After this lands, the whole-country municipality read has no callers.** Confirm this
  and delete it along with its now-unused paged-walk usage, rather than leaving a large
  unbounded read available for someone to reach for.
- **`/schools` is deliberately `noindex`** and stays so — it is public but intended to be
  reached by direct link only. Do not treat SEO as a consideration here.
- **A floor of roughly 300 ms cold is expected and acceptable**, because ~107–195 ms of
  it is Vercel lambda init that these routes cannot avoid without going static.

## Steps

1. **Rebuild `/schools/[municipalityName]` with no location read.** Resolve each club's
   location up to its municipality, take the display name and alternates from that embedded
   node, and match the URL slug against the canonical and alternate slugs derived from it.
   Verify behaviour is unchanged for: a club-bearing slug (renders), a real municipality
   with no clubs (404s), a nonsense slug (404s), and a Swedish alternate slug for a
   club-bearing municipality (renders). Move the spoken-languages read into the first
   parallel group while here — it depends on nothing before it and currently waits for no
   reason.
2. **Strip the read from `/schools/[municipalityName]/[id]`** and derive the back link's
   municipality name from the product's embedded location instead (see 1b). The page
   component then does no server data access; its `generateMetadata` still reads the
   product row, which is unchanged and correct. Verify the back link still reads with the
   municipality's name, in a non-default locale as well, and that a product with no
   resolvable municipality falls back to the generic sibling label rather than rendering
   an empty one.
3. **Reverse `/schools`.** Clubs first, derive the club-bearing municipality ids, keyed
   read for their rows-with-chains, filter in memory to Finnish municipality rows, then
   feed the existing entry-building helper. Every entry is now club-bearing, so the
   `hasClubs` flag and the default view's filter over it both become vestigial — remove
   the plumbing rather than leaving a field that is always true. Confirm the region
   grouping and default rendering are unchanged, and that the RSC payload drops.
4. **Add the search fallback arm.** Local instant match over the club-bearing entries; on
   no local match, query the indexed search route scoped to Finland and municipalities,
   with a client-side debounce. Render nothing in the results area until it resolves (see
   Constraints). A hit already in the club-bearing set renders as a normal link reusing
   that entry's slug; anything else renders in the existing "no clubs here" state. A failed
   or empty fallback shows the existing empty state, never an error.
5. **Delete the whole-country municipality read**, which now has no callers. Note this is
   larger than one method: it also removes its unit tests, its entry in the reads
   column-discipline registry, and two DB tests. **One of those DB tests is the only
   coverage anywhere that walks past PostgREST's 1000-row response cap** — the sole proof
   that the paged walk terminates correctly on a large read against a real PostgREST. It
   cannot simply be moved: France's ~34,900 communes are the only over-cap dataset in CI,
   and this is the only walked read that touches them — every other walked read runs over
   fixture-sized data. **So write a small DB test that seeds its own >1000 rows and walks
   them.** That keeps the guarantee without keeping a production read alive purely to be
   tested. (The unit test over a fake transport already covers the walk's logic; what needs
   preserving is the proof that PostgREST truncates the way the walk assumes, which other
   walked reads will rely on as their tables grow.) The paging primitive itself stays;
   other services use it. Separately, there is a second, already-dead slug-resolution helper (the one taking
   raw location rows, referenced by nothing but its own test) — delete that too while here.
6. **Rewrite `src/services/locations/CLAUDE.md`.** This is the doc the work invalidates and
   it is a larger change than the code: it asserts the whole-country municipality read as
   an architectural invariant in roughly seven places — the bounded-lists invariant, the
   retired offer/keyed split's list of offering reads, the "whole-list reads… those two and
   no others" section, the public-directory references, the two-embed-depths rationale, and
   the loading section. Also correct its false claim that the TypeScript fold is already
   gone.
7. **Update the performance log.** The finding covering these routes already carries the
   measurements, the two facts and the rejected alternatives — **move it from Active
   findings to Completed** with before/after numbers rather than rewriting it. Update the
   "what's left" paragraph of the earlier completed entry, which points at it.

## Acceptance criteria

- None of the three `/schools` routes issues a whole-country municipality read; every
  location read they make is bounded by the number of clubs.
- The detail route's back link still carries the municipality's name, resolved in the
  viewer's locale, with no server read behind it.
- Rendered output of both routes is unchanged for every case in step 1, plus: the default
  `/schools` view lists the same regions and municipalities as before, and searching a
  club-bearing municipality returns the same instant result as before.
- Searching a real Finnish municipality with no clubs still finds it and still shows the
  "no clubs here" state; searching a postcode that reaches a club-bearing municipality
  renders it as a working link.
- The `/schools` RSC payload is bounded by the club count, not by Finland.
- A one-character query with no local match still shows the empty state immediately.
- The long-tail search arm folds nothing itself — it asks the index. (The slug helper
  stays; it builds URLs, and the local arm still folds the query. See Constraints.)
- A DB test still proves the paged walk terminates correctly against a real PostgREST on an
  over-cap read, seeding its own rows rather than depending on France's communes.
- Lint, type-check, unit and integration suites, and the translations check all pass. The
  pure entry-building and slug-resolution helpers keep their existing unit coverage.

## Verification

Real-user monitoring cannot verify this before the traffic arrives. Use the controlled
probe that produced the numbers above, so before and after are directly comparable:

1. Leave the route untouched for 25 minutes so lambda and database caches go cold.
2. Request a route that does **no** locations read (any `/shop/[id]`) first — its cold
   TTFB is that run's lambda-init baseline, and it warms nothing that is being measured.
3. Request `/schools` — this is the number.
4. Then warm repeats for the steady state.

Record the result in the performance log's snapshot format. Measure the client payload by
fetching the page and counting bytes. Note that lambda init has been observed to vary
(~107 ms and ~195 ms on two runs), so treat a single run's decomposition as indicative.

**Targets** (projected by analogy with `/shop/[id]`, the same "no heavy fetch" shape,
which measures ~295 ms cold and ~100 ms warm — these are inference, not measurement):
cold TTFB ~350–450 ms, warm ~120–150 ms, server fetch ~5 KB, client payload ~2 KB.

A burst test — many concurrent cold requests, to check the launch knee — requires
deliberately loading production and must be agreed with the owner first.
