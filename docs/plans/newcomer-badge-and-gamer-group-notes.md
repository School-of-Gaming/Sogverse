# Newcomer badge and Gedu gamer notes

Two staff-only marks that tell a Gedu what they need to know about a member before the
session starts: a **newcomer badge** that drains a pip meter across a member's first month in a group,
and a **per-(group, member) plain-text note** any Gedu on the product can read and write.

Both are visible to **Gedus and admins only**, on three surfaces: the gedu product details
page roster, the voice room participant list, and the admin product details groups panel.

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
know `product_type`, render the badge only for club products". Two of the three surfaces do
know it — the gedu page has `data.product.product_type`, the admin panel is inside a
product details page. **The voice room does not.** `/voice/group/[id]` is passed only a
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

The three surfaces are owned by three different services — `assignments` (the gedu product
page's `get_gedu_assigned_product`), `gedu-sessions` (the group feed), `groups` (the admin
snapshot) — plus `voice`, which owns none of them. Putting the overlay read and the note
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
`authenticated` may UPDATE or DELETE". `gamer_group_notes` grants `authenticated` **SELECT
and nothing else** (writes go through the RPC, which bypasses RLS), so the loop's
completeness check will neither demand nor accept an entry for it — adding one would fail
the equality assertion.

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
15. **`ParticipantList` is where a room-wide lookup belongs**, not `ParticipantRow` — the
    list already owns the batched Roblox render lookup for exactly this reason, and its
    header explains why a hook per row is wrong.
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
- Two SELECT policies and **no write policy**, because there is no write grant for one to
  authorize: admins (`(SELECT public.is_admin())`) and Gedus on the product
  (`(SELECT public.gedu_teaches_group_product(group_id))`). Wrap each predicate in
  `(SELECT …)` so it is an InitPlan evaluated once per statement, matching `00201`.
- Grants: `GRANT SELECT ON TABLE public.gamer_group_notes TO authenticated;` and
  `GRANT ALL … TO service_role;`. Nothing for `anon`.
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
comment says so. It is called from inside the two `SECURITY DEFINER` RPCs and from the
table's RLS policies. Its comment should state the relationship to `gedu_teaches_group`
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
- `gamer_group_notes` has RLS enabled, exactly the expected grants for `authenticated`
  (SELECT only — assert the *absence* of INSERT/UPDATE/DELETE explicitly, since that
  absence is what keeps the table off the write-IDOR loop), and its length CHECK;
- both new RPCs have `assert_role` as their first statement (grep `prosrc`, as `00201`
  does), are executable by `authenticated`, and are **not** executable by `anon`;
- `gedu_teaches_group_product` is **not** executable by `authenticated`;
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
  inside a container already at its final size — no skeleton, no spinner, no delay. The
  flair simply appears when it lands, which is the same "nothing outlives this change"
  case the layout rule permits.
- `index.ts` — the barrel.

**Invalidation on a successful note save** (`onSuccess`), every one of them needed because
four different documents can be showing the same note:

```
memberFlairKeys.overlay(groupId)   // the voice room
geduSessionKeys.feed(groupId)      // the gedu group feed roster
assignmentKeys.all                 // the gedu product page document
groupsKeys.all                     // the admin groups snapshot
```

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

**A consequence worth stating: the note's *text* never reaches a row.** The inline candidate
was the only one that needed it, so the roster read and the voice room's staff overlay carry
a flag per member and nothing more. The dialog is mounted by the page and seeds its draft
from the overlay's note map.

### The voice room shows the note only on seat holders

**A room is not a roster.** A voice call contains the group's members *and* the Gedu running
the session, anyone covering with them, and any admin who has dropped in. A note is keyed to
`(group, participant)` and the write RPC refuses a target who does not currently sit in that
group — so a note button on a Gedu's own row is an affordance whose save can only fail. The
staff overlay the room fetches therefore carries **the group's seat-holder ids** beside its
notes and join stamps, and the participant list renders the button only for those. Gating on
the row's role instead would be wrong in a real case: a Gedu can hold a seat in another
group, and the question is membership of *this* one. The gedu product page needs no such gate
— its roster is seat holders by construction.

### Where the marks sit on a row

**Order: the name, then the person's own detail, then the newcomer badge, then the Parent
badge.** The middle slot is whatever that surface uses to say who this is — the child's age
and gender on the gedu roster, their game username in the voice room — and it is empty on an
adult's row, since a parent has neither. So the badge lands after the detail on a child's row
and directly after the name on an adult's, and always before the Parent badge. One rule, both
surfaces. The note button is at the far end of the row on both, past the status icons.

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

`ParticipantSessionRow` is an alias of `GeduAssignedProductRosterEntry`, so the three new
fields arrive on the roster rows with no plumbing once the contract and the interface
carry them. The row renders:

- `NewcomerBadge` when `showsNewcomerBadge(product.product_type)` **and**
  `newcomerPresence(entry.group_joined_at, now)` is non-null. The badge sits on the identity
  line and must not move anything already painted — the field arrives in the same payload
  as the name, so nothing shifts after paint, which is the same argument the adult-variant
  row already makes.
