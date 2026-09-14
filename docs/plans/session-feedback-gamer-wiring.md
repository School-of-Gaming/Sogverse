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
write per child per session, one read per child per screen. Nothing here is hot.

## The decision

**One row per child, per group, per session window, written by one self-scoping RPC, read
back by the child through RLS for prefill. The questions live in code, never in the
schema.**

### Storage

A table, `session_feedback`, with:

- `group_id` → `product_groups`, `participant_id` → `profiles` (the gamer), and
  `session_opens_at timestamptz` — the instant the session window opened, which is the same
  triple in-call chat is keyed by and the same value the voice token response already hands
  the client. This is the join key the investigation requires: a session's readings from
  every audience must be joinable, and this row never depends on a session row existing.
- `answers jsonb` — an object of item key → level 1–5, only the answered items. Item keys
  are the catalogue's stable identifiers (`learned`, `fun`, …) as text. **No Postgres enum,
  no check constraint listing the keys**: adding or removing a question is an edit to the
  typed catalogue in `src/components/voice/feedback/` plus message strings, with no
  migration. The RPC validates shape only — an object, each key a short identifier, each
  value an integer 1–5, a bounded number of entries — and a later reader ignores keys the
  catalogue no longer holds.
- `note text` — the free-text note, empty string when none, bounded in length.
- `exit text` — `left` (the Leave button) or `ended` (Daily closed the room), so a rating
  given after an abnormal end can later be read differently from one given after the
  session finished. The page already knows which path it is on.
- `created_at`, `updated_at`; unique on `(group_id, participant_id, session_opens_at)`.
- Both foreign keys cascade on delete, so a family closing its account takes its child's
  feedback with it, which is what the privacy page promises about retention.
- RLS enabled. `authenticated` may SELECT only rows where `participant_id = auth.uid()`.
  No INSERT, UPDATE or DELETE grant to `authenticated` at all: writes go through the RPC,
  so the table never needs a write-IDOR case and the row cannot be written except by the
  function that checks membership and the window. Grants are explicit per role; nothing to
  `anon`.

### The write

One RPC, `save_session_feedback(p_group_id, p_session_opens_at, p_answers, p_note, p_exit)`,
`SECURITY DEFINER`, granted to `authenticated` only, `REVOKE … FROM PUBLIC`, classified in
the DB test suite's authorization spine as **self-scoping**: every write is keyed to
`auth.uid()`, and its scope test proves a second gamer cannot write, overwrite or delete
the first gamer's row. The body, in order:

1. The caller holds an active participation in `p_group_id`. Otherwise raise.
2. `p_session_opens_at` is the open instant of a real window of that group's product
   schedule, and that window opened within the last day. The session-window derivation
   already exists server-side for the group session tables; reuse it rather than writing a
   second one. Otherwise raise. This is what stops a gamer stamping feedback onto a session
   that never happened.
3. `p_answers` passes the shape validation above and `p_note` the length bound.
4. **Nothing answered and an empty note means no feedback.** If the object is empty and
   the note blank, delete the caller's row for that key if one exists and return. A child
   who clears every bar and presses Done has withdrawn their feedback, not submitted an
   empty one. The response rate's denominator is the sessions themselves, not a shown-count,
   so no row is written merely because the screen appeared.
5. Otherwise upsert: insert, or update `answers`, `note`, `exit`, `updated_at` on the
   unique key. **The last Done wins.** A child who drops out, rejoins and leaves again
   answers once more with their earlier answers already in place, and whatever they press
   Done on is the record.

The client calls the RPC directly through the browser Supabase client, as in-call chat
writes do. There is no API route, so nothing joins the route posture registry.

### The read, for prefill

When a gamer is about to see the screen, the page reads their own row for
`(group, sessionOpensAt)` through RLS — a single indexed row by primary key shape, the
loading rule's near-instant category — and mounts the screen with those answers and note
as its initial state. The read happens before the screen renders: on the Leave path it
runs alongside the room disconnect that already shows a spinner, and on the ended path it
runs when the ended state fires and the screen appears when it resolves. The screen itself
gains an `initial` prop and nothing else; a missing row is an empty form exactly as today.

### The page

`Done` calls the RPC with the answers, the note, the exit reason and the `sessionOpensAt`
the room already holds, then performs the same full-page navigation it performs today.
The committing flag is set before the call and never cleared on the success path, per the
app-wide loading rule; on a failed write it is cleared, the screen stays, a status line
says the answers were not saved, and Done is enabled again for a retry. A child is never
navigated away from a form that did not save, and never trapped on one that did.

## Rejected alternatives

- **A row per answer (child, session, item key, level) instead of one row with a JSON
  object.** Same flexibility, five times the rows and an upsert that is really a
  delete-and-insert of a set. The object is the natural unit here because the screen
  submits all answers at once and reads them back at once; a reporting query can unnest
  it. Revisit only if per-item indexing is ever needed.
