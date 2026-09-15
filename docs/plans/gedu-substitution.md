# Gedu substitution — cover requests, offers and the admin staffing editor

## Problem

A gedu who falls sick or cannot attend a session tells the office by a Discord ticket
(the handbook: by 09:00 on the day for sickness), and the office finds a replacement by
hand — asking around a pool for remote and Helsinki-region clubs, phoning for everything
else. Nothing in Sogverse records that the session was covered or by whom. Two things
break because of that:

- The cover gets the group's workspace only by being *permanently assigned* to the group —
  a fiction in the data that nobody cleans up — or does not get it at all, and writes the
  report through the absent gedu. A gedu already on a sibling group of the same product
  cannot be assigned at all, because a gedu holds at most one group per product.
- Gedu invoicing (next on the roadmap) has to know who actually ran each session and in
  which role, and the data model cannot say. A group's gedus are an unordered set with no
  role; a session records only its last editor.

## Scale

Every club, camp and event runs through this. Sickness cover is weekly across the
platform during term; a sub who then needs a sub themselves is rare but real. The
invoicing system will read every session's staffing, so a gap here is a gap in every
gedu's pay.

## The decision

**Roles on assignments.** Every group assignment carries a role: `primary` or
`assistant`. A group holds any number of each. Every existing assignment backfills as
`primary`. The only difference between the roles is pay (the product already carries a
per-session fee for each). The admin groups panel edits the role per gedu pill. An
`assistant` on a product whose assistant fee is unset is allowed; the fee simply reads
as not set wherever a fee is shown, and nothing flags it (the dashboard already treats a
missing assistant fee as "no assistant role", and that stays).

**One request per session, per absent gedu.** From a future session's card in the
group workspace, a gedu files "I can't make this session": a reason category (`sick` /
`other`) and an optional note. Both are visible to admins only. A request may be filed
for any session dated **today or later in the product's timezone** — the handbook's own
norm is same-day filing, and a date comparison needs no schedule expansion (see
Constraints). The gedu can withdraw it while it is still open. A request is keyed by
(group, session date, requesting gedu) — the absent *person* is the seat, since two
primaries of one group may both be out the same day. The role covered is the requester's
role at filing time (their assignment role, or the role stored on the cover they hold).

**Every certified gedu sees every open request.** A "Sessions needing cover" section on
the gedu dashboard lists open requests dated today or later, excluding any session the
gedu is expected at or has a request on. Each line shows product, group, date and time,
site or remote, topic, language and the role's fee (blank when unset). Not the reason.
One action, "I can cover this", records an offer; an offer can be withdrawn. No ranking,
no eligibility beyond certification, no notification on any channel. In-app only.

**An admin approves.** A "Cover requests" panel on the admin dashboard lists open
requests dated today or later, ordered by date then product, each with its requester,
role, reason, and offers. Each offer shows the offerer's name with the same standing
chips the certification queue uses (certified, record check). Approving one offer makes
that gedu the cover; the other offers are simply not selected. The requester sees status
only: open, N offers waiting, or covered by X. Offerers never learn who else offered.

**An admin can set a session's staffing exactly.** On the admin group page every session
card carries the staffing for that date and an editor with three actions: **set a sub**
for an expected gedu (choosing anyone certified, with no offer needed — this is the
existing office-arranged path, and it works on past sessions too so an off-platform cover
can be recorded for invoicing), **clear a sub** (the request goes back to open, so the
session returns to the queue), and **withdraw a request** (the absent gedu is attending
after all). The groups panel remains the permanent assignment editor; the two are
visibly different tools.

**A sub can ask for a sub.** An approved cover sees the same "I can't make this session"
action on their covered session. Their request is a new row keyed to *them* as the
absent person. The chain is fully reconstructible from the rows: a gedu appearing as one
row's `covered_by` and another row's `requested_by` on the same (group, date) *is* the
link.

**Who is expected at a session is derived, never stored.** The rule, in one sentence:
*a gedu is expected at (group, date) iff they hold no non-withdrawn request for it, and
they are either assigned to the group or hold a `covered` request for it.* That handles
the chain, an open sub-of-sub request, and a cleared cover alike. The derivation answers
"who is expected"; the request rows answer "who did which job, in which role, for whom".
Two questions, two sources — never forced through one computation.

