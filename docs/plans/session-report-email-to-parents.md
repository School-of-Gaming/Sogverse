# A gedu emails a session report to the group's parents

## Problem

A gedu writes a session report after every session, and a family can read it on their
child's product page in My SOG. Nothing tells the family it is there. A parent who does not
think to open the page that evening never sees the write-up their child's gedu spent twenty
minutes on, and the report — the main thing a family gets back from us between payments —
goes unread.

The email itself already exists: `src/lib/email-templates/session-report.ts` renders a
report's markdown into the transactional shell, and it is reachable from the admin email
testing tool, where its layout was iterated and signed off. What is missing is the wiring:
a way for the gedu to send it, the record that it was sent, and the rule that a session is
not finished until it has been.

## Scale

Every consumer and municipality club, camp and event. Production has on the order of a few
dozen active groups, each with roughly five to ten active participations, meeting weekly
(clubs) or daily (camps). One send per session per group, fanning out to one mail per
participation, so on the order of a few hundred family mails a week at today's size — well
within Brevo's transactional limits and far below anything that needs batching.

## The decision

**A "Send to parents" action on the gedu's past-session card; one mail per active
participation; sent at most once per session, recorded on the session row; and "emailed the
parents" becomes the third thing a session owes, beside attendance and the report.**

In detail:

1. **Where.** On the gedu session card (the gedu workspace feed, under
   `src/components/gedu/session-feed/`), for a *past* session that has a *saved* report and
   has not yet been emailed, the report block shows a button: **Send to parents**. Pressing it
   opens a confirm dialog stating how many mails it will send, counted in participants
   ("Email this report to the families of 6 participants?") — the same unit the route's
   result uses, so the dialog and the result line agree; confirming sends. While sending,
   the button is disabled and shows progress (the committing pattern — the flag flips
   before the mutation runs, so there is no frame in which a second click lands). On
   success the button is replaced by a sent line — a check icon, "Sent to parents", and the
   time it was sent — which stays for good; it is rendered from the session row, so it
   survives reload, another tab and another assigned gedu. If some sends failed, the
   counts from the response are shown inline beside it **once** — they are not stored, so
   they do not survive a refetch and must not pretend to. On failure the button re-enables
   with an inline error, and the gedu may try again.

   A session whose report is unsaved, or which is upcoming or live, shows no button. The
   button is not shown to anyone but the assigned gedu, because only the gedu feed renders
   the card. There is **no** special case for a roster nobody can be mailed: the button
   shows, the dialog says "0 participants", and a confirmed send claims the session, mails
   no family, and sends the staff copy — which is how staff learn that a group has seats
   with no contact. (The state is practically unreachable — see Constraints — and hiding
   the button would leave such a session "needs attention" forever with nothing to do.)

   **Ownership.** The feed is presentational (it is what the preview scene renders), so the
   send arrives at the card as a callback from the page that owns the data, exactly as
   saving an entry does, and the committing flag lives beside the existing per-entry
   committing state in the feed. The dialog's count comes from the feed's roster: the
   feed's gamer type gains a `hasContact` flag, set by the page from the roster RPC's two
   contact fields (this widens a type that was kept to id and name by a documented "accepted
   for now" decision; the count is what makes it worth it).

2. **Once, and recorded.** Two new columns on `group_sessions`: `report_emailed_at
   timestamptz` and `report_emailed_by uuid` (profiles, on delete set null). A new
   SECURITY DEFINER RPC, role-gated to the assigned gedu in the exact shape of the existing
   session-notes RPC (assert the `gedu` role first, then the group-assignment predicate),
   **claims** the send: it refuses if the session has no report — "no report" meaning the
   same whitespace-trimmed emptiness the summaries SQL and the client's report check
   already use, not merely `IS NULL` — or is already emailed, each refusal raised with its
   own SQLSTATE so the route can tell them apart by code rather than by message (the
   notes RPC's `check_violation` for an unscheduled date is the precedent); otherwise it
   stamps both columns and returns the session row. The API route calls the claim *before*
   sending anything. Two gedus — or one gedu with two tabs — cannot both send,
   because the claim is a single `UPDATE … WHERE report_emailed_at IS NULL` and only one of
   them changes a row. This is the "signal a replay can be told apart by" that the email
   rules demand, and it comes from the write that commits the outcome, not from the
   presence of the row.

3. **Who gets it.** Every *active* participation in the group, resolved **exactly** the way
   the gedu roster RPC resolves it today, so the dialog's count and the route's sends
   agree: a self seat — the participant is the paying customer (`participant_id =
   customer_id`, no further test) — goes to the participant's own email; otherwise the
   seat goes to the linked parent's email (the earliest-linked parent where there are
   several). A seat with neither is skipped and counted. One mail per participation — a parent
   with two children in the same group gets two mails, each about one child, each linking
   that child's page — because the family product page is keyed by participation (two
   siblings in one club have two pages), so the per-child mail is the one whose link is
   unambiguous.

