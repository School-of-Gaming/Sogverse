# Session feedback: save what a gamer answers when leaving an online session

**Status: decided 14 September 2026, ready to build.** The screen exists and is live for
gamers on the voice-room leave and session-ended paths (`src/components/voice/feedback/`,
rules in `src/components/voice/CLAUDE.md`); its Done currently discards the answers and
navigates. This plan gives it a place to save to, and nothing else. Reading the answers
back — a Gedu view, an admin view, trends — is deliberately later work.

## Problem

A gamer leaving an online session is asked five statements and offered a note, and the
answers are thrown away. Every session that runs before the save exists is a session whose
readings are lost, and a child who writes a note into a box that keeps nothing is the
outcome the investigation named as worse than not asking. The investigation that produced
the instrument is `docs/investigations/session-feedback.md`; the decided online gamer leg
has left it and lives here.

## Scale

Small and steady. Production runs about 60 online sessions a month with roughly 430
present gamer-seats per quarter, so the table grows by a few hundred rows a month. One
write per child per session, one read per child per join. Nothing here is hot.

## The decision

**One row per child, per group, per session window, written and read by the child through
RLS — no function, no route. The questions live in code, never in the schema.**

### Storage

A table, `session_feedback` — distinct from the existing `feedback_submissions`, which is
the help card's free-text box; the table comment says so, since the two names will sit
side by side forever. Columns:

- `group_id` → `product_groups`, `participant_id` → `profiles` (the gamer), and
  `session_opens_at timestamptz` — the instant the session window opened, which is the same
  triple in-call chat is keyed by and the same value the voice token response already hands
  the client. This is the join key the investigation requires: a session's readings from
  every audience must be joinable, and this row never depends on a session row existing.
  **The instant is client-asserted, and the column comment says so.** Chat's column of the
  same name is server-derived because it bounds what a family may read; this one bounds
  nothing, and a forged value can only mis-key the forger's own row. Two columns with one
  name and opposite trust must be told apart at the column, not from memory.
- `answers jsonb NOT NULL DEFAULT '{}'` — an object of item key → level, only the answered
  items; `{}` is a legal stored value. Item keys are the catalogue's stable identifiers
  (`learned`, `fun`, …) as text. **No Postgres enum, no check constraint listing the
  keys**: adding or removing a question is an edit to the typed catalogue in
  `src/components/voice/feedback/` plus message strings, with no migration. A check
  constraint bounds the shape: a JSON object, at most 32 entries, every value an integer
  from 1 to 5. Keys are unconstrained; a later reader ignores keys the catalogue no
  longer holds.
- `note text NOT NULL DEFAULT ''` — the free-text note, checked to at most 2000
  characters. The same two numbers (32, 2000) live as constants beside the catalogue so
  the client does not re-measure them differently; the constraint owns the cap, as the
  chat body's does.
- `exit_reason text` — `left` (the Leave button) or `ended` (Daily closed the room),
  constrained to those two values. Kept because it is only knowable at write time; the page
  already knows which path it is on, and a later reader could not reconstruct it.
- `created_at`, `updated_at` with the repo's usual before-update trigger; unique on
  `(group_id, participant_id, session_opens_at)`, which is also the only index: the child's
  prefill read and the upsert both go through it.
- Both foreign keys cascade on delete, so a family closing its account takes its child's
  feedback with it, which is what the privacy page promises about retention.
- RLS enabled, with policies that authorise both the actor and the target:
  `participant_id = auth.uid()` **and** the caller holds an **active participation** in
  `group_id` — the seat check the voice token route makes, not the broader voice-room
  membership predicate, which would let an admin or a Gedu write a row for themselves.
  SELECT, INSERT and UPDATE for `authenticated` under that predicate, the UPDATE policy
  carrying it in both `USING` and `WITH CHECK` so a row cannot be re-keyed to another
  group or child; no DELETE. Grants are explicit per role — the three privileges to
  `authenticated`, `ALL` to `service_role` as the chat tables grant it, for the readers
  that come later — and nothing to `anon`. The write grant puts the table in the DB
  suite's write-IDOR cases, which is the standard posture for a table a user writes to.

### The write

On Done, the client upserts its row on the unique key through the browser Supabase client,
as in-call chat writes do: answers, note, exit reason, and `session_opens_at` from the
token response the room already holds. **The last Done wins.** A child who drops out,
rejoins and leaves again answers once more with their earlier answers already in place,
and whatever they press Done on is the record — including an emptied one, which is an
update with an empty object and an empty note, never a delete.

**Nothing on screen and nothing loaded means no write.** A first-time Done with every bar
empty and no note navigates without touching the database. The response rate's denominator
is the sessions themselves, so no row exists merely because the screen appeared. The rule
is one client-side condition: skip the write only when the form is empty **and** the
prefill read succeeded with no row; in every other state — something on screen, a row
loaded, the read failed or never ran — write. An unknown prefill state must not leave a
stale row in place behind a child who cleared it.