**Sub access.** From approval, an approved cover has everything the group's gedus have
— the workspace, the feed, notes, roster, member flair, the game-account editor, the
site notes — until 24 hours after the session's report is sent, or 15 days after the
session date if it never is. That is one expression:
`now() < COALESCE(report_emailed_at + interval '24 hours', session_date + 15)`. The
holder must also still be certified. Two things are narrower, on purpose: the **voice
room** (the two voice predicates and the voice token route) and the **family report
mail** admit a cover only for the covered *date*, never for the group's other sessions.
After the window, corrections belong to admins, who can already edit any session.

**Unfilled.** A request nobody covers is *unfilled* once its date is in the past. That is
a derived state of an open request, not a stored one. Nothing happens to the session;
cancellation is its own roadmap item.

**Families.** Nothing new. The report attribution chip already names whoever wrote it.

**No new routes.** Every write is an RPC called with the browser client, gated in the
database, following the transport the gedu session writes use. Admin writes do the same
(admin-gated in the body). The route posture registry is untouched; the voice token
route's body changes but its posture does not.

## Rejected alternatives

- **A `session_covers` table separate from requests.** Every cover exists because
  somebody was absent, so the request *is* the natural row; "set a sub" with no request
  is a request the admin files on the absent gedu's behalf, created already covered.
- **A `supersedes_request_id` column for the sub-of-sub chain.** A second, staleable
  expression of a relation the rows already encode; nothing reads it that cannot read
  (group, date, requested_by, covered_by). Cut in the challenge review.
- **`approved_offer_id`, `created_by`, `cover_fee_cents_override` columns.** The first
  two are derivable (the approved offer is the covering gedu's offer; the filer is the
  requester or the stamped approver). The third answered a requirement the owner
  deferred — it is a follow-up, not a column. Cut in the challenge review.
- **A stored `unfilled` status.** Would need a clock. The date already says it.
- **Storing "who ran this session" on the session row.** Duplicates the derivation and
  drifts the moment an admin corrects a cover. The row keeps its last editor only.
- **Materializing the session row when a request or cover is written.** The hazard is
  the **retroactive admin path**: a cover set on a *past* date would write a row dated in
  the past, and municipality invoicing counts a past-dated row as "the session ran".
  (Future-dated rows are already excluded by that page's own rule, so the future path was
  never the danger.) Requests key on (group, date) like every session record and create no
  row.
- **Instant-precision deadlines ("until the session starts") and server-side start/end
  instants in the pool list and the queue.** `products.md` §Sessions and both feed RPCs'
  comments say the client owns the calendar math and SQL holds only a weekday validator.
  Date-granularity guards need no expansion, and the pool list and queue emit the date
  plus the product's slots and timezone for the client to compute instants, exactly as
  the feeds do.
- **Separate RPCs for the admin queue and for "my covers".** One consumer each, both on
  surfaces whose existing RPC is defined as the single document for that page. Folded in.
- **A 14-day history list in the admin queue.** Nobody asked for it; the invoicing
  follow-up reads the table.
- **Auto-approving the first offer.** The office decides; the admin step is the product.
- **Eligibility and ranking (coverage area, language, clash, record check)**; **any
  notification channel**; **a date-range request form**; **the requester withdrawing
  after approval**; **gedu-filed requests on past sessions**; **exactly-one-primary**. All
  owner decisions, recorded in the follow-ups or the decision above.

## Constraints discovered while deciding

- `products.md` §Sessions says the three occurrence expanders must be unified "when
  cancellation/substitution is built". That rule is about the expansion gaining a
  *subtraction*; substitution subtracts nothing, so it does not bite here. Say so in the
  doc update rather than leaving the instruction looking ignored.
- A request keyed on (group, date) can be orphaned by an admin moving the schedule's
  weekday afterwards, exactly like a session row. Orphaned requests are history: they
  render on no feed, and the admin queue must tolerate a date the schedule no longer
  projects (it orders by date, never by a derived instant).
- The `gedus_read_assigned_groups` RLS policy is evaluated as the querying role, so a
  policy that *calls* the cover predicate forces a grant to `authenticated` plus spine
  classification. **Step 1 found that inlining the `EXISTS` costs MORE, not less, and
  the policy calls the predicate instead** — see "Notes from Step 1" below. The
  assignment half is inlined only because `gedu_group_assignments` already carries a
  SELECT grant and a gedu-reads-own-rows policy; `session_cover_requests` carries
  neither and must not.
