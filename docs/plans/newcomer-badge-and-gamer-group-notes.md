# Newcomer badge and Gedu gamer notes

Two staff-only marks that tell a Gedu what they need to know about a member before the
session starts: a **newcomer badge** that drains a pip meter across a member's first month in a group,
and a **per-(group, member) plain-text note** any Gedu on the product can read and write.

Both are visible to **Gedus and admins only**. The badge is drawn on two surfaces — the gedu
product details page roster and the voice room participant list — and the note on three: those
two, plus a group members card in the **admin sessions panel** at the foot of the admin product
details page.

The **newcomer badge is not drawn on any admin surface**, and the admin product details
*groups* panel carries neither mark. A participant chip there is a drag handle on a board for
moving people between groups: how new a member is has no bearing on that, and a note is a
control, which is the one thing that cannot live inside a drag handle.

---

## Problem

A Gedu walking into a session has no way to tell, from any surface the platform gives
them, which children are new to the group and which they have already met. A club that
gains a member in week six looks identical to one that has run with the same eight since
September — so the child who most needs a welcome is the one least likely to get one.

The same Gedu also has nowhere to put what they learn. What settled a child last week, who
they should not be paired with, what a parent mentioned at drop-off, the fact that someone
is moving groups next term — all of it lives in one person's head, and is lost entirely
when a substitute covers the session. `product_groups.gedu_note` exists but is about the
*group*; there is nothing about a *person in* a group.

## Scale

Every club group on the platform, every week, for every Gedu — this is the surface a Gedu
looks at most. Group rosters are small (single figures to low tens), and most members will
have no note: the note is the exception, the badge is the common case for the first month.
Neither feature carries any load concern; what they carry is a safeguarding boundary,
because both are staff-only data about children and must never reach a family surface or a
peer in a voice room.

---

## The decision

Everything in this section is **settled**. Do not reopen it; build it.

### Feature 1 — the newcomer badge

- A member who joins a group reads as **new to that group for 30 days**, and the badge
  says *how* new across that window rather than switching off on a cliff — a Gedu glancing
  at a roster reads not just "new" but "how new". The arithmetic is written and
  unit-tested — `newcomerDaysIn()` in `src/components/member-flair/`. How it is *drawn* is
  settled too; see "How the two marks look" below.
- The clock is a new column, **`participations.group_joined_at timestamptz NULL`**,
  stamped whenever a participation's `group_id` is **set or changed** — including a move
  between two groups of the *same* product. **A move resets the badge**: the member is new
  to *that* group, and that is the whole claim the badge makes.
- Moving a participation **out** of a group (`group_id → NULL`) clears the stamp back to
  NULL. A member with no group is not new to anything.
- **Backfill is NULL for every existing row.** Launch day is quiet by design: only joins
  that happen after the migration ever badge. There is no honest source for a historical
  join date (a group move leaves no trace today), and inventing one from `signed_up_at`
  would badge half the platform on day one with a claim that is not true.
- The badge is shown to **Gedus and admins only**, and **on club products only**
  (`consumer_club`, `municipality_club`). Camps and events never show it — everyone starts
  at once there, so "new" distinguishes nobody.
- It applies to **every seat holder**, adults included. A parent on their own seat is new
  to the group in exactly the sense the badge means. No role special-case.

### Feature 2 — the Gedu gamer note

- **Plain text**, no markdown, max **2000 characters**. (The authored-markdown fields in
  this app exist because their content is rendered somewhere else later; a note is read
  only in the box it was typed in, by someone about to run a session.)
- Strictly keyed to **(group, participant)**. A note **does not follow a member** who is
  moved to another group: the note may well say "moving groups next week", and it is about
  how *this* group is going. The old group's note stays where it was written.
- **Orphaned notes are an accepted leftover.** When a member leaves the group, their note
  row stays behind, unreachable from any surface (every surface renders the group's active
  roster). It is not cleaned up, and the write RPC will refuse to edit one, because its
  target check asks whether the participant currently sits in that group. This is a
  decision, not an oversight — a cleanup job would be machinery answering a requirement
  nobody has stated.
- **Write semantics: upsert; a trimmed-empty save deletes the row.** Clearing a note is how
  a Gedu retires guidance that no longer applies, and the absence of a row is what "no
  note" means everywhere else.
- **Last editor is surfaced** as "Last edited by {first name}".
- **Authorization: any Gedu assigned to any group of the note's group's *product*, plus
  admins, with full read/write parity between the two.** This is the same cross-group
  mobility the voice system already grants: a substitute Gedu standing in another group's
  voice room is exactly the person who needs the note, and refusing them would make the
  feature useless in the one situation it matters most.

### Cross-cutting — the voice room data path

**Staff-only data must never ride the Daily token or `user_name`.** That channel is
broadcast to every peer in the room, children included; it is documented in
`src/components/voice/CLAUDE.md` as "the token is the only identity channel" precisely
because a per-participant client query is impossible *for identity*. A note is different:
it is a staff read, and staff have a session that can ask for it directly.

So the voice room gets **a separate staff-overlay read**, one RPC per room:

- Gedu and admin clients fetch `get_group_staff_overlay(p_group_id)` once per room via
  React Query and merge the result into participant rows by `userId` (which is
  `profiles.id` — the token sets `user_id` to it, so the join key already exists).
- **Families and gamers never fetch it**, and the RPC refuses them with `42501` if they
  try. So visibility is **data access**, not a viewer prop that a future refactor could
  drop.
- Note edits made from the voice room go through the **same** write RPC and invalidate the
  same query keys as an edit made from the product page.

---

## Judgment calls made while writing this plan

These were open when the plan was commissioned. Each is now decided, with its reasoning,
so the implementer does not re-derive them.

### The stamp is enforced by a trigger, not inside `apply_group_changes`

**Decided: a `BEFORE INSERT OR UPDATE OF group_id` trigger on `participations`.**

The deciding fact is that `apply_group_changes` is **not** the only writer of
`participations.group_id`. Reading the current schema turns up three RPCs that write it —
`apply_group_changes` (the admin drag UI), `promote_from_waitlist` (sets it), and
`demote_to_waitlist` (clears it) — plus a fourth path that is not an RPC at all: the
`admin_full_access_participations` policy is `FOR ALL`, so an admin client can UPDATE the
column directly. And the FK is `ON DELETE SET NULL`, so **deleting a group** silently
rewrites `group_id` on every row that pointed at it, through no function at all.

Stamping inside `apply_group_changes` would therefore be correct for one of at least five
paths and silently wrong for the rest, in a way nothing would surface: a promoted member
would carry no badge, and a member whose group was deleted would keep a stamp naming a
group that no longer exists. A trigger is the only point that sees all of them, including
the cascade.

There is direct precedent on this exact table: `trg_validate_participations_group` is
already a `BEFORE INSERT OR UPDATE OF group_id, product_id` trigger enforcing a
cross-column invariant. The new trigger sits beside it and is the same shape.

The cost of a trigger — that the stamp is not visible at the call site — is real and is
paid down with a column comment and a table comment, which is where a reader of
`schema.sql` will look.

### The club gate lives in code, and the overlay RPC carries the fact it needs

**Decided: every RPC emits `group_joined_at` unconditionally; the club gate is one shared
code helper; and the overlay RPC carries the group's `product_type` so the voice room can
call that helper.**

The recommendation in the brief was "the RPCs emit the timestamp; the surfaces, which all
know `product_type`, render the badge only for club products". One of the two badge surfaces
does know it — the gedu page has `data.product.product_type`. **The voice room does not.** `/voice/group/[id]` is passed only a
group id and a back link; `VoiceRoomContext` carries `groupId` and `isModerator` and
nothing about the product; the token route knows the product type but deliberately puts
nothing staff-shaped on the token. So the premise fails for exactly the surface that most
needs the overlay.

