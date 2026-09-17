# The partner API

`/api/partner/v1/*` is a read-only API published to one outside partner, Lynx Educate,
for the Roblox Programme. It is a **skeleton**: every documented resource exists,
authenticates its caller and validates its query, and answers the documented shape with
no records. Lynx integrates against auth and parsing now; each resource is filled in
behind the same contract later.

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
`invalid_query`); the message is English for a log, never for display.

**Rule: every handler starts with `requirePartnerKey()` from `src/lib/api/`.** One issued
bearer token is both the partner's identity and the whole of its scope, compared in
constant time; a per-route copy is how one of them ends up comparing with `===`. Auth
precedes validation, so a caller without the key cannot probe the input handling. A
missing key on our side is a 500 and never a 401 — the caller did nothing wrong.

**Rule: both directions of every resource are zod schemas in the partner contracts
module under `src/services/partner/`** — the query schema a route parses with, and the
response schema it validates what it returns against. Filling in a resource means
replacing an empty payload, never relaxing a schema: the empty answers are typed against
the same contract the real records will have to satisfy. Enum values come from the
generated `Constants` wherever the vocabulary is the database's, and the tuples that are
the API's own invention say so in a comment.

**Rule: an empty answer is a well-formed answer.** A record-returning resource answers
`{ "data": [], "next_cursor": null }` — a last page, not an error and not a 501 — and an
aggregate answers with its empty list and the range it covers. Every partner pull is a
full pull that treats a record's absence as "no longer in scope", so a resource must never
fake a record and must never answer 200 with a shape the page does not describe.

What the skeleton deliberately does not do, and what an implementation owes: no database
reads, no Vercel Web Analytics call and no caching behind it, no rate limiting (so no 429
and no `Retry-After`), no cursor logic beyond accepting the parameter, and no 404 in the
documented envelope — an unknown path under this prefix gets the framework's HTML 404
today, where the page promises the same `{ error: { code, message } }` as everything
else. Each is documented on the page, so each is a promise outstanding rather than a
decision made here.