- The gedu certification column's comment says it gates exactly two things. It now also
  gates offering and holding a cover; update the comment.
- The assignment-summaries RPC's comment warns its owed-work logic has a TypeScript twin
  that must move in lockstep. Do not create a third computation.

## Schema

One migration (next free number; verify against remote history at push time), additive:

```sql
CREATE TYPE public.gedu_assignment_role AS ENUM ('primary', 'assistant');
ALTER TABLE public.gedu_group_assignments
  ADD COLUMN role public.gedu_assignment_role NOT NULL DEFAULT 'primary';
-- The default IS the backfill. Keep the default: the sole writer always sends a role.

CREATE TYPE public.cover_reason AS ENUM ('sick', 'other');
CREATE TYPE public.cover_request_status AS ENUM ('open', 'covered', 'withdrawn');

CREATE TABLE public.session_cover_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  requested_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role          public.gedu_assignment_role NOT NULL,
  reason        public.cover_reason,          -- required on the gedu path (RPC-enforced); an admin recording an off-platform cover may not know it
  reason_note   text,
  status        public.cover_request_status NOT NULL DEFAULT 'open',
  covered_by    uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cover_state CHECK (
    (status = 'covered') = (covered_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT chk_cover_not_self CHECK (covered_by IS DISTINCT FROM requested_by)
);
-- One live request per absent person per session. Withdrawn rows are history and
-- do not block a new one.
CREATE UNIQUE INDEX session_cover_requests_live_seat
  ON public.session_cover_requests (group_id, session_date, requested_by)
  WHERE status <> 'withdrawn';
CREATE INDEX ON public.session_cover_requests (group_id, session_date);
CREATE INDEX ON public.session_cover_requests (covered_by) WHERE status = 'covered';

CREATE TABLE public.session_cover_offers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.session_cover_requests(id) ON DELETE CASCADE,
  gedu_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, gedu_id)
);
```

Withdrawing an offer deletes its row. Approving does not touch the other offers; "not
selected" is derived from the request being covered by someone else. Which offer was
approved is the covering gedu's offer row.

RLS on both tables with the admin full-access policy only; no grants to `authenticated`
— every read and write goes through `SECURITY DEFINER` RPCs, the same posture as
`group_sessions`. Explicit per-role grants and `REVOKE ... FROM PUBLIC` on every new
function, per `supabase/CLAUDE.md`. `updated_at` maintained by the existing trigger
function.

### The access surface: every gate on `gedu_group_assignments`

Add an internal predicate `gedu_covers_group(p_group_id)`: the caller is a certified
gedu holding a `covered` request on that group whose access window (the COALESCE
expression above, reading the `group_sessions` row for `report_emailed_at` when one
exists) is still open. And `gedu_covers_session(p_group_id, p_session_date)`: the same,
restricted to that date.

The surface to widen is **every function body and every RLS policy expression that
references `gedu_group_assignments`** — not a list of predicate names. Known members
today, with the decision for each:

- Group-wide, window-boxed (`assigned OR gedu_covers_group`): `gedu_teaches_group`;
  `gedu_teaches_group_product` (the cover branch is *group*-only, not product-wide);
  `gedu_teaches_gamer`; the two game-account writes on group members; `set_site_notes`
  (the owner's "everything the main gedu can see" — a site note edit is low-risk and one
  fewer special case); the `gedus_read_assigned_groups` policy (inlined, see
  Constraints); `get_gedu_assigned_product` — both its gate **and** its "my group"
  resolution, because a cover has no assignment row to resolve a group from and this
  RPC is the door to the whole workspace.
- Date-scoped (`assigned OR gedu_covers_session` for the session in question):
  `is_voice_group_member`, `is_voice_group_moderator`, the claim behind the family
  report mail (at-most-once, no resend — a cover must not send it for a session they did
  not run), and the gedu branch of the voice token route in TypeScript
  (`src/app/api/voice/token/route.ts`, service-role client; the route's posture and
  roles are unchanged, its body and test are).
- Deliberately assignment-only, annotated: the assignment writer (`apply_group_changes`),
  every read that *lists* a group's gedus rather than gating on them (the admin
  dashboard, product-groups snapshot, the family feed's first names, the public product
  detail), the chat roster function (its own comment says a covering gedu becomes
  mentionable once they send), and any other member the completeness check turns up
  whose reference is not a gate.