The two ways out were (a) gate server-side — emit NULL `group_joined_at` on a non-club
product — or (b) hand the voice room the fact. (b) wins:

- A timestamp is a **fact**; "should this fact be drawn" is a **presentation rule**. Making
  one RPC lie about the fact so a client need not know a rule puts the same decision in
  four places (three roster RPCs plus the overlay) where a code helper puts it in one.
- A future surface reading `group_joined_at` for some other purpose ("when did this member
  join?") would find a silently NULL column on camps and have no way to tell that from "no
  stamp".
- The overlay document is per-group anyway; one `product_type` field on it costs nothing.

So: add `showsNewcomerBadge(productType: ProductType): boolean` to
`src/components/member-flair/newcomer.ts`, implemented as
`activityTypeOf(productType) === "club"` (`src/lib/activity-type.ts` already owns the
four-types-to-three-nouns mapping and already documents why the two club types are one
noun). Every surface calls that one helper. The **note** has no such gate — a note is
useful on a camp too, and nobody asked for one.

### Service home: a new `src/services/member-flair/`

**Decided: a new service directory, owning only the two genuinely new RPCs.**

The roster documents these marks ride are owned by three different services — `assignments`
(the gedu product page's `get_gedu_assigned_product`), `gedu-sessions` (the group feed),
`groups` (the admin snapshot) — plus `voice`, which owns none of them. Putting the overlay read and the note
write into any one of those forces the other three to import a service named for somebody
else's surface: a voice component importing `GeduSessionsService` is precisely the coupling
`src/components/member-flair/index.ts` already argues against, one layer up.

So `src/services/member-flair/` owns **only what is new**: `get_group_staff_overlay` and
`set_gamer_group_note`, their contracts and their keys. The badge and note *reads* that
ride the three existing roster documents stay exactly where they are — they are extra
fields on documents those services already own, and moving them would be a second system.
The directory also mirrors `src/components/member-flair/`, which is where the UI lives.

### No new API route

**Confirmed against the service pattern and against how `gedu-sessions` actually does
writes.** That service's own header states the rule and its exceptions: everything is an
injected-client `.rpc()` call *except* the two writes that need a server-side secret (the
Minecraft platform lookup, and the report email, which needs Brevo and the families'
addresses). Neither of the two new RPCs needs a secret — the note write is authorized by
`auth.uid()` inside a `SECURITY DEFINER` function, which is the reverse of needing the
service role. So both go through the browser client, and **the integration suite's route
posture registry is untouched**.

### The table needs no write-IDOR case, and here is what replaces it

The write-IDOR loop in `tests/db/write-idor.test.ts` is closed over "every table
`authenticated` may UPDATE or DELETE". `gamer_group_notes` grants `authenticated`
**nothing at all** — every read and write goes through an RPC, which bypasses RLS — so the
loop's completeness check will neither demand nor accept an entry for it, and adding one
would fail the equality assertion. The same holds for the grant allowlist in
`tests/db/access-control.test.ts`, which is likewise a *write*-grant allowlist: a table
with no client grants needs no entry, and the RLS sweep in that file picks the new table up
on its own.

The write-IDOR *requirement* is still met, one layer up: the write RPC authorizes **actor
and target** (staff reach over the product, **and** the participant actually sits in that
group), and the new db test asserts both halves negatively. Say so in the test file's
header so the next reader does not go looking for the missing loop entry.

---

## Rejected alternatives

- **Stamping `group_joined_at` inside `apply_group_changes`.** Covers one of at least five
  write paths. See the judgment call above.
- **Backfilling `group_joined_at` from `signed_up_at`.** Cheap, and wrong: signup date is
  not group-join date for anyone who has ever been moved, and it would badge a large slice
  of the platform on launch day with a claim that is false for exactly the members a Gedu
  would be most surprised to see badged.
- **A `group_joined_at` on a new history table** (one row per group membership episode).
  A real answer to a question nobody has asked — "which groups has this member been in" —
  at the cost of a table, its RLS, its grants and its spine entry. The badge needs one
  timestamp and the note is keyed to the current membership; when a membership history is
  genuinely wanted, it will be specified by whoever wants it.
- **Putting the note or the join date on the Daily token / `user_name`.** Broadcast to
  every peer, children included. This is the one thing this feature must not do.
- **A viewer-role prop deciding whether the flair renders.** A prop can be passed wrong; a
  refused query cannot. Families and gamers do not fetch the overlay and the RPC refuses
  them, so the gate is data access. The roster RPCs are already gedu/admin-only, so the
  same holds there.
- **Notes that follow the member across a group move.** Explicitly turned down: a note is
  written about how *this* group is going, and half of them will be stale or actively
  misleading in the new group ("moving groups next week").
- **A cleanup job for orphaned notes.** See the decision above — accepted leftover.
- **Markdown notes.** Turned down in the dialog's own header: a note is read in the box it
  was typed in, and offering headings would invite composing a document rather than
  jotting.
- **Serving the gedu product page from the overlay RPC instead of widening the roster
  documents.** Named here because an implementer *will* notice it partway through:
  `get_group_staff_overlay` already answers exactly the record that page wants — join stamp,
  note text, last editor's first name — keyed by participant id, for a group whose id the
  page already holds. One extra query there would delete the roster-widening work on **two**
  of the three readers, their contracts and their db coverage, leaving only the admin
  per-product read genuinely needing the new fields (it spans every group of a product at
  once, which a per-group overlay cannot answer). This was seen and is **not** taken. It is
  a scope change the owner has not ruled on; it costs the gedu page a third round trip and
  its own landing moment for data that rides free on a document the page already reads; and
  it would leave the same three facts arriving in two differently-shaped documents depending
  on the surface. Build what is written. If the case still looks compelling with the code in
  front of you, it is a question for the owner, not a decision to take mid-build.
- **A client-facing SELECT on `gamer_group_notes` — in either of the two shapes that would
  have made it work.** The table was going to grant `authenticated` SELECT behind two
  policies, one for admins and one calling `gedu_teaches_group_product(group_id)`. That
  cannot coexist with keeping the predicate private: **an RLS policy predicate is evaluated
  as the querying role**, so a function a policy names must be EXECUTE-able by that role,
  and `SECURITY DEFINER` does not help — it decides whose privileges apply inside the body,
  not who may call it. Two ways out were available and neither was taken.
  - *Grant `gedu_teaches_group_product` to `authenticated`.* It would work, and it would
    turn an internal predicate into an exposed function: an authorization-spine entry, a
    classification as role-gated or self-scoping, and a standing invitation to call it from
    anywhere. All of that to serve a query nobody makes.
  - *Inline the `EXISTS` into both policies* and keep the function private. Also works, and
    duplicates the predicate in two more places — three spellings of "does this Gedu teach
    this group's product" that have to stay identical through every later edit.

  Neither is needed once nothing reads the table directly: every read already goes through
  `get_group_staff_overlay` or rides a roster document, and both are `SECURITY DEFINER` and
  bypass RLS. So the grant and both policies are dropped, RLS stays on with no policy at
  all, and the predicate stays private like its stated precedent.

  **Worth naming the failure this avoids, because it was well camouflaged.** Shipping the
  grant *without* granting the function would have failed **closed** — `permission denied
  for function gedu_teaches_group_product` on every gedu read through the Data API, so no
  data would have leaked and the feature would simply have been broken —
  and it would have passed everything guarding the migration: the end-state assertion block
  asserts the function is *not* granted to `authenticated`, which the broken shape satisfies
  exactly, and the db tests exercise the RPCs, which bypass RLS and never evaluate a policy.
  A green CI on a contradiction is the reason this is written down rather than merely fixed.
- **Reusing `is_voice_group_moderator` as the new RPCs' second gate.** It computes exactly
  the predicate we want (admin, or a Gedu assigned to any group of the product) but its
  name would make a note read look like a voice concern, and it is referenced by voice RLS
  policies so it cannot be renamed cheaply. Instead the migration adds a neutrally-named
  Gedu-only predicate composed with `is_admin()` at each call site — which is the
  *dominant* pattern in this schema (`gedu_teaches_group` is Gedu-only and every caller
  composes it), and leaves voice untouched. Note the relationship in the migration header
  so the duplication is visibly deliberate.

---

## Constraints discovered while deciding

Restated here so this plan stands alone. Each one is a rule from a `CLAUDE.md` file or a
fact read out of the current schema.

1. **`supabase/schema.sql` and `src/types/database.types.ts` are the current state**, not
   the migration files. `database.types.ts` is purely auto-generated and must **never** be
   hand-edited. `schema.sql` is CI-maintained: do not dump it, edit it, or include it in
   the branch.
2. **Migration workflow, in order**: write the SQL → `npx supabase db push` → regenerate
   types with `npx supabase gen types typescript --project-id … --schema public` (the
   `--schema public` flag is load-bearing) → do nothing about `schema.sql` → add aliases to
   `src/types/index.ts` → commit migration + types + tests together. Always `npx supabase`,
   never a bare `supabase`.
3. **Migration numbers are contended.** `00201` is the highest today, but re-verify the
   next free number against `supabase_migrations.schema_migrations` **at push time**, not
   at authoring time, and renumber around a newcomer rather than contesting it.
4. **Every new object needs an explicit `GRANT`** — no Data API access by default, not even
   for `service_role`. A created or recreated function must pair its per-role `GRANT
   EXECUTE` with an explicit `REVOKE EXECUTE … FROM PUBLIC`; a drop/recreate cycle has been
   observed leaving a function `PUBLIC`-executable.
5. **Every new table enables RLS.**
6. **Every function reachable by `authenticated` must be classified in the DB suite's
   authorization spine** (`tests/db/authorization-spine.test.ts`) as role-gated or
   self-scoping, or the build fails. Role-gated means the body's **first statement** is a
   guard primitive (`assert_admin` / `assert_role` / `assert_self`, all raising `42501`).
   No exposed function may be `STRICT`.
7. **Model migration conventions on the highest-numbered migrations**, never an early one:
   `SET search_path TO ''` with fully-qualified names, per-role grants, a `DO $assert$`
   end-state block at the foot. `00201` is the freshest worked example of all three.
8. **Model the RPC guard shape on `set_group_notes`**, which is the existing
   gedu-or-admin write and does exactly what the two new RPCs need:
   `PERFORM public.assert_role(CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role);`
   as the first statement, then the ownership question as a second `42501`.
9. **`participations.group_id` is `ON DELETE SET NULL`** against `product_groups`. Deleting
   a group rewrites the column on every member row with no function involved — which the
   trigger sees and nothing else would.
10. **`gedu_group_assignments` carries `product_id` alongside `group_id`**, which is what
    makes "any Gedu on the product" a single-table `EXISTS`.
11. **The three roster RPCs return `jsonb`**, so their generated type is `Json` and their
    real shape lives in zod contracts. Every field added has to be added to the schema, to
    the hand-pinned interface in `src/types/index.ts`, **and** covered by a db test that
    parses real RPC output through the schema.
12. **`get_gedu_assigned_product` and `get_gedu_group_feed` keep their roster shapes in
    deliberate parity** (both function comments say so, and say not to "tidy" one away).
    Add the fields to both.
13. **`get_product_groups_with_details` emits the same participation shape three times**
    (grouped / unassigned / waitlist) on purpose. Keep them identical — the note subquery
    joins on `(group_id, participant_id)` and naturally returns NULL where `group_id IS
    NULL`, so one expression works verbatim in all three arms.
14. **The voice room is passed a group id and nothing else.** `VoiceRoomContext` exposes
    `groupId: string | null` (null = instant room) and `isModerator: boolean`; there is no
    product type anywhere in it.
15. **A room-wide lookup is resolved once for the whole list, never per row** — the list
    already owns the batched Roblox render lookup for exactly that reason, and its header
    explains why a hook per row is wrong. **The staff overlay obeys the same rule from one
    level further out**: every component in the room is a pure consumer of context, so the
    list resolves the overlay through the flair context and the *page* that mounts the room
    is what fetches it and fills that context in.
16. **Mutations must invalidate related queries in `onSuccess`,** using the key hierarchy so
    a parent key cascades.
17. **A button must not visually re-enable between the click and the action finishing** —
    the local `committing` flag set synchronously before `mutate()`. `GamerNoteDialog`
    already implements this; the wiring must not undo it by re-enabling on
    `mutation.isPending`.
18. **No emoji in `messages/`; every user-facing string exists in all five locales**
    (`en`, `fi`, `sv`, `fr`, `tlh` — Klingon is an easter egg and wants a fun take, not
    accuracy).
19. **No hardcoded colors or raw Tailwind color classes** — semantic tokens only. There is
    exactly one theme and it is dark; never write a light-mode fallback or a `dark:`
    variant.
20. **A migration and the code that depends on it ship in one release.** The release
    pipeline holds the Vercel production promotion until the CI migrations job has
    deployed, so the schema always lands first; the minute-or-less of new-schema-under-
    old-app that remains is harmless here because every change is additive and the old
    contracts strip unknown JSON fields. Staging is reserved for high-risk areas
    (payments), which this is not — see `docs/plans/CLAUDE.md`, "Landing in stages".

---

## Migration

One migration, provisionally `00202_a_member_is_new_to_a_group.sql` (verify the number at
push time). It does five things. SQL below is a **sketch** — bodies, comments and the
end-state assertion block are the implementer's to write in the house voice; `00201` is the
model for all three.

### 1. The clock column and its trigger

```sql
ALTER TABLE public.participations
  ADD COLUMN group_joined_at timestamptz;

COMMENT ON COLUMN public.participations.group_joined_at IS
  'When this seat entered its CURRENT group … NULL when the seat holds no group, '
  'and NULL for every row predating this column … A move between two groups of one '
  'product RESETS it: the member is new to that group. Stamped only by '
  'trg_participations_stamp_group_joined_at, which is the column''s only writer.';

CREATE FUNCTION public.stamp_participation_group_joined_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
BEGIN
  -- No group, no join: the ON DELETE SET NULL cascade lands here too.
  IF NEW.group_id IS NULL THEN
    NEW.group_joined_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    NEW.group_joined_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_participations_stamp_group_joined_at
  BEFORE INSERT OR UPDATE OF group_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_participation_group_joined_at();
```

Notes for the implementer:

- `IS DISTINCT FROM`, not `<>`: a NULL on either side must count as a change.
- An UPDATE that does not name `group_id` never fires the trigger, so an unrelated write
  (a status change, the `updated_at` touch) cannot re-stamp. An UPDATE that *names*
  `group_id` with the same value it already had does fire, and the `IS DISTINCT FROM` guard
  is what makes it a no-op.
- `now()` is right here, not `clock_timestamp()` — this is a display timestamp with no
  cross-row ordering semantics, the same case as `signed_up_at`.
- No trigger function is exposed to `authenticated`, so this one needs no grant and no
  spine entry. Confirm that against the spine's completeness check rather than assuming.
- **No backfill statement.** Say so in the header, so its absence reads as a decision.

### 2. The notes table

```sql
CREATE TABLE public.gamer_group_notes (
  group_id       uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  note           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (group_id, participant_id),
  CONSTRAINT chk_gamer_group_notes_length
    CHECK (char_length(note) BETWEEN 1 AND 2000 AND btrim(note) <> '')
);

ALTER TABLE public.gamer_group_notes ENABLE ROW LEVEL SECURITY;
```

- `ON DELETE CASCADE` on `group_id`: a note belongs to the group; deleting the group
  deletes the note. This is the one orphan case that *is* cleaned up, and it is cleaned up
  by the FK.
- `updated_by` is `ON DELETE SET NULL` — a departed Gedu's account must not delete the note
  they wrote. The read then shows the note with no editor line.
- **RLS on, and no policy at all** — not a read policy, not a write policy. Every read and
  every write of this table goes through the two `SECURITY DEFINER` RPCs, which bypass RLS
  entirely, so a policy would authorize a query nothing makes. With RLS enabled and no
  policy the table is deny-all to anyone who reaches it over the Data API, which is the
  strongest posture available and the one that matches how the table is actually used.
- Grants: `GRANT ALL ON TABLE public.gamer_group_notes TO service_role;` and **nothing for
  `authenticated`**, nothing for `anon`. No client role holds a grant on this table.
- **This is what keeps `gedu_teaches_group_product` private, and the two facts are one
  decision.** An RLS policy predicate is evaluated as the *querying* role, so a function
  named in a policy must be EXECUTE-able by that role — `SECURITY DEFINER` governs whose
  privileges apply *inside* the body, never who may call it. A `SELECT` policy on this
  table calling that predicate would therefore have forced a `GRANT EXECUTE … TO
  authenticated`, which makes it an exposed function needing an authorization-spine entry,
  and would have contradicted the migration's own end-state assertion that it is not
  granted. Dropping the client read drops all of that. The schema already draws this line
  both ways and both were checked: `is_voice_group_moderator` is granted to `authenticated`
  precisely because the `voice_zones` / `voice_private_zone_occupants` policies name it,
  and `gedu_teaches_group` is granted only to `service_role` and appears in no policy at
  all.
- The `updated_at` touch: reuse `public.update_updated_at_column()` via a trigger, as
  `participations` does, rather than setting it by hand in the RPC.

### 3. The predicate

```sql
CREATE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
  );
$$;
```

Internal, **not granted to `authenticated`** — exactly like `gedu_teaches_group`, whose
comment says so, and which the schema grants to `service_role` alone. It is called from
inside the two `SECURITY DEFINER` RPCs and **from nowhere else** — in particular from no RLS
policy, which is the whole reason it can stay private (see the notes table above). Its
comment should state the relationship to `gedu_teaches_group`
(same question, product-wide instead of group-wide) and to `is_voice_group_moderator` (the
admin-folded voice variant of the same predicate, deliberately left alone because voice RLS
policies reference it).

### 4. The staff overlay read

```sql
CREATE FUNCTION public.get_group_staff_overlay(p_group_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at',            part.group_joined_at,
           'note',                       n.note,
           'note_updated_by_first_name', ed.first_name
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id = part.group_id
          AND n.participant_id = part.participant_id
    LEFT JOIN public.profiles ed ON ed.id = n.updated_by
   WHERE part.group_id = p_group_id
     AND part.status = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;
```

- One entry per **active** participation of the group, keyed by participant id — the same
  map shape `get_gedu_group_feed` already uses for attendance. A participant id absent from
  the map (a visiting admin, the Gedu themselves, a stale peer) simply gets no flair.
- `product_type` is on the document because the voice room has no other route to it — see
  the judgment call above.
- Grants: `REVOKE EXECUTE … FROM PUBLIC;` then `GRANT EXECUTE … TO authenticated;` (and
  `TO service_role` only if something server-side will call it — nothing will, so leave it
  off).

### 5. The note write

```sql
CREATE FUNCTION public.set_gamer_group_note(
  p_group_id uuid, p_participant_id uuid, p_note text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_row  public.gamer_group_notes;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: a note may only be written about somebody who sits in the
  -- group it is filed under. Without this an authorized Gedu could file a note
  -- against any profile id on the platform.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_note IS NULL THEN
    DELETE FROM public.gamer_group_notes
     WHERE group_id = p_group_id AND participant_id = p_participant_id;
    RETURN jsonb_build_object(
      'group_id', p_group_id, 'participant_id', p_participant_id,
      'note', NULL, 'note_updated_by_first_name', NULL, 'updated_at', NULL
    );
  END IF;

  INSERT INTO public.gamer_group_notes AS n
         (group_id, participant_id, note, updated_by)
  VALUES (p_group_id, p_participant_id, v_note, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET note = EXCLUDED.note, updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'note',           v_row.note,
    'note_updated_by_first_name',
      (SELECT pr.first_name FROM public.profiles pr WHERE pr.id = v_row.updated_by),
    'updated_at',     v_row.updated_at
  );
END;
$$;
```

- The target check deliberately admits **any** participation status in that group, not just
  `active` — a note about somebody on the waitlist for the group is a coherent thing to
  write, and narrowing it buys nothing.
- Length is left to the CHECK (`23514`). The dialog caps at 2000 characters, so a longer
  write can only come from a non-UI caller and deserves a loud refusal rather than a silent
  truncation.
- Same grant boilerplate as the read.

### 6. The three roster documents gain three fields each

Recreate `get_gedu_assigned_product`, `get_gedu_group_feed` and
`get_product_groups_with_details`, copying each body **from `supabase/schema.sql`** (not
from the migration that first defined it — a later migration may have superseded it), and
adding to every participation/roster object:

| Field | Source |
|---|---|
| `group_joined_at` | `part.group_joined_at` |
| `note` | `n.note` from a LEFT JOIN on `(group_id, participant_id)` |
| `note_updated_by_first_name` | `profiles.first_name` for `n.updated_by` |

Placement, per function:

- **`get_gedu_assigned_product`** — the `roster` array, which is emitted for the caller's
  own group only. That restriction stands: a Gedu still sees no sister group's roster from
  this document, and therefore no sister group's notes.
- **`get_gedu_group_feed`** — the `roster` array. Parity with the above is required by both
  functions' comments.
- **`get_product_groups_with_details`** — all **three** participation arms, identically.
  Both the grouped arm and the two group-less arms use the same LEFT JOIN expression; on a
  row with `group_id IS NULL` it matches nothing and the fields come back NULL, which is
  the truth. Keeping one expression is what keeps the three shapes identical.

Recreating a function re-`GRANT`s and re-`REVOKE`s it — carry each one's existing grants
forward verbatim and re-assert them in the end-state block.

### 7. End-state assertion block

A `DO $assert$` at the foot, in `00201`'s style. At minimum:

- the column exists, is `timestamptz`, and is nullable;
- the trigger exists on `participations`, is `BEFORE INSERT OR UPDATE`, and names
  `group_id` in its column list;
- `gamer_group_notes` has RLS enabled, **holds no grant of any kind for `authenticated` or
  `anon`** (assert the absence explicitly — it is the whole access story for this table, and
  the absence of a write grant is what keeps it off the write-IDOR loop), has **no policies
  at all**, and carries its length CHECK;
- both new RPCs have `assert_role` as their first statement (grep `prosrc`, as `00201`
  does), are executable by `authenticated`, and are **not** executable by `anon`;
- `gedu_teaches_group_product` is **not** executable by `authenticated` — an assertion that
  is now simply true, rather than one the table's own policies would have falsified;
- the three recreated readers still contain their own guard (`assert_role('gedu')` /
  `assert_admin()`) and now contain `group_joined_at` — a lost guard or a lost section in a
  retyped body reads as an empty panel rather than an error, which is why the assertions
  exist.

---

## Types, contracts and services

### Order (non-negotiable)

Push the migration → regenerate `database.types.ts` → then everything below. Nothing in
this section compiles against a database that has not been pushed.

### `src/types/database.types.ts`

Regenerated, never hand-edited. It will gain `participations.group_joined_at`, the
`gamer_group_notes` table triple, and the two new function signatures. Both new RPCs return
`jsonb`, so their generated return type is `Json` — the real shape lives in zod.

### `src/types/index.ts`

- `GamerGroupNote` / `GamerGroupNoteInsert` aliases for the new table.
- Add the three fields to **`GeduAssignedProductRosterEntry`**, each with a doc comment:
  `group_joined_at: string | null`, `note: string | null`,
  `note_updated_by_first_name: string | null`.
- Re-export the new member-flair contract types from the new service, following the
  existing convention that consumers import their types from `@/types`.
- **Only one of the three roster shapes is hand-written, and it is that one.**
  `GeduAssignedProductRosterEntry` is a pinned interface living in this file, so it has to be
  widened by hand in step with its zod schema. The gedu feed's roster entry and the admin
  snapshot's participation detail are **derived** from their contracts and merely re-exported
  from here, so widening those two schemas is the whole of the edit — there is no second
  declaration to keep in sync, and writing one would manufacture exactly the drift the
  derivation exists to prevent.

### Contracts

- **`src/services/member-flair/member-flair.contracts.ts`** (new) — `groupStaffOverlay`
  (the `{ product_type, members }` document) and `gamerGroupNoteResult`. Derive the product
  type enum from the generated `Constants` object
  (`z.enum(Constants.public.Enums.product_type)`), never a hand-typed union.
- **`assignments.contracts.ts`**, **`gedu-sessions.contracts.ts`**,
  **`groups.contracts.ts`** — widen the roster/participation schemas with the same three
  fields. Each of these is already parsed against real RPC output by an existing db test,
  which is what will catch a mismatch between the SQL and the schema.

### Services

**`src/services/member-flair/`**, following the two-to-three-file pattern:

- `member-flair.service.ts` — `MemberFlairService` taking a `SupabaseClient<Database>`.
  `getGroupStaffOverlay(groupId)` → `.rpc("get_group_staff_overlay")`, parsed through the
  contract, returning `null` on `42501` (the established shape: a refused *read* is a clean
  "not yours" state). `setGamerGroupNote({ groupId, participantId, note })` →
  `.rpc("set_gamer_group_note")`, letting `42501` **throw** (a refused *write* is something
  the editor has to tell the Gedu about). Both use the injected client; **no `fetch`, no
  route** — see the judgment call.
- `member-flair.keys.ts` — a separate file, not inside the `"use client"` queries module,
  for the same reason `gedu-sessions.keys.ts` is separate (a server component seeding the
  cache must be able to name the same key):

  ```ts
  export const memberFlairKeys = {
    all: ["member-flair"] as const,
    overlays: () => [...memberFlairKeys.all, "overlay"] as const,
    overlay: (groupId: string) => [...memberFlairKeys.overlays(), groupId] as const,
  };
  ```

- `member-flair.queries.ts` — `useGroupStaffOverlay(groupId, enabled)` and
  `useSetGamerGroupNote(...)`. **The read is category 2** in the loading taxonomy: a small,
  indexed, bounded read of one group's members. So it renders **nothing** while in flight,
  inside a container already at its final size — no skeleton, no spinner, no delay.

  **This is settled, and it is settled by the row rather than by the query.** The row *does*
  outlive the overlay landing, so "nothing outlives this change" is not the exemption here;
  what makes the arrival free is that the row is **additive by construction** — the newcomer
  badge is last on the identity line and the note button is the left edge of a right-packed
  trailing group, so both grow into the row's slack and nothing already painted moves. See
  "Where the marks sit on a row". Two other answers were considered and neither is needed:
  **resolving the overlay before the room's first paint** (which would hold the whole room
  behind a staff-only read, and give a family's room nothing to wait for), and **reserving
  space for the flair** (a hole on every row without a note or a badge — which is most of
  them — to prevent a shift on the few, exactly the cost the root layout rule warns about).
  So the acceptance criterion demanding no layout shift and this "render nothing while in
  flight" choice are the *same* decision seen from two ends, not two answers to one question.
- `index.ts` — the barrel.

**Invalidation on a successful note save** (`onSuccess`), because four different documents
carry the same note:

```
memberFlairKeys.overlay(groupId)   // the voice room
geduSessionKeys.feed(groupId)      // the gedu group feed roster
assignmentKeys.all                 // the gedu product page document
groupsKeys.all                     // the admin groups snapshot
```

The first three are what the two live surfaces read. `groupsKeys.all` is there because the
admin snapshot *carries* the note whether or not anything draws it yet, and a document
holding a stale note is a document holding a wrong one; it is also one cheap staff-only
read.

The last two are invalidated at the top of their hierarchies rather than by id: the
mutation does not always know the product id, each is one cheap single-document read, and
both surfaces are staff-only and low-traffic. If the call site *does* know the product id,
prefer the narrower key.

---

## UI wiring

**This phase is promotion, not design.** Preview scenes and style-guide demos are being
built in parallel against **optional props** on `GeduProductPageBody`,
`ParticipantRosterRow` and `ParticipantRow` — the draft-body model, where the fixture shell
and the live shell render the same body. The work here is to make the **live** shells pass
real service data into those same props. Do not add a second set of props, and do not fork
a body.

### How the two marks look — decided, built, and no longer open

All three presentation questions have been reviewed and closed. The review scaffolding that
carried the candidates (a variant context, a switcher on the preview scenes, and the losing
components) has been **deleted**; what is in the tree is the decision.

**The badge is "New", a star, and a draining 2×2 pip meter.**

- *The glyph is a star.* A sprout shipped first and collided twice — it is the `beginner`
  product tag's chip icon and one of the voice-zone icons a moderator can pick, so a Gedu
  could meet three sprouts meaning three different things in one viewport. A **sparkle** was
  the obvious replacement and was rejected: the sparkle now reads industry-wide as
  *generated by AI*, and a badge sitting on a child's name is the last place to borrow that
  association.
- *The month is a meter, not a fade.* The original linear opacity fade was unreadable in the
  place it mattered: a badge at two-thirds opacity means nothing unless a full-strength one
  is beside it to compare against, and a roster of eight rarely offers one. Four pips are
  countable from a single row. Also rejected on the way: three discrete fill/tint/outline
  stages, the age stated in words, and no decay at all.
- *The pips are 2×2, not a row of four.* A line of four pips is nearly as wide as the word
  beside it, and on a 360px participant row that is width the name needs. The block drains
  bottom-right first, so the badge changes *shape* across the month rather than just dimming.

**The note marker is an icon button at the end of the row.** The two alternatives were built
and reviewed in place. A dot on the avatar corner is the smallest mark and sits where the eye
already is, but it makes the *face* the control — not self-evident — and leaves no affordance
at all on the rows with no note yet, which is most of them, and where writing the first note
is the common action. An inline preview line answers "what does it say" without a click, at
the cost of a list whose rows are no longer the same height, and it has the same no-way-in
gap. A constant icon has neither problem, and its lit/dimmed state carries the marker.

**A consequence worth stating: the note's *text* never reaches a *row*.** The inline
candidate was the only one that needed it there, so a row is handed a boolean and nothing
else — enough to light its button, nothing that could leak into a list.

**The payload is not thinned to match.** Both the roster documents and the staff overlay
carry the note's **text** and its last editor's first name, keyed by participant id, because
the dialog is mounted once by the page rather than by each row and has to seed its draft
from somewhere. Emitting a bare `has_note` boolean would leave the dialog with nothing to
open onto and force a second read per member. The thinning happens one layer down, where the
page derives each row's props from the map it holds.

### The voice room shows the note only on seat holders

**A room is not a roster.** A voice call contains the group's members *and* the Gedu running
the session, anyone covering with them, and any admin who has dropped in. A note is keyed to
`(group, participant)` and the write RPC refuses a target who does not currently sit in that
group — so a note button on a Gedu's own row is an affordance whose save can only fail. The
participant list therefore renders the button only for the group's seat holders. Gating on
the row's role instead would be wrong in a real case: a Gedu can hold a seat in another
group, and the question is membership of *this* one. The gedu product page needs no such gate
— its roster is seat holders by construction.

**The seat-holder set needs nothing new on the overlay: it is the members map's own keys.**
The RPC emits one entry per **active** participation of the group — note or no note, stamp
or no stamp — so its keys already name exactly the people a note may be written about. Do
not add an ids array beside the map; a second list of the same people is a second thing that
has to stay true. (The room's flair context does carry a distinct member set, because *its*
maps are sparse — only those with a note, only those inside the window — but that is a
property of the derived value, and the shell derives the set from the document's keys.)

### Where the marks sit on a row

**Order: the name, then the person's own detail, then the Parent badge, and the newcomer
badge last.** The middle slot is whatever that surface uses to say who this is — the child's
age and gender on the gedu roster, their game username in the voice room — and an adult has
neither, which is what the Parent badge stands in for. The two are mutually exclusive by
role, so a row carries one of them, and the newcomer badge follows whichever it was.

**Last is not a tidiness preference; it is the layout rule.** The newcomer badge is the only
item on that line that can arrive after the row has painted — in the voice room it comes with
the staff overlay, a round trip behind the Daily token that drew everything else. A mark
landing at the end of the run is absorbed by the line's slack; the same mark one position
earlier shoves an already-painted Parent badge sideways on data's own schedule, which the
root layout rule forbids outright. The gedu roster orders the two the same way even though
its flair arrives in the same payload as the roster, so there is **one order across both
surfaces** and neither has to remember which of them had the timing problem. Do not "tidy"
the badge forward.

**The note button's position follows from the same fact, and differs by surface because the
rows differ.** On the gedu roster it is the last child of the row, past the identity column
entirely. In the voice room it is the **left edge of the trailing control group** — the note
button, the mic/camera icons and the moderator menu are one group carrying the row's
`ml-auto`, so the group is right-packed and a button appearing later grows it leftward into
slack while the icons and the menu hold their positions to the pixel. It sat *between* the
icons and the menu once, and there every overlay landing pushed the icons left by its own
width.

**The voice room's row wraps below `sm`, and the identity is what moves.** At the 360px
floor the row has 294px of content width; the avatar, the status pair, the note button, the
moderator menu and their gaps take 170, leaving 124 for a name, badges *and* a game identity
on one line. It did not fit before the note button existed either. So the row is a single
wrapping flex line with per-breakpoint `order`: from `sm` up the identity sits directly after
the name, and below `sm` it goes full-width and last, dropping onto its own line indented
past the avatar — while the newcomer badge stays beside the name at every width, which is
where it belongs on a phone. The identity slot is sized to its content and never truncates
(it carried a fixed 160px column once, which clipped the long names and left a dead gap after
the short ones); the name is the only thing on the row allowed to give way. The arithmetic is
recorded in `src/components/voice/CLAUDE.md` so the next thing competing for that line redoes
it rather than eyeballing it.

### Gedu product details page (`src/components/gedu/session-details/`)

**There is no plumbing to invent — it is built, and it is one prop.** The page body takes an
optional `RosterMemberFlair` (exported from the same module) and derives every row's flair
from it: the clock the badges measure against, `newcomers` (ISO join stamps by participant
id), `notes` (note text by participant id), an optional editor map, and
`onSaveNote(participantId, text)`. The body owns which member's note is open, mounts **one**
`GamerNoteDialog` for the whole roster, and hands each row a join stamp, the clock, a
`hasNote` boolean and an open callback — the note's text stops at the body. Rows do not read
flair off the roster entry, and this phase must not make them start.

Every map is keyed by participant id and **absence is how "none" is spelled**, which is the
one coercion this step has to get right: a NULL from the RPC is *left out* of the map, never
written in as a null. The dialog's `note` is a `string` where `""` means "nothing written
yet", its `lastEditedBy` is optional, and its `onSave` receives the trimmed draft and is
awaited.

So the work here is the data shell, not the row:

- **The roster this page renders comes from the *feed* RPC, not from the assignment
  document.** The shell reads both — the assignment RPC answers "which group here is mine
  and who else teaches this product", the feed RPC answers everything about that one group —
  and then substitutes the feed's roster, and its headcount, into the assignment document
  before handing it down, because the feed is the copy a roster write invalidates. Widening
  only `get_gedu_assigned_product` would therefore ship a page with **no flair and no
  error**: the fields would be sitting on a roster the shell throws away. Both readers carry
  them, which is what the parity rule in the migration already asks for — this is why it
  matters here.
- **Build the flair object in the shell, from the clock the feed was built against**, so the
  badges answer off the page's own instant rather than inventing one and disagreeing with
  everything around them.
- **The clubs-only gate lives here, not in the row.** On a non-club product hand over an
  **empty newcomers map** and leave the notes exactly as they are — a note is not gated by
  product type.
- **`onSaveNote` passes the mutation's promise straight through.** The dialog holds its own
  `committing` flag, awaits the save and closes only once it lands, so the wiring must not
  add a disabled state derived from `mutation.isPending`.

**The row needs no clock call and no window check.** `NewcomerBadge` reads the day count
itself and renders `null` past the window — and for a member with no stamp at all — so a
caller simply renders the badge; the row's only condition is having a clock to hand it.
Nothing in the row calls the arithmetic directly, and nothing should start to.

### Voice room (`src/components/voice/`)

**The seam is the page that mounts the room, not the participant list.** Every component
inside the room is a pure consumer of context now: the list reads the overlay through
`useVoiceMemberFlair()` and hands each row its own answer, and it has no way to fetch one —
so the fetch, the derivation and the note dialog all belong to the client page component
behind `/voice/group/[id]`, the one that already owns the token, the join and the leave. It
wraps the room in `VoiceMemberFlairProvider` and mounts the dialog beside it. **The
voice-room preview scene is the exact model to copy**: it builds the same context value from
fixtures, mounts the dialog outside the provider's subtree, and drives the note against local
state. Swap the fixture for the query and the shape is done.

- Call the overlay read with the group id and the moderator flag from `useVoiceRoom()`,
  enabled only when there is a group to ask about (`groupId === null` is an instant room)
  and the viewer is a moderator. That flag exists **only to avoid firing a request that
  would be refused** — the RPC's `42501` is the actual boundary — and a viewer with no
  overlay is handed `null`, which is the room exactly as it rendered before any of this
  existed.
- **The context value's shape is fixed, and it is not the RPC's.** The provider takes one
  clock, a seat-holder set, a stamp map, a note map, an optional editor map and an open-note
  callback; the RPC answers with a product type and one record per member. Turning one into
  the other **is** this step; neither shape moves to meet the other, and nothing is added to
  the context that the document does not already imply.
- **The seat-holder set is the document's keys** — see the section above. No ids array.
- Merge into each row by `userId`, which is `profiles.id` (the token sets `user_id` to it,
  which is what `canReceive.byUserId` already keys on).
- **The clubs-only gate is applied where the context value is built, and can live nowhere
  else**: the participant list and its rows know nothing about a product, which is why the
  overlay carries `product_type` at all. On a non-club product hand over an **empty
  newcomers map**. The notes are ungated and go over unchanged.
- The dialog is the page's; the row's callback opens it, and it saves through the same
  mutation the gedu page uses.
- **Nothing about this rides the Daily token.** Do not add a slot to `user_name`.

### Admin product details — the groups panel draws neither mark

**Nothing on `src/components/admin/products/groups/` changes.** A participant chip there is a
drag handle on a board whose whole purpose is moving people between groups, so `ParticipantChip`
is untouched: the newcomer badge has no bearing on a move, and the note is a *control*, which is
the one kind of thing that cannot sit inside a drag handle without competing with the gesture
the board exists for. `showsNewcomerBadge` is never called on this surface.

### Admin product details — the note lives in the sessions panel

The admin's home for a member note is a **group members card in the sessions panel** at the
foot of the admin product details page — the panel whose own subject is what happened on this
product, group by group: the group's standing notes, the venue's notes, and the session record.

Three things make it the right home rather than a place the note was fitted into:

- **It is already group-scoped.** The panel carries a group selector, and a note is keyed to
  `(group, member)`. The scope the note needs is the scope the panel already has, so nothing
  has to be threaded in to establish which group a note belongs to.
- **It already reuses the gedu presentation rather than forking it** — the standing-notes and
  site-notes panels on it are the gedu components, imported. A members card renders the same
  roster row the gedu page renders, which already takes the note props and already draws the
  button. There is no new component and no new interaction to design.
- **It sits beside the group's own notes, which is what it is.** A note about a person in a
  group belongs next to the notes about the group.

**The card sits beside the standing notes, not attached to the register.** The register is
per *session* and the note is per *(group, member)*; hanging a note off an attendance row
would quietly assert that a note is about the session it was written during, which is the
opposite of what it is for — the note is the thing that survives from one session to the next.

**The card draws the note button and no badge**, per the rule above. Rows are read-only
otherwise: this is not a second place to correct a game username.

`get_product_groups_with_details` carries the three fields (see the migration) — which is
also what keeps its three participation arms one shape — and the card is what renders them.

### Preview scenes

The gedu-product scene and any voice scene keep feeding the same props from fixtures. A
fixture id that feeds an identicon **must be a real generated UUID hardcoded as a literal**
— a readable stand-in renders a degenerate avatar and makes the demo a false picture.

**One fixture is narrower than the rule, and the rule wins.** The gedu product page's
scenarios give flair to the **club** only; the camp scenario passes none at all, its comment
reading the absence as the clubs-only *badge* rule made visible. But the two marks are gated
differently — a note is not gated by product type — so as things stand no scene anywhere
shows a note on a camp, and the fixture quietly implies a gate the product does not have.
The plan is the authority: the live camp page carries notes. When the wiring lands, give the
camp scenario notes with an empty newcomers map — which is precisely the shape the live shell
hands a non-club product, and the only way a scene can show the two gates coming apart.

### Locale strings

**None are needed.** The `memberFlair` namespace already carries everything both marks use,
in all five locales: `newcomer`, `newcomerTooltip`, `openNote`, `noteTitle`, `notePrivacy`,
`notePlaceholder` and `noteLastEdited`.

**One of them has already been retuned for width, and the reason is the 360px row.** The
French `newcomer` read "Arrivée récente" and left the name beside it an ellipsis on a 360px
participant row; it is **"Nouveau"** now, and `newcomerTooltip` follows it. French is
routinely the widest of our locales, which is what the root CLAUDE.md rule means by judging
a tight layout in the widest one — so a future edit to this label is a width decision, not
just a wording one.

Two candidates were considered alongside the
indicator choice and the choice retired both:

- an **"add a note" label** for rows with nothing written yet. The note button is present on
  every row and carries the *same* accessible name lit or dimmed, because opening an empty
  note **is** the add flow — one label covers both states, and a second one would assert
  they are two different actions.
- a **save-failure line**. The dialog surfaces the thrown error's own message and falls back
  to the shared `common.unexpectedError`, which is what every other write on these surfaces
  does; a bespoke string would be one more thing to translate saying the same thing.

There was a ninth key, `memberFlair.hasNote` — a screen-reader label belonging to the
indicator that lost — and it has been **deleted from all five locale files on this branch**.
Nothing can reach it, and the wiring must not bring it back.

If a string does turn out to be needed after all, it goes into **all five** locale files
(`en`, `fi`, `sv`, `fr`, `tlh`) in the same change, with no emoji — a glyph is a
`lucide-react` icon rendered beside the translated text.

---

## Tests

### DB (`tests/db/`, CI only — there is no local Postgres, so exercise these by pushing the branch)

**New: `tests/db/member-flair.test.ts`.**

**Reserve its fixture UUIDs first.** `tests/db/product-helpers.ts` carries an allocation
registry in its header — every db test file owns a sub-range of the reserved id space, because
CI runs each file in its own worker and two files sharing a product id race on the primary
key. Pick a free sub-range, write it into that registry with a line saying what each id is
for, and use it. Keeping the registry current is part of adding the file, not a tidy-up
afterwards.

*The trigger:*
- inserting a participation with a `group_id` stamps `group_joined_at`;
- inserting with `group_id NULL` leaves it NULL;
- moving between two groups of the same product **re-stamps** — strictly greater than the
  previous value, and **that comparison only holds across transactions**. `now()` is the
  *transaction* timestamp, so two moves inside one statement or one RPC call stamp
  identically; what makes "strictly greater" true here is that the test's two moves are
  separate round trips. Say so beside the assertion, so a reader who later meets a
  same-transaction pair of moves reaches for a second round trip rather than "fixing" the
  trigger to `clock_timestamp()` — which would buy nothing and break the column's parity
  with `signed_up_at`;
- moving to `group_id NULL` **clears** it;
- deleting the group (the `ON DELETE SET NULL` cascade) clears it;
- an UPDATE that does not touch `group_id` does **not** re-stamp;
- an UPDATE setting `group_id` to the value it already held does not re-stamp.

*The overlay RPC:*
- an admin gets the document;
- a Gedu assigned to **another group of the same product** gets it (the cross-group
  mobility that is the whole point);
- a Gedu assigned to a **different product** gets `42501`;
- a customer and a gamer each get `42501`;
- the document's `product_type` matches the product;
- the members map is keyed by participant id and covers the active roster;
- **the real output parses through `groupStaffOverlay`.**

*The note write:*
- writes and reads back, with `note_updated_by_first_name` naming the writer;
- a **second editor** on the product overwrites it and becomes the named one. This cannot
  be written as "a second Gedu" out of the box: **the db seed carries exactly one gedu
  account**. Two honest ways through, and the file header should say which was taken —
  create a second gedu in the file's own setup (an admin-API user, promoted, torn down in
  the same hook, which other db tests already do for their fixtures), or make the **admin**
  the second editor, which costs nothing extra because the admin-parity case below already
  needs an admin writing this note;
- a trimmed-empty save **deletes** the row;
- a note for a participant **not in that group** is refused `42501` (the target half —
  note in the file header that this is what stands in for a write-IDOR loop entry, since
  the table carries no write grant);
- a Gedu on another product is refused `42501` (the actor half);
- an admin has full parity;
- a >2000-character note is refused by the CHECK;
- **the real output parses through `gamerGroupNoteResult`.**

*The mobility rule:*
- a member with a note, moved to another group of the same product, keeps the note **on the
  old group** and has none on the new one; and their badge clock resets.

**Extend the three existing reader tests** — `get-gedu-assigned-product.test.ts`,
`gedu-session-feed.test.ts`, and whichever test parses `get_product_groups_with_details` —
so the widened schemas are exercised against real output including a member **with** a note
and one **without**. A widened schema with no covering db test is exactly the gap the
contracts convention exists to close.

**`tests/db/authorization-spine.test.ts`** — add both new RPCs to `ROLE_GATED_RPCS` with
`permittedRoles: ["gedu", "admin"]` and a `permittedAlsoForbiddenOnNullArgs` reason, in the
established voice: a NULL group is a group no Gedu teaches, so the ownership half refuses
with a second `42501`; an admin passes that half and is refused by the target check (the
writer) or returns a null-shaped document (the reader). Name the positive-path file
(`member-flair.test.ts`) in each reason, as every other entry does. `gedu_teaches_group_product`
needs **no** entry — it is not granted to `authenticated`, and the completeness check will
say so if that is ever wrong.

**`tests/db/access-control.test.ts`** — the new table is swept automatically for RLS. Run
it and confirm the grant allowlist and the write-IDOR completeness check both still balance
(they should: the table holds no client grant at all, so it needs no entry in either).

### Unit (`tests/unit/`)

- `member-flair-newcomer.test.ts` already covers `newcomerDaysIn` — the clock's whole public
  surface, which answers in whole days or `null` and is called by the badge, never by a row.
  Extend it with
  `showsNewcomerBadge`: true for both club types, false for camp and event, exhaustive over
  the enum so a fifth product type fails the test rather than defaulting to "no badge".
- A wiring test in the style of `groups-panel-wiring.test.tsx`: a roster row with a note
  renders the indicator; one without renders nothing; opening the dialog and saving calls
  the mutation once, with the trimmed text, and the button does not re-enable between the
  click and the close.
- `preview-scenes.test.ts` already guards the registry; if a scenario is added, it is
  covered by that.

### Integration (`tests/integration/`)

**None.** No API route is added — see the judgment call. If that turns out to be wrong
during implementation, the route needs a posture registry entry **in the same change**, or
the build fails.

### Always

`npm run lint` (zero errors **and** zero warnings — a suppression needs an inline
`-- reason`), `npm run type-check`, `npm run test`.

---

## Staging

**One release.** The pipeline holds the Vercel production promotion until the CI
migrations job has deployed, so within the release the schema lands before the code that
reads it. The minute-or-less of new schema under the still-old app that remains is
harmless here: every change is additive — a nullable column, a new table, new RPCs, and
widened JSON output the old app's contracts strip — so the old app never notices. This is
not a high-risk surface (no money, no auth), so the staging exception in
`docs/plans/CLAUDE.md` does not apply, and there is no operator step. One branch, one
merge, one release.

---

## Steps

Ordered by the migration-before-types-before-code constraint — the order governs the
*work*, not the release: everything below lands in one merge and one release. Each step is
independently verifiable.

1. Branch off the **latest `dev`** (`feat/member-flair` or similar). `main` trails `dev` by
   hundreds of commits and is the wrong base, including when tooling offers it as the
   default.
2. Verify the next free migration number against
   `supabase_migrations.schema_migrations` at push time. Write
   `00202_a_member_is_new_to_a_group.sql`: column + trigger, table + RLS + grants,
   predicate, overlay RPC, write RPC, the three recreated readers (bodies copied from
   `supabase/schema.sql`), and the `DO $assert$` end-state block.
3. `npx supabase db push -p "$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2-)"`.
4. Regenerate:
   `npx supabase gen types typescript --project-id "$(grep '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2-)" --schema public 2>/dev/null > src/types/database.types.ts`.
   Check the generated nullability of anything new against what the SQL actually
   guarantees — a `RETURNS TABLE` column behind an INNER JOIN and a CHECK-tightened column
   both come back wrongly nullable, and the fix is a zod parse or a type guard, never a cast.
5. `src/types/index.ts`: table aliases, the three roster fields, the re-exports.
6. Write `member-flair.contracts.ts` and widen the three existing contracts.
7. Write `tests/db/member-flair.test.ts`; extend the three reader tests; add both RPCs to
   the authorization spine.
8. Lint, type-check, unit suite. Push and let CI run the db suite — it cannot be run
   locally. The migration is on the deployed database from step 3 onward, which the old
   deployed app tolerates (everything is additive), so the branch can sit here as long as
   the work below takes.
9. `src/services/member-flair/` — service, keys, queries, barrel.
10. `showsNewcomerBadge` in `src/components/member-flair/newcomer.ts`, exported from its
    barrel; extend the existing unit test.
11. Promote the gedu product page: the live shell builds the flair object out of the
    **feed's** roster and the page's clock, and hands it to the same prop the scene feeds.
12. Promote the voice room: the page behind `/voice/group/[id]` fetches the overlay, derives
    the context value, wraps the room in the flair provider and mounts the dialog — the
    preview scene's shape, with a query where its fixture is. Rows merge by `userId` and
    render flair; the dialog saves through the mutation.
13. **Add the group members card to the admin sessions panel.** Beside the standing notes,
    inside the selected group's scope: the shared roster row per member, fed from
    `get_product_groups_with_details`, with the note button live against the same write RPC
    and the same invalidations the other two surfaces use. No newcomer badge, and no game
    username editor. `src/components/admin/products/groups/` is untouched by this plan.
14. Unit tests for the wiring. **No locale work**: the namespace is complete, and the key
    the losing indicator needed is already gone from all five files.
15. Lint, type-check, `npm run test`. Merge to `dev` (`--no-ff`, subject `Merge the member
    flair into dev`) and release via `/pr-dev-to-main`.
16. **Delete this file**, and propose the follow-ups below to the owner by headline — only
    the ones they name go into `TODO.md`.

---

## Acceptance criteria

- A participation gaining a group is stamped; a move between groups of one product
  re-stamps; losing the group (including by group deletion) clears the stamp. No other
  write to `participations` touches it.
- Every pre-existing participation row has `group_joined_at IS NULL` after the migration,
  and nothing badges on launch day.
- A Gedu and an admin see the newcomer badge on club products on **both** badge surfaces —
  the gedu product details roster and the voice room participant list — its pip meter
  draining across the 30-day window and the badge gone after it; neither sees it on a camp
  or an event, and neither sees it on any admin surface.
- An admin can read and write a member's note from the group members card in the admin
  sessions panel, and an edit made there shows up on the gedu page and in the voice room —
  and the reverse — because all three go through one write RPC and one set of invalidations.
  The admin groups panel is unchanged and draws neither mark.
- A parent, a gamer, and an unauthenticated caller can reach neither the badge data nor a
  note: the overlay RPC refuses them `42501`, and the roster RPCs are already staff-only.
- No staff-only value appears anywhere in a Daily token, `user_name`, or any other channel
  broadcast to peers.
- A Gedu assigned to **any** group of a product can read and write the note for a member of
  **any** group of that product; a Gedu on another product cannot; an admin has parity.
- A note written in group A stays in group A when the member is moved to group B, and B
  starts empty.
- Saving an empty note deletes the row; the indicator disappears on every surface without a
  reload, through query invalidation.
- Writing a note about somebody who does not sit in the group is refused.
- Editing a note in the voice room updates the gedu page, and the reverse.
- No layout shift when the overlay lands in the voice room — and it holds by construction,
  not by timing: the newcomer badge is the last item on the identity line, and the note
  button is the left edge of the right-packed trailing group, so both grow into the row's
  slack and nothing already painted moves. Reordering either reintroduces the shift.
- No button re-enables between a save click and the dialog closing.
- `npm run lint`, `npm run type-check`, `npm run test` clean; CI's db suite green,
  including the spine's completeness checks and the write-IDOR loop's equality assertion.
- No new API route, and the route posture registry is untouched.

---

## Review

A migration and two surfaces — so: **one challenge, then one
cold-read**, one round each, both to fresh agents with no conversation context, both on the
strong-but-cheaper tier rather than the driver's. Challenge first (is this only what v1
needs?), then the cold-read (can this be built from the document alone?). Do not loop.

---

## Follow-ups (cut from v1; proposed to the owner by headline when this plan is deleted)

- **A note on the family-facing side** — nothing here is ever shown to a parent, and no
  requirement says it should be. If one ever does, it is a different field with a different
  audience, not a visibility flag on this one.
- **Note history / who-wrote-what over time.** Only the last editor is stored. An audit
  trail is a second table and was not asked for.
- **Orphan cleanup or an orphan-notes admin view.** Notes left behind by a member who moved
  are an accepted leftover; a surface for them is a feature nobody has requested.
- **A newcomer count on the group card** ("3 new this month") — a plausible dashboard
  signal, and entirely separable from the badge.
- **Membership history** (one row per group-membership episode), which would make "when did
  they join, and what before that" answerable and would supersede the single stamp.