There is no API route, so nothing joins the route posture registry.

### The read, for prefill

When a gamer joins the room, the page reads their own row for `(group, sessionOpensAt)`
through RLS — one row by its unique key, the loading rule's near-instant category — and
keeps it in the page's React Query cache under the feature's own key family. The query is
enabled only for a viewer the page asks (`askForFeedback`) and only once the window
instant is in state. A missing row reads as `null`; a read error is treated as no row, so
a failed read never keeps a child from the screen. Both exit paths then mount the screen
with those answers and note as its initial state, with no round trip at the moment of
leaving; the ended path in particular fires on any post-join disconnect, often a failed
network, and must not wait on a fresh read right then. The screen gains one optional
`initial` prop — the answered keys and the note, as stored — read once as seed state; a
read that resolves after the screen mounted does not re-seed it, because whatever the
child has already tapped wins. A missing row is an empty form exactly as today.

The `answers` column comes back as untyped JSON. It is parsed through a zod schema in the
feature's contracts file, per the `src/CLAUDE.md` rule for JSON-shaped reads, and that
parse is where keys the catalogue no longer holds are dropped and values narrowed to the
level type. No invalidation is needed after the save: the success path unloads the document.

### The page

`Done` writes as above, then performs the same full-page navigation it performs today.
The page holds the window instant from the token response in state (today it is consumed
inline where the token resolves). The screen's `onDone` stays synchronous and
fire-and-forget; the page owns the promise. One committing flag: set before the call and
never cleared on the success path, per the app-wide loading rule, and it is what stops a
second Done while the first write is in flight; on a failed write it is cleared, the
screen stays, a status line says the answers were not saved, and Done is enabled again
for a plain retry of the same write. The screen renders that line from an optional status
prop above Done, using the app's status line component, with the copy in all five
locales. A child is never navigated away from a form that did not save, and never trapped
on one that did. The screen cannot mount without the instant: a failed token fetch renders
the error card and never asks.

## Rejected alternatives

- **A self-scoping RPC that validates the session window server-side.** The first draft
  wrote one, and the design challenge took it apart. The only server-side window
  derivation is keyed by date, returns one slot per weekday and reads the current
  schedule, so it would refuse legitimate feedback on a product with two slots on one day
  and after any schedule edit, and it does not include the join margin the open instant
  carries. Chat validates its window because a family read bound depends on it; a
  feedback row's key bounds nothing, so the check would have guarded against a gamer
  mis-keying their own row at the cost of a function, a spine entry, a validator in
  PL/pgSQL and a third copy of the schedule arithmetic. A guard, if ever wanted, derives
  from the group alone with a closed-recently tolerance and drops the parameter; it never
  validates a caller-supplied instant.
- **Deleting the row when Done arrives empty.** Considered as "withdrawal"; rejected by the
  owner as an edge case not worth a destructive path. An emptied form over an existing row
  is an ordinary update.
- **A row per answer (child, session, item key, level) instead of one row with a JSON
  object.** Same flexibility, five times the rows and an upsert that is really a
  delete-and-insert of a set. The object is the natural unit here because the screen
  submits all answers at once and reads them back at once; a reporting query can unnest
  it. Revisit only if per-item indexing is ever needed.
- **A column per question.** Every added or removed question becomes a migration and a
  type regeneration, which is exactly the friction the owner ruled out.
- **A Postgres enum or check constraint enumerating the item keys.** Same objection. The
  shape checks are the loud failure at the boundary; a key the catalogue does not know is
  harmless to store and ignored on read.
- **An API route that validates the keys against the code catalogue before writing.** It
  buys a guarantee nobody needs — a tampering gamer can at most store a nonsense key
  against their own name — at the cost of a route, its posture entry and a second layer.
- **Writing a row when the screen is shown, for a response-rate denominator.** The owner
  ruled that Done with nothing answered saves nothing and that sessions are the
  denominator. Attendance is already recorded per child per session.
- **Recording that a session's feedback was read, or notifying anyone.** No reader exists
  yet, and nothing proactive was wanted. Both are follow-ups.

## Steps

1. **Migration.** The table, its check constraints, the unique key, the `updated_at`
   trigger, RLS with the actor-and-seat policies for SELECT, INSERT and UPDATE, explicit
   grants per role, and the two column comments (the table's purpose against
   `feedback_submissions`; `session_opens_at` as client-asserted). Model the boilerplate
   on the highest-numbered migrations and verify the version number against remote history
   at push time (`supabase/CLAUDE.md`). No function is created.