**Completeness check, in the DB suite:** a catalog query enumerates every `pg_proc`
body and every `pg_policy` expression in `public` that references
`gedu_group_assignments`; each must either reference `session_cover_requests` (the cover
branch) or appear in the test's annotated assignment-only list with a reason. A member
in neither fails the build. A source grep in the same test covers the TypeScript path.
This is the root `CLAUDE.md` correctness-by-mechanism rule applied to this surface: the
enumeration is a query, the classification lives in the test, and a sixth gate added
next year is found by the query, not by memory.

### Guards shared by the writers

- *Expected at (group, date)*: the derivation sentence above, as one SQL predicate.
- *Date validity*: the existing writable-date check (at or after product start, within
  the horizon, on a slot weekday). The gedu path additionally requires
  `session_date >= (now() AT TIME ZONE product.timezone)::date`; the admin path does not.
- *May cover*: certified gedu; not the absent gedu; **not already expected** at that
  session; **holding no non-withdrawn request** on that (group, date). The last two
  together stop a sub covering their own substitute and stop two seats collapsing onto
  one person, which would make "who did which job" unanswerable.

### RPCs

All `SECURITY DEFINER`, `SET search_path TO ''`, guard-first, classified in the DB
suite's authorization spine as role-gated with their permitted roles. Return `jsonb`
parsed by zod on the client.

Gedu-facing (`assert_role('gedu')` first):

- `request_session_cover(p_group_id, p_session_date, p_reason, p_reason_note)` — caller
  must be expected at that session; `p_reason` required; role taken from their assignment
  or from the covered request they hold. Returns the request.
- `withdraw_session_cover_request(p_request_id)` — caller is `requested_by`, `open` →
  `withdrawn`.
- `offer_session_cover(p_request_id)` — *may cover* guard; request `open` and dated today
  or later. Idempotent on the unique key.
- `withdraw_session_cover_offer(p_request_id)` — deletes the caller's offer; refused once
  the request is covered by the caller.
- `get_open_cover_requests()` — every `open` request dated today or later (product-local)
  where the caller *may cover*, with the product shell (name, type, topic, language,
  remote flag or site name, timezone, schedule slots), the group name, the date, the role
  and that role's fee, and whether the caller has offered. Ordered by date then product.

Admin-facing (`assert_admin()` first):

- `approve_session_cover_offer(p_offer_id)` — request `open` → `covered` by the offer's
  gedu; stamps approver and time.
- `set_session_cover(p_group_id, p_session_date, p_absent_gedu_id, p_sub_gedu_id,
  p_reason, p_reason_note)` — absent gedu must be expected; sub passes *may cover*. If the
  absent gedu has an `open` request for the date, cover it; otherwise insert one already
  `covered`. Reason optional. No today-or-later requirement (the retroactive path).
- `clear_session_cover(p_request_id)` — `covered` → `open`, clearing the cover columns.
  Any non-withdrawn request on the same (group, date) whose `requested_by` is the
  cleared sub is withdrawn in the same statement.
- `withdraw_session_cover_request_as_admin(p_request_id)` — any non-withdrawn request →
  `withdrawn`. When it was covered, the same cascade as clear applies to its sub.