- the chosen note indicator when `entry.note` is non-null, and a click target that opens
  `GamerNoteDialog` with `{ name, note, lastEditedBy: entry.note_updated_by_first_name,
  onSave }`.
- `onSave` calls `useSetGamerGroupNote`. The dialog already holds its own `committing`
  flag and awaits the save, so pass the mutation's promise through and do not re-enable on
  `isPending`.

### Voice room (`src/components/voice/`)

- **`ParticipantList` owns the fetch**, not `ParticipantRow` — the same argument the list's
  header already makes about the batched Roblox lookup. Call
  `useGroupStaffOverlay(groupId, { enabled: groupId !== null && isModerator })`, both read
  from `useVoiceRoom()`. `groupId === null` is an instant room and has no group to ask
  about; `isModerator` is the client's copy of the token's `is_owner` and is used **only to
  avoid firing a request that would be refused** — the RPC's `42501` is the actual boundary.
- Merge into each row by `userId`, which is `profiles.id` (the token sets `user_id` to it,
  which is what `canReceive.byUserId` already keys on).
- Gate the badge on `showsNewcomerBadge(overlay.product_type)`.
- The row's identity slot keeps its fixed geometry — the flair must not change a row's
  height when the overlay lands. Give it a place that is already sized, exactly as the game
  figure box is.
- The note dialog opens from the row and saves through the same mutation.
- **Nothing about this rides the Daily token.** Do not add a slot to `user_name`.

### Admin product details groups panel (`src/components/admin/products/groups/`)

`ParticipantChip` gains the badge and the indicator from the widened
`GroupParticipationDetail`. The panel knows the product type from the page around it, so
`showsNewcomerBadge` is a direct call. The unassigned and waitlist cards render the same
chip and will receive NULLs, which draws nothing — that is the correct outcome, and it is
why the three arms keep one shape.

### Preview scenes

The gedu-product scene and any voice scene keep feeding the same props from fixtures. A
fixture id that feeds an identicon **must be a real generated UUID hardcoded as a literal**
— a readable stand-in renders a degenerate avatar and makes the demo a false picture.

### Locale strings

The `memberFlair` namespace is already being added in the parallel UI work
(`newcomer`, `newcomerTooltip`, `hasNote`, `openNote`, `noteTitle`, `notePrivacy`,
`notePlaceholder`, `noteLastEdited`). Additional strings this phase may need, all decided
*with* the indicator choice:

- an **empty-state affordance label** if the chosen indicator doubles as an "add a note"
  control on members who have none (`memberFlair.addNote`);
- a **save-failure line** if the surfaces want copy more specific than `common.unexpectedError`.

Anything added goes into **all five** locale files (`en`, `fi`, `sv`, `fr`, `tlh`) in the
same change, with no emoji — a glyph is a `lucide-react` icon rendered beside the
translated text.

---

## Tests

### DB (`tests/db/`, CI only — there is no local Postgres, so exercise these by pushing the branch)

**New: `tests/db/member-flair.test.ts`.**

*The trigger:*
- inserting a participation with a `group_id` stamps `group_joined_at`;
- inserting with `group_id NULL` leaves it NULL;
- moving between two groups of the same product **re-stamps** (strictly greater than the
  previous value);
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
- a second Gedu on the product overwrites it and becomes the named editor;
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
it and confirm the write-IDOR completeness check still balances (it should: no write grant,
no entry).

### Unit (`tests/unit/`)

- `member-flair-newcomer.test.ts` already covers `newcomerPresence`. Extend it with
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
11. Promote the gedu product page: live shell passes real roster fields into the same props
    the scene feeds.
12. Promote the voice room: `ParticipantList` fetches the overlay and merges by `userId`;
    rows render flair; the dialog saves through the mutation.
13. Promote the admin groups panel chip.
14. Locale strings for anything the chosen indicator needs, in all five files.
15. Unit tests for the wiring.
16. **Take the note-indicator question to the owner** with the scenes open. Ship the choice.
17. Lint, type-check, `npm run test`. Merge to `dev` (`--no-ff`, subject `Merge the member
    flair into dev`) and release via `/pr-dev-to-main`.
18. **Delete this file**, and propose the follow-ups below to the owner by headline — only
    the ones they name go into `TODO.md`.

---

## Acceptance criteria

- A participation gaining a group is stamped; a move between groups of one product
  re-stamps; losing the group (including by group deletion) clears the stamp. No other
  write to `participations` touches it.
- Every pre-existing participation row has `group_joined_at IS NULL` after the migration,
  and nothing badges on launch day.
- A Gedu and an admin see the newcomer badge on club products on all three surfaces, fading
  across 30 days and gone after; neither sees it on a camp or an event.
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
- Editing a note in the voice room updates the gedu page and the admin panel, and the
  reverse.
- No layout shift when the overlay lands in the voice room; no button re-enables between a
  save click and the dialog closing.
- `npm run lint`, `npm run type-check`, `npm run test` clean; CI's db suite green,
  including the spine's completeness checks and the write-IDOR loop's equality assertion.
- No new API route, and the route posture registry is untouched.

---

## Review

A migration and three surfaces — so: **one challenge, then one
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
