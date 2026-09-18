# Should the logic move out of the database? An evaluation, and why the answer was no

**Record, frozen 2026-09-18.** Every count here was taken from the schema snapshot, the
DB test suite's authorization spine and `src/` on that date, and will drift. The standing
rules this produced live in `supabase/CLAUDE.md` ("Logic lives in database functions on
purpose"); this file is the evidence behind them, kept so the question is not
re-investigated from the same starting point.

## The question

Roughly one migration in five did nothing but replace a function body (about 52 of 257;
168 of 257 defined or replaced a function at all). Replacing a function is a whole-body
overwrite, so it is the one kind of schema change two parallel branches cannot merge: on
2026-09-18 two branches each rewrote one function from the body that predated the other,
and the later silently dropped the earlier's field. With many agents working in parallel
worktrees, the proposal was to move business logic, reads first, into the TypeScript
service layer, where git merges line by line and the compiler and unit tests run locally.

## Two assumptions the proposal rested on, both wrong

1. **"The server is always in the middle."** It is not, for reads. The service layer's
   read methods run in the browser: 33 React Query hook files construct services with the
   browser client, holding 122 plain table queries and most of the read RPC calls. Only
   two pages preload on the server. Writes are the part that goes through the server (72
   API routes). A direct Postgres connection can only exist on a server, so "move a read
   to TypeScript" really meant "stop the browser reading the database, and route that read
   through a new server endpoint".
2. **"The big read functions are page assembly that drifted into the database."** They
   are access boundaries. See the classification below.

## The census

134 functions in `public`: 50 reads (22 called by the app, 28 predicates, guards and
helpers that only policies or other functions use), 60 writes, 16 trigger functions, and 8
catalog helpers the DB tests use.

**The 21 app-called reads that are not policy predicates, judged on one question: could
the intended caller read the same rows through the existing grants and RLS?**

| Verdict | Count | |
|---|---|---|
| Yes | 5 | The admin dashboard, a parent's own gamers, the location search (already `SECURITY INVOKER`), and the two own-row PIN checks. Only the dashboard is substantial. |
| Partly | 4 | Blocked by one table, two aggregate columns, or one calling role. |
| No | 12 | The function exists to cross a boundary. |

**Six recurring boundaries account for every "no" and "partly"**, and two do most of it:

1. Five staff tables (sessions, attendance, session photos, per-child staff notes, a
   child's creations) carry no `authenticated` grant and no policies at all. Nine
   functions read them.
2. A gedu has no row-level access to any family-side table: participations, profiles,
   gamer profiles, the parent-child link, the game accounts. Six functions give a gedu
   their own roster and nothing else.
3. Cross-family aggregates: a waitlist position and a seat count are counts of rows the
   caller must never see. No policy can express them.
4. A family cannot read staff-owned rows; the family feed hands over a gedu's first name
   and nothing more.
5. Role-asymmetric gaps inside family tables (a gamer cannot read the family
   subscription, or a parent's profile).
6. A credential read across accounts (a child's account switch verifying a parent's
   PIN), which is service-role-only by design and should stay so.

**The 60 writes:** 16 are service-role-only engines (the participation state machine, the
webhook and auth-admin paths); 19 are exposed writes that lock rows or must be atomic
across tables; 23 are single-table writes to a grant-locked table, where a function is
the only write path; 16 plus 8 are triggers and test infrastructure. **Two** writes, the
staff-side edits of a child's two game accounts, were the only ones whose authorization
RLS could plausibly express.

**Churn.** Among the most-rewritten read functions, the ones that could move as they stood
accounted for 11 of 78 rewrites (14%); unlocking one staff table brought it to 28 (36%).
The rest sat behind the gedu-to-family boundary.

## The three designs considered

- **A server-side direct connection that runs each transaction as the signed-in user**, so
  existing grants and RLS apply unchanged. Safe, and the trust model does not move, but it
  can only take over reads RLS already admits: 5 of 21, one of them substantial. Several
  helpers those bodies call are service-role-only precisely because they read across
  families, so even the movable ones needed reimplementation. Not worth a second data
  access stack.
- **Widen RLS until the reads fit.** Additive and expressible for the two big boundaries,
  and it is the wrong trade: a policy publishes the raw table, every column, to that
  role's browser through the Data API, where the function returned a narrowed slice. For
  a gedu session it would turn "my roster, these fields" into "every family-side row my
  policy admits". Most of these tables hold children's data.
- **A privileged server connection with authorization in TypeScript.** The mainstream web
  backend shape. Here it means a second authorization regime beside the verified spine,
  every browser read re-routed through a server route (each one a posture-registry entry,
  an integration test and a Vercel invocation where today there is none), and the proof
  of scope for each function leaving the DB test suite. It replaces a system built after
  the 2026-03 audit, and mechanically verified since, with an unproven one, to save
  migrations.

## What was done instead

- The conflict class is handled where it occurs: current schema becomes one generated
  file per object, so two branches changing one function collide in git or fail CI's
  comparison (the migrations plan of the same date).
- The slow feedback loop on `plpgsql`, the strongest argument for TypeScript, is a
  property of having no local database, not of the language. A local Supabase stack
  removes it.
- Churn is cut at its source by a convention: a read function returns the whole of what
  its caller may see, entity-shaped, and the page shaping moves to TypeScript, so a new UI
  field stops being a migration. Applied as functions are next touched.

## What would justify reopening this

A change in the premise, not in the count of functions: reads no longer browser-direct
(for instance a deliberate move to server-rendered data access for unrelated reasons), a
second client that cannot use the Data API, or the spine itself being replaced.

## Loose ends noticed and left alone

One pure helper function appeared to be referenced nowhere; the subscription-price catalog
grants `SELECT` to `anon` but not to `authenticated`; the largest write RPC already runs
as its caller under RLS, which is the user-bound model in production where it fits.