Existing reads, widened in place (bare-array shapes stay bare arrays; a widened document
the old app's contract strips is the accepted deploy window):

- `get_admin_dashboard` gains a `cover_requests` member: open requests dated today or
  later with product and group, requester (name, role), reason and note, and the offers
  with each offerer's name, certified flag and record-check flag. Ordered by date, then
  product.
- The gedu group feed and the admin product session document gain a `covers` list: every
  non-withdrawn request on the group within the feed's horizon, with requester, role,
  status, cover, offer count, reason (admin document only), and for the gedu feed whether
  the caller is the requester. The client merges by date onto the entry.
- `get_my_assigned_products` and `get_my_gedu_assignment_summaries` gain rows for the
  caller's live covers, discriminated (`kind: 'assignment' | 'cover'`) and carrying the
  covered date; the summaries' owed computation for a cover row is the same code path,
  restricted to that date. The assignment rows stop counting a session on a date where
  the caller holds a non-withdrawn request.
- `apply_group_changes`: an added assignment element is `{ groupId, geduId, role }`. A
  role change is a remove plus an add with the new role in one batch. Every read that
  lists a group's gedus carries the role.

### DB tests

Spine classification for every new exposed function; the completeness check above;
behaviour tests for the derivation (assigned, open request, covered, chain, cleared,
withdrawn), the access window (before and after the report is sent, the 15-day
fallback, de-certified mid-window), the *may cover* guard's four refusals, the admin
cascades, the date-scoped voice and report-mail branches refusing a cover on another
date, and the widened workspace gate admitting a cover.

## App

Service `src/services/session-cover/` (service, queries, contracts, keys, index) with
the zod schemas for every new document member; enum values derived from the generated
`Constants`. Query keys: `sessionCoverKeys.all / openRequests()`. Mutations invalidate
this root plus the gedu-sessions root, the admin-sessions root, the assignments root and
the admin dashboard key, as each write touches those documents.

Derivation helper in `src/lib/session-staffing.ts`: given a group's assignments (with
roles) and its non-withdrawn requests for one date, return the expected gedus with roles
and the per-request state the cards render. Unit-tested against the same cases as the DB
suite. Both staff feeds' entry builders attach it to each entry.

Gedu surfaces:

- Session card (future kind, dated today or later): the "I can't make this session"
  action opening a small dialog (reason category, note, confirm); after filing, a status
  line on the card (open / N offers waiting / covered by X) with Withdraw while open. A
  covered card shows the cover's first name in its staffing line for everyone.
- Dashboard: a "Sessions needing cover" section listing open requests with the "I can
  cover this" / "Withdraw offer" action, and one card per live cover in the assignments
  grid, marked as a cover with its date, linking to the workspace.

Admin surfaces:

- Dashboard: a "Cover requests" panel between the attention queue and the certification
  queue, one row per request, approve per offer, link to the group page. Collapses to an
  all-clear row when empty, like the attention panel.
- Group page session card: the staffing line (expected gedus with roles, covers named)
  and the editor with Set a sub (opens the gedu picker sheet), Clear sub, Withdraw
  request. Set a sub asks which expected gedu is absent when there is more than one.
- Groups panel: a role control on each gedu pill; the add-gedu flow asks the role
  (default primary).

Copy in all five catalogues (`messages/en,fi,fr,sv,tlh`), checked by
`npm run check-translations`. Finnish through the `suomi-finnish` skill. Vocabulary:
"cover" / "sub" in English; the handbook's "tuuraus" / "tuuraaja" in Finnish.

Docs in the same change: `docs/architecture/products.md` (roles, the request model, the
derivation sentence, the access window and its two date-scoped exceptions, the
unification note above, and the reserved-name paragraph updated — `request_substitute` /
`assign_substitute` are now `request_session_cover` / `set_session_cover`); a new
`src/services/session-cover/CLAUDE.md`; `docs/sogga-feature-gap-analysis.md` items 5
("Lesson Scheduling & Management") and 9 ("Substitute Educator Search") updated; the
certification column comment; the gedu-services `CLAUDE.md` where certification's gates
are listed.

## Steps

1. Migration + types regeneration + DB tests. Push, regenerate, add aliases in
   `src/types/index.ts`. **Done** — see "Notes from Step 1". Three migrations, not one:
   `00260_a_session_cover_is_a_request_somebody_answered.sql` (everything),
   `00261_the_db_suite_can_read_a_policy_expression.sql` (the catalog helper the
   completeness check needs) and
   `00262_an_optional_reason_is_an_optional_parameter.sql` (trailing DEFAULTs on the two
   reason parameters). All three are applied to staging and recorded in its history.
2. Service, contracts, derivation helper and its unit tests; the voice token route.
3. Gedu surfaces. 4. Admin surfaces. (3 and 4 in parallel; disjoint files.)
5. Copy in five locales; docs; delete this plan.

## Acceptance

- A gedu files a request on a future session, another certified gedu offers, an admin
  approves, the sub opens the workspace, writes the report, and loses access 24 hours
  after sending it. The absent gedu's dashboard badge does not count that session; the
  sub's cover card does until the report is sent. The sub can join the voice room on the
  covered date and not on the group's next date.
- The sub files their own request on the same session; a third gedu is approved; the
  derivation names only the third gedu as expected.