4. **What each mail carries.** The existing builder's parameters, resolved per recipient:
   the child's first name; the gedu's first name (the sender, not the row's last editor); the
   product's name **in the recipient's locale** (the translation for `profiles.locale`, or
   the default locale's when the profile has none); the group name; the session's date and
   time range formatted for the recipient's locale **in the product's timezone, with the
   zone always named** ("16:30 – 18:00 GMT+3", "16.30–18.00 UTC+3") — see Constraints: the
   viewer's zone is a browser cookie the server cannot see, and the family page labels the
   zone whenever it differs from the product's, so naming it is what keeps the mail and the
   page it links to from contradicting each other; the report markdown exactly as stored;
   and the link to *that participation's* product page in My SOG, built from the trusted
   request origin and the **customer** enrollment route helper (`/parent/…`, for both seat
   kinds — every recipient is an adult; the gamer-root variant is for the child's own
   login).

5. **Headers.** From the standard sender. **Reply-To the support inbox** — a parent replying
   has a question for us, not for the unattended sending address; the mail is family-facing
   product mail, which is exactly the case the default covers. The family mails carry **no
   CC and no BCC**: a parent's mail is theirs alone.

6. **The staff copy.** After the family mails, **one** further mail per send: **To the
   sending gedu, CC every admin**, so the gedu has a record of what went out and admins can
   see reports reaching families — without receiving one copy per family. It is the same
   template rendered once more, in the gedu's locale (profile locale, else the default):
   the group's name takes the child's slot in the intro ("here's Marianne's report from
   Usvalaakso: Kettukallio's Minecraft session"), the link is the gedu workspace's page for
   the *product* (the gedu routes are keyed by product, not group — the page finds the
   gedu's group itself), the facts and the report are identical. Reply-To the support
   inbox, as on every product send. It is sent only when the claim stands (at least one
   family mail went out); its own failure is logged and does not release the claim or
   change the gedu's sent line — the families are the outcome, the copy is the record.

7. **Outcome.** The route sends the family mails concurrently, waits for all of them to
   settle, and tallies — a group is a handful of seats, so this is one Brevo round trip
   of wall time rather than N, which keeps the route well inside any function time limit;
   a timeout mid-fan-out would otherwise leave a claimed session with families unmailed
   and nothing reported. If *every* send fails, the claim is released (the stamp cleared, guarded on the value it was set to),
   no copy is sent, and the route answers with an error — the gedu sees it and can retry,
   and nobody received anything. If *some* sends fail, the claim stands — the families who
   got the mail must not get it twice — the copy is sent, the route answers success with
   counts (sent, failed, skipped), failures are logged with the session and participation
   ids, and the card shows the counts once from the response. A send the user explicitly asked for is
   the outcome, so its failure is reported, never swallowed (the opposite of the follow-on
   mails, which swallow by rule).

8. **Completeness.** A past session that is **owed** (on or after the recording epoch the
   feed already enforces) is **complete** when every current roster member is marked, the
   report is non-empty, *and* `report_emailed_at` is set. This changes both halves of the
   existing check — the client derivation in the gedu feed's entry-state module and its SQL
   twin in the assignment-summaries RPC (`attention_count`), which the contracts file
   already warns must agree — and the gedu feed RPC gains `report_emailed_at` per session
   so the card can render the sent state and the button's enablement without a second
   read. A session that is owed and has a report but no send shows "needs attention", like
   one with no report today.

   **The email half applies only to owed sessions.** The client's "complete" branch has no
   epoch floor today (only "needs attention" does), so adding the email half
   unconditionally would strip the green check from every finished session in history and
   let it be earned back only by mailing a months-old report to families. The SQL twin
   already floors at the epoch and needs no equivalent guard. The recording epoch is
   2026-08-31, so at the time of writing nothing is owed yet: this half ships inert and
   is verified by the entry-state unit tests and the preview scene's fixtures, not on live
   data.

   There is no "nobody to mail" exemption from the email half, on either side — see
   decision 1: such a session is sent to nobody, claimed, and surfaced to staff by the
   copy, and is then complete.

## Rejected alternatives

- **Mark the session as emailed only after the sends succeed.** Simpler to reason about,
  and wrong: two clicks in flight both read "not sent", both send, and the second click's
  only protection is a disabled button in one browser tab. The claim has to be the first
  write, which is why partial failure keeps the claim rather than releasing it.
- **A recipients table / per-recipient send log.** It would make partial failure precise
  (retry only the failed ones) and give admins a per-family record. It is also a second
  table, a second RPC and a reconciliation UI for a failure mode — Brevo rejecting some of a
  handful of sends — that is rare and already surfaces through the staff copy and the logs. v1
  records the session-level fact and the counts; a per-recipient log is a follow-up if the
  rare case turns out not to be rare.
- **A SECURITY DEFINER RPC that returns the recipient list.** The recipient resolution
  could live in the database, but it would be a second role-gated RPC with its own spine
  and contract tests, and it buys nothing: the send has to happen server-side anyway, the
  admin list and each parent's locale are server-side concerns, and the parents' addresses
  are already in the gedu's feed roster (there is a copy-all-addresses affordance built on
  them), so there is no privacy line to hold here. Instead the *claim* is the authorization
  (succeeding proves the caller is the assigned gedu), and the route resolves recipients
  with the admin client and never needs to return them. Same division the feedback route
  makes.
- **One mail per parent, naming all their children in the group.** Fewer mails for the
  sibling case, but the mail then has to choose one child's page to link (the pages are
  per participation) or link the dashboard root and lose the "here is where the reports
  live" destination the button was changed to carry. Siblings in one group are rare; two
  mails is the honest shape and the simpler one.
- **One mail to everyone with the parents in BCC.** Fails on locale (each parent reads in
  their own) and on personalisation (each mail names one child and links one page).
- **BCC the gedu and the admins on every family mail.** The literal first reading of the
  requirement, and rejected by the owner once the volume was spelled out: a seven-child
  group would land seven near-identical copies in every admin's inbox per session. One
  staff copy per send carries the same record at a seventh of the noise.
- **A dedicated staff-copy template.** The copy could have its own intro ("you sent this
  to 6 families") and its own keys in five locales. The existing template with the group's
  name in the child's slot reads acceptably to staff, and the route's response already
  tells the gedu the count; a bespoke copy is more copy to translate for an internal
  record.
- **Re-sending after the report is edited.** A gedu who fixes a typo after sending cannot
  send again; the checkmark stands. Allowing a resend means deciding what "already sent"
  means for families who have the first version, and is exactly the accidental-double-mail
  the owner asked to prevent. Follow-up, with its own rules, if gedus ask for it.
- **A second-person variant for self-seat adults.** An adult holding their own seat gets
  the same third-person mail naming themselves ("here's Marianne's report from Kyle's
  session"). Slightly odd, not wrong, and the adult-audience products are a small minority
  of sends; the confirmation mail's self-seat variant is the template if this is taken up
  later.
- **Hiding the button when no seat has a contact.** Proposed in review to stop a send to
  nobody; rejected because the send is also what completes the session, so a group with
  no mailable seat would sit at "needs attention" forever with no action offered, and the
  summaries SQL would need its own notion of mailability to agree. The state is not
  reachable through the product (a gamer account is created by its parent, so the link
  exists by construction; a self seat is its own contact), so the honest v1 is to let the
  send happen, mail nobody, and let the staff copy show the gap.
- **Falling back to the product's spoken language for a parent with no locale.** Locale and
  spoken language are deliberately distinct concepts in this codebase; the default locale is
  the honest fallback until the parent picks one.

## Steps

Each step is independently verifiable; the order matters where a later step needs the
types or the RPC of an earlier one.

1. **Migration** (`supabase/migrations/`, next free number — verify against the remote
   migration history at push time, not just when authoring):
   - Add `report_emailed_at timestamptz` and `report_emailed_by uuid references
     profiles(id) on delete set null` to `group_sessions`. Comment both: the at-most-once
     marker for the parents' mail; set by the claim, cleared only when every send failed.
   - Create `claim_group_session_report_email(p_group_id uuid, p_session_date date)
     returns jsonb`, plpgsql, SECURITY DEFINER, `search_path` pinned to empty. Body, in
     order: assert the `gedu` role; refuse with `42501` unless the caller teaches the group;
     lock the session row for the (group, date); refuse with one custom SQLSTATE if the
     row is missing or its report is empty after the same whitespace trim the summaries
     SQL applies ("no report"), and with a second custom SQLSTATE if `report_emailed_at`
     is already set ("already sent") — two codes the route matches on; otherwise stamp
     `report_emailed_at = now()`, `report_emailed_by = auth.uid()` and return the row as
     jsonb (id, group_id, session_date, starts_at, ends_at, report, report_emailed_at).
     Revoke from PUBLIC, grant to `authenticated` and `service_role`.
   - Extend the gedu feed RPC so each session object carries `report_emailed_at` (and
     only that — `report_emailed_by` is audit, nothing renders it, so it stays off the
     wire).
   - Extend the assignment-summaries RPC's `attention_count` so a finished session counts
     until attendance is complete, the report is non-empty (its existing trimmed test)
     **and** `report_emailed_at` is set. Update the comment that says the SQL and the
     client derivation must agree.
   - Push; regenerate `database.types.ts`; do not touch `schema.sql`.
2. **Contracts and DB tests.** In `src/services/gedu-sessions/gedu-sessions.contracts.ts`:
   a zod schema for the claim RPC's jsonb result; `report_emailed_at` (nullable string) on
   the feed session schema. In `tests/db/`: add the claim RPC to the authorization spine's
   role-gated registry (permitted roles: gedu; refusal code `42501`); and in the gedu session
   feed test, the positive path — a gedu on the group claims once and gets the row; a second
   claim is refused with the "already sent" error; a claim on a session with no report is
   refused; a gedu not on the group is refused; the feed now returns `report_emailed_at`;
   the summaries' `attention_count` counts a session with attendance and a report but no
   send, and stops counting it once claimed. Parse the claim result through the new schema.
   DB tests run in CI only — push the branch to run them.
3. **The route.** `POST src/app/api/gedu/sessions/email-report/route.ts`, declared with the
   route helper as role-gated to `gedu` **and requiring a certified gedu** (mailing every
   family in a group is a trust boundary; group assignment already implies certification,
   so this declares the posture rather than changing who passes), JSON body `{ groupId,
   sessionDate }` parsed through a schema in the contracts file. Handler, in order:
   1. Call the claim RPC on the user-bound client. Map the two custom codes — "already
      sent" and "no report" — to `409` with distinct messages; a `42501` to `403`; anything
      else to `500`.
   2. With the admin client: the product (type, timezone, translations), the group's name,
      the caller's profile (first name, email), every admin's email, and the group's active
      participations joined to the participant profile (first name, role, email, locale)
      and, via the parent link table, the earliest-linked parent (email, locale). Resolve
      each participation to a recipient per decision 3, or to "skipped".
   3. For each recipient: resolve locale (profile locale if supported, else the default);
      translator for it; product name via the translation helper for that locale; date
      (full style, the shared date formatter) and time range (the shared range formatter
      in `src/lib/utils.ts` — it takes the zone and always names it) in the product zone
      for that locale; the participation's `/parent` page from the trusted origin and the
      customer enrollment route helper; build subject and HTML; send with Reply-To the
      support inbox and no CC or BCC. All family sends concurrently, settled together so
      one failure does not stop the rest; tally.
   4. If sent = 0 and failed > 0: release the claim with the admin client (`update … set
      report_emailed_at = null, report_emailed_by = null where id = … and
      report_emailed_at = <the claimed timestamp>`) and answer `502` with a message.
   5. Otherwise send the staff copy: the same builder in the gedu's locale, the group name
      in the child's slot, the gedu workspace's page for the product (the gedu
      assigned-product route helper, which takes the product type and id) as the link, To
      the gedu's email, CC every admin's email, Reply-To the support inbox. Wrapped: a failure
      here is logged and changes nothing else. Then answer `200 { sent, failed, skipped }`.
      Log every family-mail failure with session and participation ids.
   - Register it in the integration suite's route registry: posture role-gated `gedu`
     (certified), JSON body, an `adminClient` justification ("the claim runs on the user client and is
     the authorization; the admin client resolves parents' addresses and locales and the
     admin list, which are not in the gedu's view and are never returned"), and the test
     file below.
4. **Integration test** for the route (`tests/integration/api/`), mocking the Brevo wrapper
   and the clients: sends one mail per active participation with the right `to`, Reply-To,
   no CC/BCC, and the participation-keyed `/parent` link; then exactly one staff copy To
   the gedu with every admin in CC, linking the gedu's product page; a self seat goes to
   the participant; a seat with no contact is skipped and counted; a roster with no
   contact at all still claims, sends no family mail, sends the copy and answers `200`; a
   second call sends nothing and answers `409`; a whitespace-only report answers `409`
   without sending; when every family send throws, the claim is released, no copy is sent,
   and the answer is `502`; when one send throws, the rest are sent, the copy goes out, the
   claim stands, and the answer carries the counts; when only the copy throws, the answer
   is still `200`; a non-gedu is refused.
5. **Service and query.** In `src/services/gedu-sessions/`: a service method posting to the
   route and parsing its response through a response schema; a mutation hook keyed by
   group whose `onSuccess` invalidates the group's feed key and the summaries key (the send
   can be what clears a session's alert, exactly as writing a report can). Update the
   service class's doc, which currently says the feature has no API routes beyond the
   Minecraft edit.
6. **The card and the scene.** The page that owns the feed's data calls the mutation and
   passes a send callback down, as it does for saving an entry; it also sets the new
   `hasContact` flag on each feed gamer from the roster RPC's two contact fields. In the
   feed: thread `reportEmailedAt` from the entry to the card (and through the local draft
   application, so a save does not drop it); the per-entry committing state covers the
   send; render the button / progress / sent line per decision 1 inside the report block;
   the confirm dialog with the participant count (gamers with `hasContact`); the
   response's counts shown once inline when some sends failed; inline error on failure.
   Extend the entry-state completeness derivation with the emailed flag, gated on the
   entry being owed, and update its unit tests (an owed session with attendance and a
   report but no send is "needs attention"; with the send it is "complete"; a session
   before the epoch with attendance and a report is still "complete" without a send). Give
   the gedu product preview scene's fixtures one sent session and one unsent one with a
   report, so the button, the dialog and the sent line render there with the send inert —
   the scene's own doc names a flagged session turning finished as the thing it exists to
   show.
7. **Copy.** New keys in the gedu feed's namespace in every file under `messages/`: the
   button, the sent line (with a time placeholder), the one-time partial-send notice (sent
   and failed counts), the dialog title/body/confirm, and the error messages for "already
   sent", "no report", and a failed send. The email's own copy already exists under
   `email.sessionReport`. Klingon in character; no emoji.
8. **Docs.** `src/components/session-feed/CLAUDE.md`: the third thing a session owes, and
   that the client derivation and the SQL twin both changed. `src/lib/email-templates/
   CLAUDE.md` and the builder's own header: drop the "spike, no route sends it" wording and
   name the route. The admin testing tool keeps its entry — it is still the place to
   iterate the layout.
9. **Delete this plan file.**

## Acceptance criteria

- On a past session with a saved report, the assigned gedu sees **Send to parents**;
  confirming sends one mail per active participation, each in the recipient's locale,
  naming that child, linking that child's product page, Reply-To the support inbox, no
  CC or BCC — and then one staff copy To the gedu with every admin in CC.
- The button is gone afterwards, replaced by a permanent sent line with the time; when
  not every send succeeded the counts appear once, inline, from the response. Reloading,
  another tab, and another assigned gedu all see the sent state; a second POST answers
  `409` and sends nothing.
- An owed session with attendance and a report but no send shows "needs attention" on the
  card and counts in the dashboard badge; after the send both clear. Finished sessions
  from before the recording epoch keep their green check without a send.
- The mail's time range names the product's zone, in the recipient's locale.
- When Brevo rejects every send, the gedu sees an error, the button is back, and no
  family received anything. When it rejects one, the rest arrive once, the sent line
  reports the count, and the failure is in the logs with ids.
- Unit, integration and DB tests above pass; lint, type-check and the translation check
  are clean; the route registry and the authorization spine both accept the additions.

## Constraints discovered while deciding

- **The viewer's timezone is environmental, and the server cannot see it.** It is held
  by a cookie-backed provider (deliberately no profile column — a written decision, not an
  omission), and every session label in the app renders in that zone, naming the zone's
  abbreviation whenever it differs from the product's. A mail is rendered without the
  recipient's cookie, so it can only use the product's zone — and must therefore always
  name it, so a family in another zone sees "GMT+3" in the mail and their own zone's label
  on the page, and understands both. Do not propose a profile timezone as the fix.
- **The family product page is keyed by participation id**, not product id — two siblings
  in one club have two pages. The route helper for it takes product type and participation
  id. This is why the mail is per participation.
- **`group_sessions` has no RLS policies and grants nothing to `authenticated`**; every
  access is through SECURITY DEFINER RPCs, which is why the claim is an RPC and why the
  route's direct release uses the admin client (service role holds the table grant).
- **Session rows are lazily materialised** — one exists only once a report, note or
  attendance mark needed somewhere to live. A session with no row has no report, and the
  claim refuses it. **"No report" is a trimmed test, not a null test**: a migration
  already exists because a whitespace-only report once counted as one; the summaries SQL
  and the client check both trim, and the claim must too.
- **The recording epoch is 2026-08-31.** Nothing is owed before it, so the completeness
  half of this work cannot be seen on live data until then; the client's "complete"
  branch has no epoch floor of its own, which is why the new half is gated on "owed".

## Implementer's judgment (deliberately free)

Copy and key names in the gedu feed namespace and the Klingon take; icon choice and where
exactly the sent line sits in the report block; how the sent time is formatted (the
viewer's zone, per the app's rule); the response field names and the service's response
schema; the migration number and comment wording; the exact SQLSTATE values; the log
line's shape; fallbacks when a first name is null; whether the spine entry needs the
"also forbidden on null args" annotation its sibling RPCs carry.
- **The roster RPC resolves the contact per seat already** (the participant themselves
  when they are the paying customer, otherwise the earliest-linked parent). The route
  resolves the same way, in the same order, so the count the dialog shows from the roster
  matches what the route sends. A seat with no contact is not reachable through the
  product: a gamer account is created by its parent, so the link exists by construction,
  and a self seat is its own contact — which is why v1 carries no special case for it.
- **The feed's gamer type carries id and first name only**, by a documented decision that
  accepted losing the contact signal "for now"; the dialog's count is the reason to widen
  it with a single boolean.
- **The gedu workspace is keyed by product, not group** — its route helper takes a product
  type and id and the page resolves the gedu's group itself — so the staff copy links the
  product page.
- **The product's name lives only in `product_translations`**; the `products` table has no
  name column. Pick the recipient's locale's translation, falling back to the default
  locale's.
- **Product-mail rules that bind here**: Reply-To is explicit on every send; every
  user-typed value is escaped (the renderer does this for the report, the builder for the
  facts); URLs in mail derive from the trusted request origin; a user-requested send's
  failure is the answer, never swallowed.
- **Route and RPC spines fail the build on omission**: a new route needs its registry
  entry, its admin-client justification and a named test that imports it; a new
  `authenticated` function needs its spine classification and a positive-path DB test.
- **Completeness is computed twice** — in the client from the feed document and in SQL for
  the dashboard badge — and the contracts file documents that they must agree. Both change.
- **Brevo's wrapper already supports `cc`**; no caller uses it yet, so the integration
  test is the first to assert it reaches the wrapper.

## Implementation notes (steps 1–2, as built)

Steps 1 and 2 are done. What a later step needs to know, and where the build
diverged from the text above:

- **Migration `00197_a_session_report_is_emailed_once.sql`**, applied to staging.
  00196 was taken by a sibling branch on shared staging, so `db push` refused
  until that branch's file was materialized locally for the push and deleted
  again — the pathway `supabase/CLAUDE.md` describes. Nothing else about the
  numbering moved.
- **The SQLSTATEs are `P0021` (no report) and `P0022` (already sent)**, exported
  from the contracts file as `SESSION_REPORT_NO_REPORT_SQLSTATE` and
  `SESSION_REPORT_ALREADY_SENT_SQLSTATE`. The route matches those constants, not
  literals and not messages.
- **New schemas in `gedu-sessions.contracts.ts`:** `sessionReportEmailClaim`
  (the RPC result), `emailSessionReportBody` (`{ groupId, sessionDate }`) and
  `emailSessionReportResponse` (`{ sent, failed, skipped }`), plus
  `report_emailed_at` on `geduFeedSession`. Step 3 needs no new contract of its
  own; step 5's service parses `emailSessionReportResponse`.
- **`sessionReportEmailClaim.report` is non-nullable**, a tightening the plan
  did not spell out: the RPC refuses an empty report with `P0021`, so a row that
  reaches the parse has one, and a parse failure would mean that guard stopped
  holding.
- **`src/types/database.types.ts` was regenerated against staging and then had
  the sibling branch's `product_images` table, `products.image_id` and their
  relationship rows removed.** Staging is shared, so a regeneration is the union
  of everyone's in-flight work; what is committed here is what a generation
  against this branch's migrations alone would produce.
- **The gedu feed's unit fixture** (`tests/unit/lib/gedu-session-feed.test.ts`)
  gained `report_emailed_at: null` in its row builder, because the contract
  field is required. Step 6 owns the entry-state cases on top of it.
- **The spine entry carries `permittedAlsoForbiddenOnNullArgs`**: the assignment
  half of the gate refuses a NULL group with a second `42501`, exactly as the
  session-notes writer's does.

## Follow-ups (to propose for `TODO.md`, not built here)

- English zone labels: the `en` locale formats with US conventions, so a UK family reads
  "GMT+1" where they expect "BST" (and a Helsinki session shows "GMT+3" rather than
  "EEST"). The fix is a formatting tag per locale in the locale config, and it is a
  site-wide decision about every date the app renders, not this mail's.
- Resending after a report edit, with rules for what the second mail says.
- A second-person variant of the mail for self-seat adults.
- A per-recipient send log, if partial failures turn out not to be rare.