- **A column per question.** Every added or removed question becomes a migration and a
  type regeneration, which is exactly the friction the owner ruled out.
- **A Postgres enum or check constraint enumerating the item keys.** Same objection. The
  shape check in the RPC is the loud failure at the boundary; a key the catalogue does not
  know is harmless to store and ignored on read.
- **An API route that validates the keys against the code catalogue before writing.** It
  buys a guarantee nobody needs — a tampering gamer can at most store a nonsense key
  against their own name — at the cost of a route, its posture entry and a second layer
  over the RPC. Chat writes through RLS from the browser for the same reason.
- **Direct table writes under RLS instead of an RPC.** The window check ("this session
  really opened, recently") cannot be expressed as a row policy without a second copy of
  the schedule derivation; the RPC holds it once. A write grant on the table would also
  pull it into the write-IDOR suite for no gain.
- **Writing a row when the screen is shown, for a response-rate denominator.** The owner
  ruled that Done with nothing answered saves nothing and that sessions are the
  denominator. Attendance is already recorded per child per session, so the denominator
  exists without a write.
- **Recording that a session's feedback was read, or notifying anyone.** No reader exists
  yet, and nothing proactive was wanted. Both are follow-ups.

## Steps

1. **Migration.** The table, its constraints, indexes (the unique key; `participant_id`),
   RLS with the SELECT-own policy, explicit grants (`SELECT` to `authenticated`, table
   access to `service_role` for the readers that come later), the RPC with its guard,
   window check, shape validation, delete-on-empty and upsert, `REVOKE … FROM PUBLIC`,
   `GRANT EXECUTE … TO authenticated`. Model the boilerplate on the highest-numbered
   migrations and verify the version number against remote history at push time
   (`supabase/CLAUDE.md`).
2. **Push and regenerate types**, then add the table's row alias to `src/types/index.ts`.
3. **Service.** A service module beside the voice services with two functions — save (the
   RPC call) and read-own (the RLS select) — and the React Query hooks the page uses,
   following the service layer pattern in `src/CLAUDE.md`. The screen's result type is
   already the RPC's argument shape.
4. **Page wiring.** In the voice session page: read the existing row before the screen
   renders on both paths; pass it as the screen's initial state; on Done, save with the
   exit reason and navigate on success, or stay with a status line and a re-enabled Done on
   failure. Remove the no-op comment that marks the seam.
5. **Screen.** Accept `initial` answers and note; everything else unchanged.
6. **Tests.** DB (CI only): the spine entry naming the scope test; the scope test itself
   (own row written and read; another gamer's write refused; a non-member refused; a
   `sessionOpensAt` matching no window refused; empty submission deletes; second submission
   overwrites); the access-control sweep passes with the new table. Unit: the screen
   renders its initial state; the page passes the read result through, calls save with the
   right exit reason on each path, navigates on success and stays on failure.
7. **Docs.** Update the session feedback section of `src/components/voice/CLAUDE.md`: the
   save is real, where it goes, the prefill, the empty-means-withdrawn rule, and the
   last-Done-wins rule. Then delete this plan.

## Acceptance criteria

- A gamer who answers and presses Done has one row for that group and window; leaving
  again in the same window shows those answers prefilled, and a second Done replaces them.
- Done with every bar empty and no note writes nothing, and removes a row if one existed.
- A gamer cannot write or read another gamer's row; a non-member cannot write to a group;
  a made-up `sessionOpensAt` is refused. All proven in the DB suite.
- The exit reason distinguishes Leave from the room closing.
- A failed save leaves the child on the screen with a message and a working Done.
- Adding or removing a statement in the catalogue needs no migration and no type
  regeneration.
- Gedus, admins and parents leave a room exactly as before; the error path is untouched.
- Lint, type-check, unit tests and CI's DB tests pass; `check-translations` passes if any
  string was added.

## Constraints discovered while deciding

- The session row is lazily materialised, so feedback must not be the first writer to
  want one; keying by `(group, participant, session_opens_at)` avoids it entirely, and it
  is how chat already solved the same problem.
- The ended path fires on any post-join disconnect, not only the window closing, so
  `exit = ended` includes network drops. Recording the reason is what lets a reader
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
  category the child provides. Not a gate for building; the owner decides whether it ships
  before or after the feature.

## Follow-ups (cut from this plan; proposed to the owner when the plan is deleted)

- Reading views: the Gedu's group workspace showing each child's answers and note for a
  session; an admin view per group session; per-theme trends over a term with the session
  items and the standing items shown as two groups.
- Anything proactive: a Slack post when a note arrives, a visible marker on a low answer
  to either Gedu item.
- A visible label above the note field, since the question currently lives only in the
  placeholder.
- The in-person gamer half, the parent leg and the Gedu leg, which remain in the
  investigation.
- A retention period shorter than the account's lifetime, if one is ever wanted.