- An admin sets a sub on a past session with no request; clears a sub and sees the
  request back in the queue; withdraws a request and sees the assigned gedu expected again.
- The completeness check fails when a gate on assignments lacks both the cover branch
  and an annotation (DB tests).
- Lint, type-check, unit and CI DB suites green; translations check green.

## Follow-ups (live and die with this plan)

- Eligibility and ranking in the pool and the admin queue: coverage area, language,
  schedule clash.
- Notifications on request opened, offer received, cover approved.
- Gedu-filed retroactive requests.
- A sub fee above the base fee (a nullable per-request override; nothing in v1 needs it).
- Session cancellation, and the unfilled request's hand-off to it.
- A retention rule for `reason` / `reason_note`: a `sick` category is health-related
  data about a contractor. The Discord tickets carry the same today; nothing new is
  disclosed, but no rule exists for either.

## Notes from Step 1 (the database), for Steps 2–5

Deviations and decisions the later steps have to know about. Everything not listed here
was built as the plan and the cold-read answers say.

**Three migrations, and how they were pushed.** `00259` was claimed on staging by
`feat/fennoa-finvoice-export` between authoring and push, so this work is `00260`, and
`db push` refuses outright while remote history holds a version with no local file — the
documented pathway was used instead (`psql -f` per file, then `migration repair --status
applied`). `00261` adds `_list_policy_expressions()`, the catalog helper the DB suite
needs to read policy text at all — without it the completeness check's policy half could
only live inside `00260`'s own one-shot assertion block, which is the wrong home for a
check that has to fail on CI's from-scratch build. `00262` gives `p_reason` and
`p_reason_note` trailing `DEFAULT NULL` on both writers: the type generator never types
an RPC argument as nullable, so with no default a caller with nothing to send could
neither pass `null` nor omit the parameter. **The service omits them rather than passing
null.**

**`gedu_covers_group` is granted to `authenticated` and the policy CALLS it.** Inlining
the `EXISTS` cannot work: a policy expression reads its tables AS THE QUERYING ROLE, so
an inlined read of `session_cover_requests` would need both a table SELECT grant and a
read policy on that table — strictly more Data API surface than one boolean, and the
opposite of the intent behind keeping the table ungranted. The three sibling policies on
`product_groups` already compose a granted `SECURITY DEFINER` predicate for exactly this
reason. It is classified self-scoping in the spine with a scope test. The other three
cover predicates stay internal, and both new tables grant `authenticated` nothing.

**`claim_group_session_report_email` stopped calling `gedu_teaches_group`.** That
predicate now admits a cover on any of the group's dates, and the mail is at-most-once,
so the claim spells the assignment half out inline and adds `gedu_covers_session` for the
claimed date. **`gedu_teaches_gamer` needed no edit at all** — it composes
`gedu_teaches_group`, which is the whole reason it was written that way.

**The family feed is not widened, and carries no `role`.** "Every read that lists a
group's gedus carries the role" was applied to the staff reads only. The family document
is the app's one `.strict()` client schema, so a widened member would fail the old app's
parse rather than be stripped by it, and a family learns nothing from a pay class. It is
annotated assignment-only in the completeness check with that reason.