2. **Push and regenerate types**, then add the table's row alias to `src/types/index.ts`
   (name it so it cannot be confused with the screen's own `SessionFeedback*` types).
3. **Service.** A new feature directory under `src/services/` for session feedback, with
   its service (read-own by the unique key, `maybeSingle`; save as an upsert on it, taking
   the screen's result type and stripping unanswered keys), its contracts file with the
   zod schema for the read, its query keys, and the React Query hooks the page uses,
   following the service layer pattern in `src/CLAUDE.md`.
4. **Page wiring.** Hold the window instant in page state; issue the read once the token
   resolves, gated as above; pass the result as the screen's initial state on both paths;
   on Done, apply the write-or-skip rule, save with the exit reason, navigate on success,
   or stay with the status line and a re-enabled Done on failure. Replace the doc block on
   the Done handler that describes the seam with a description of the save.
5. **Screen.** Accept `initial` and the optional status prop; everything else unchanged.
6. **Tests.** DB (CI only): the access-control sweep passes with the new table; a second
   gamer joins the write-IDOR attacker list and the UPDATE case proves their statement
   affects nothing; the feature's own scope test covers what that file's header keeps out
   of the IDOR loop — a second gamer's insert refused, a non-member's insert refused, a
   member reading only their own row, `{}` accepted, a value of 9 refused. Fixtures are
   built through the existing product helpers; `seed.sql` has no groups or seats. Unit:
   the screen renders its initial state and its status line; the page test keeps mocking
   the service modules as it does today (no query provider), and asserts the read is
   issued only for an asked viewer with the instant in state, the result passes through,
   the write-or-skip rule, the right exit reason on each path, navigation on success and
   staying on failure.
7. **Docs.** In the session feedback section of `src/components/voice/CLAUDE.md`, delete
   the rule that saving is a no-op and write what is now true: where the row goes, the
   prefill on join, write-or-skip, last Done wins; reword the presentational rule so it
   says the screen is handed an initial state and reports one result, and still does not
   know whether either is stored. Nothing changes in the root docs index. Then delete this
   plan.

## Acceptance criteria

- A gamer who answers and presses Done has one row for that group and window; leaving
  again in the same window shows those answers prefilled, and a second Done replaces them.
- A first-time Done with every bar empty and no note writes nothing.
- A gamer cannot write or read another gamer's row, and a non-member cannot write to a
  group. Proven in the DB suite.
- The exit reason distinguishes Leave from the room closing.
- A failed save leaves the child on the screen with a message and a working Done.
- Adding or removing a statement in the catalogue needs no migration and no type
  regeneration.
- Gedus, admins and parents leave a room exactly as before; the error path is untouched.
- Lint, type-check, unit tests and CI's DB tests pass; `check-translations` passes for the
  status-line copy.

## Constraints discovered while deciding

- The session row is lazily materialised, so feedback must not be the first writer to
  want one; keying by `(group, participant, session_opens_at)` avoids it entirely, and it
  is how chat already solved the same problem.
- The window instant is derived from the schedule at token mint, so a re-mint in the same
  window yields the same value. A schedule edit during a live session could yield a
  different instant on rejoin and so a second row for one session; chat accepts the same
  edge and so does this.
- The ended path fires on any post-join disconnect, not only the window closing, so
  `exit_reason = ended` includes network drops. Recording the reason is what lets a reader
  separate them later; deciding how to read them is not this plan's job.
- Under the current switch-only sign-in, a gamer's answer may have been given with a
  parent beside them. Nothing here changes that; the sign-in mode in force is not stored,
  since the family's sign-in choice is on the gamer profile and can be joined at read time.
- The privacy page enumerates what is held about a child and does not mention anything the
  child writes; its purposes cover "make it better over time" and its retention is the
  account's lifetime, which the cascade honours.

## Owner decisions

- **Privacy page wording.** The owner prefers not to touch legal text. The recommendation
  on record is one bullet under "The information we collect" naming session feedback (a
  few ratings and an optional short note, read by the child's Gedu and the School of Gaming
  team), because the page promises to list what is held about a child and this is a new
  category the child provides. Not a gate: build without touching it and flag it again at
  completion.

## Follow-ups (cut from this plan; proposed to the owner when the plan is deleted)

- Reading views: the Gedu's group workspace showing each child's answers and note for a
  session; an admin view per group session; per-theme trends over a term with the session
  items and the standing items shown as two groups. A per-child index arrives with them.
- Anything proactive: a Slack post when a note arrives, a visible marker on a low answer
  to either Gedu item.
- A visible label above the note field, since the question currently lives only in the
  placeholder.
- The in-person gamer half, the parent leg and the Gedu leg, which remain in the
  investigation.
- A retention period shorter than the account's lifetime, if one is ever wanted.