**The `covers` element's admin fields are keyed to the CALLER, not to the RPC.**
`get_gedu_group_feed` is served to an admin too (the admin group details page renders the
gedu workspace's body), so `reason`/`reason_note` ride when `is_admin()` and are emitted
as JSON `null` otherwise. `offer_count` rides for an admin and for the requester
themselves, `null` for anyone else. Keys are always present — the document keeps ONE
shape, so a zod schema never branches on which keys arrived.

**Field names for the zod schemas.** The one request document
(`public.cover_request_document`) every write returns and both feeds' `covers` element is
built from: `id`, `group_id`, `session_date`, `role`, `status`, `created_at`,
`requested_by`, `requested_by_first_name`, `covered_by`, `covered_by_first_name`,
`approved_at`, `is_requester`, `offer_count`, `reason`, `reason_note`.
`get_open_cover_requests` rows: `request_id`, `group_id`, `group_name`, `session_date`,
`role`, `fee_cents`, `has_offered`, `product{id, product_type, topic,
spoken_language_code, timezone, is_remote, start_date, end_date, site_name, translations[],
schedule_slots[]}`. The admin dashboard's `cover_requests` rows: `id`, `group_id`,
`group_name`, `session_date`, `role`, `reason`, `reason_note`, `created_at`,
`requested_by`, `requested_by_first_name`, `requested_by_last_name`, `product{id,
product_type, timezone, is_remote, translations[]}`, `offers[]{id, gedu_id, first_name,
last_name, certified, criminal_record_check_at, created_at}`. Both staff feeds also gain
`gedus[]{id, first_name, role}` — the admin product-session document per group, the gedu
feed at the root — which is the staffing helper's other input.

**Two internal helpers exist beyond the four predicates**, and neither is granted to
`authenticated`: `cover_request_document(row, include_reason, viewer)` so the wire shape
has one definition, and `cascade_withdraw_orphaned_cover_requests(group, date)`, the
fixpoint sweep the three unseating admin writes call.

**Still open for Step 2.** The voice token route's TypeScript gedu branch is not widened
yet, and the unit test enumerating `gedu_group_assignments` under `src/` therefore does
not exist yet — write both together, or the test fails on the route it exists to police.
The TypeScript owed-work twin has not learned the new rule either (SQL side: a date the
viewer holds a non-withdrawn request on is not owed by them). `get_my_assigned_products`
now returns cover rows, and `AssignmentsService` passes them through unfiltered — so the
gedu dashboard renders a cover as an ordinary assignment card until Step 3 gives it its
own.

**One consequence of shared staging to clean up at merge.** Types were regenerated
against staging, which already carries `feat/fennoa-finvoice-export`'s `00259`, so
`database.types.ts` on this branch also describes `invoice_customers`,
`products.invoice_customer_id` and the two invoice-customer RPCs. Four product fixtures
gained a one-line `invoice_customer_id: null` to keep `tsc` green; that other branch adds
the same line to the same four files. Regenerating after both land on `dev` settles it.

## Answers from the cold-read (settled; the implementer does not re-decide these)

**Schema and predicates**

- The `role` column is readable wherever assignments already are (parents read their
  child's group's assignments through the existing policy). Accepted: it is a pay class
  label, not a figure, and the fee columns on `products` are already public.
- Both new tables get `GRANT ALL ... TO service_role` and nothing else, exactly like
  `group_sessions`; add them to the access-control grant registry as such. The
  `updated_at` trigger is attached to the requests table; the offers table has none.
- `covered_by` and `requested_by` stay `ON DELETE RESTRICT`, matching assignments. A
  sub must hold a gedu account; every gedu does.
- `set_site_notes` gets an inlined location-shaped branch: a live cover on any group
  of an in-person product at that location.
- The two voice predicates keep their `(p_group_id)` signature; "the session in
  question" is **today in the product's timezone**, evaluated at call time. A cover on
  a group therefore reaches the voice room and the chat channel (which is gated by the
  same predicate) on the covered date only. The chat roster function stays
  assignment-only; a cover becomes mentionable once they send, as its comment says.
- The voice branches *add* to the existing product-wide assignment mobility; the
  assignment half is not narrowed. The acceptance criterion about the voice room is
  for a sub who holds no assignment on that product.
- The window compares against product-local midnight:
  `now() < COALESCE(gs.report_emailed_at + interval '24 hours', ((r.session_date + 15)::timestamp AT TIME ZONE p.timezone))`,
  evaluated per covered request with that request's own date's session row.
- `get_my_assigned_products` is `RETURNS TABLE`; widening it is DROP + CREATE +
  re-GRANT in the one migration. Accepted as the deploy window.
- The *expected* predicate takes `(p_gedu_id, p_group_id, p_session_date)`; it is
  internal (no grant), so it needs no spine classification. Where a gedu is both
  assigned and holds a cover on the same group (only an admin edit can produce it), the
  assignment supplies the role.

**RPC semantics**

- Every write returns the request document in the same shape the feeds' `covers`
  element uses. `offer_session_cover` is `ON CONFLICT DO NOTHING` and returns the
  request. Withdrawing a losing offer on a request covered by someone else is allowed.
- `reason_note` is trimmed, nulled when empty, capped at 500 characters, plain text.
- The gedu date guard is date-only and deliberately looser than the card, which hides
  the action once the session's end has passed (the feed's future kind). Same posture
  as "write validation is deliberately loose".
- `get_open_cover_requests` uses the *may cover* predicate for its exclusion, does not
  name the absent gedu (naming them half-reveals a private reason; the seat is the
  group's), and is bounded to dates within the next 60 days.
- `approve_session_cover_offer` locks the request `FOR UPDATE` and re-checks *may
  cover* for the offerer at approval time.
- `set_session_cover` on an absent gedu who is already `covered` **re-points the
  cover** (replace a sub in one action). `approved_by` is the acting admin on every
  admin path.
- The cascade after clear, withdraw and replace is a fixpoint sweep over that (group,
  date): withdraw every non-withdrawn request whose requester no longer holds a seat
  there (neither assigned nor the `covered_by` of a live covered request), repeating
  until nothing changes. Withdrawing a request whose requester was meanwhile unassigned
  restores nobody and is allowed.
- `apply_group_changes`: an added assignment upserts with `ON CONFLICT (group_id,
  gedu_id) DO UPDATE SET role`, so a role change is one add. An added group's element
  carries `gedus: [{ geduId, role }]`; the RPC still reads a legacy `geduIds` array as
  primaries for the deploy window. The apply route's body schema grows `role`; the
  posture registry entry is unchanged (it records the parse mechanism, not the schema).

**Feeds and derivation**

- The `covers` list is every non-withdrawn request on the group, unbounded, exactly as
  the feeds already return every stored row. The gedu feed document also gains the
  group's assignments with roles (`id, first_name, role`) so the staffing helper has its
  inputs. Staffing attaches to every entry kind; a projected date with no row carries
  its requests like any other. The requester-only `offer_count` is included when the
  caller is the requester (always in the admin document).
- The TypeScript owed-work twin learns the same rule as the SQL: an entry on a date
  where the viewer holds a non-withdrawn request is not owed by that viewer. Step 2
  names it.
- `get_gedu_assigned_product(p_product_id, p_group_id default null)`: with a group id
  the caller is assigned to or covers, that group is `my_group_id`; without one, the
  assignment group as today. The cover card's link carries the group id as a query
  param, so a gedu covering a sibling group of a product they teach lands in the right
  workspace.
- The dashboard rollup keys on (product, group) instead of product; a cover row's
  identity is (group, date), one card per covered date. A "live" cover is `covered`
  with its access window open; the card lasts as long as the window.

**Gedu UI**

- The "I can't make this session" action renders only for a gedu viewer who is expected
  on that date. The admin shell supplies the staffing editor in that slot instead — the
  surface decides by which callbacks it supplies, as the site panel already does.
- The staffing line renders only on dates carrying a request, on staff surfaces only.
- The "Sessions needing cover" section sits above the assignment sections and is hidden
  for an uncertified gedu (the server shell already knows `certified`).
- The cover card is its own small card (product, group, date and time, site or Join,
  the one-session attention badge), not the recurring assignment card.

**Admin UI**

- `cover_requests` is a fifth top-level member of the dashboard document; an empty array
  is the all-clear. Offerers ship the same stamps the certification queue ships.
- The gedu picker sheet's disabled rule is parameterised: for a sub it disables the
  absent gedu, anyone already expected at that session, and the uncertified; the
  candidate list is the same role read the product page uses. Set a sub is one dialog
  with two steps (absent gedu when more than one, then the picker); on an open request
  it reads as approving that request. Role control on the pill is a small select,
  staged with the panel's batch save like every other change. No affordance links the
  session editor to the permanent editor, deliberately.

**Tests and docs**

- The completeness query matches function bodies and policy text for the table name; a
  body that reaches assignments only through a predicate call is covered by the
  predicate being a member. The cover branch is a reference to
  `session_cover_requests`, `gedu_covers_group` or `gedu_covers_session`. The
  TypeScript side is a **unit** test enumerating every occurrence of the table name
  under `src/`, each annotated or carrying the branch.
- Spine opt-outs for NULL-argument calls are the implementer's, with reasons. The voice
  token route's registry entry is unchanged if its test name is.
- `products.md`: edit the unification sentence to name cancellation only; update both
  reserved-name paragraphs. Root `CLAUDE.md` Documentation table gains the new service
  row. Certification: column comment and `src/services/gedu/CLAUDE.md` both, noting the
  cover gate is server-side.
- Vocabulary: **sub** is the person, **cover** is the act and the request. fr/sv/tlh
  follow the catalogues' existing conventions. Message namespaces follow the nearest
  existing surface namespace.
