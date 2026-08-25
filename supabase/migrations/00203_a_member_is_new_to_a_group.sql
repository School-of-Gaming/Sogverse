-- A member is new to a group, and a gedu can write down what they learn.
--
-- WHY
--
-- A gedu walking into a session cannot tell, from any surface the platform
-- gives them, which children are new to the group and which they have already
-- met. A club that gained a member in week six looks exactly like one that has
-- run with the same eight since September, so the child who most needs a
-- welcome is the one least likely to get one. The same gedu also has nowhere to
-- put what they learn — what settled a child last week, who they should not be
-- paired with, what a parent said at drop-off. `product_groups.gedu_note`
-- exists but is about the GROUP; there is nothing about a PERSON IN a group.
--
-- This migration lays both facts down, and nothing else:
--
--   * `participations.group_joined_at` — when this seat entered its CURRENT
--     group. One timestamp, stamped by a trigger, read by a badge.
--   * `gamer_group_notes` — one row per (group, member): plain text, its last
--     editor, and no history.
--
-- Both are STAFF-ONLY data about children. Neither may reach a family surface
-- or a peer in a voice room, which is what decides every access choice below.
--
-- WHY A TRIGGER AND NOT `apply_group_changes`
--
-- `apply_group_changes` is not the only writer of `participations.group_id`.
-- `promote_from_waitlist` sets it, `demote_to_waitlist` clears it, the
-- `admin_full_access_participations` policy is FOR ALL so an admin client can
-- UPDATE the column directly — and the FK is ON DELETE SET NULL, so deleting a
-- group rewrites the column on every member row through no function at all.
-- Stamping at one call site would be correct for one of at least five paths and
-- silently wrong for the rest: a promoted member would carry no badge, and a
-- member whose group was deleted would keep a stamp naming a group that no
-- longer exists. A BEFORE trigger is the only point that sees all of them,
-- including the cascade. There is direct precedent on this exact table —
-- `trg_validate_participations_group` is already a BEFORE INSERT OR UPDATE OF
-- trigger enforcing a cross-column invariant, and the new one sits beside it.
--
-- The cost of a trigger is that the stamp is invisible at the call site. That
-- is paid down with a column comment and a table comment, which is where a
-- reader of `schema.sql` will look for it.
--
-- WHY THERE IS NO BACKFILL, AND WHY THAT IS A DECISION
--
-- Every existing row keeps `group_joined_at IS NULL`, so launch day is quiet:
-- only joins that happen after this migration ever badge. There is no honest
-- source for a historical join date — a group move leaves no trace today — and
-- deriving one from `signed_up_at` would badge a large slice of the platform
-- with a claim that is false for exactly the members a gedu would be most
-- surprised to see badged. The end-state block asserts the column is still
-- entirely NULL, so the absence stays a decision rather than becoming an
-- oversight somebody later "fixes".
--
-- WHY THE NOTES TABLE HAS RLS ON AND NO POLICY AT ALL
--
-- Nothing reads or writes `gamer_group_notes` over the Data API. Every read
-- either rides one of the three roster documents or goes through
-- `get_group_staff_overlay`; every write goes through `set_gamer_group_note`.
-- All of those are SECURITY DEFINER and bypass RLS, so a policy here would
-- authorize a query nobody makes. RLS enabled with no policy is deny-all to
-- anyone who reaches the table, which is the strongest posture available and
-- the one that matches how the table is actually used. `authenticated` and
-- `anon` hold no grant of any kind on it.
--
-- That absence is not tidiness — it is what keeps `gedu_teaches_group_product`
-- private, and the two facts are one decision. An RLS policy predicate is
-- evaluated as the QUERYING role, so a function a policy names must be
-- EXECUTE-able by that role; SECURITY DEFINER decides whose privileges apply
-- inside the body, never who may call it. A SELECT policy on this table calling
-- that predicate would therefore have forced a GRANT EXECUTE TO authenticated,
-- turning an internal predicate into an exposed function needing an
-- authorization-spine entry — and contradicting this file's own end-state
-- assertion that it is not granted. The schema already draws the line both
-- ways: `is_voice_group_moderator` IS granted to `authenticated` precisely
-- because the voice policies name it, and `gedu_teaches_group` is granted to
-- `service_role` alone and appears in no policy.
--
-- WHY A NEW PREDICATE RATHER THAN `is_voice_group_moderator`
--
-- `is_voice_group_moderator` already computes exactly the question the two new
-- RPCs ask — admin, or a gedu assigned to any group of the product — so the
-- duplication below is deliberate and worth naming. Two reasons it is not
-- reused. Its name would make a note read look like a voice concern; and it is
-- referenced by the `voice_zones` and `voice_private_zone_occupants` policies,
-- so it cannot be renamed cheaply and must not be disturbed by this work.
-- `gedu_teaches_group_product` is instead a neutrally-named GEDU-ONLY predicate
-- composed with `is_admin()` at each call site — which is the dominant pattern
-- in this schema (`gedu_teaches_group` is gedu-only and every caller composes
-- it) — and voice is left exactly as it stands.
--
-- WHY THREE READERS ARE RECREATED
--
-- The badge and the note ride documents three different surfaces already read,
-- so widening those documents costs no extra round trip on any of them. Each
-- body below is copied from `supabase/schema.sql` — the current definition,
-- which may already have superseded the migration that first wrote it — with
-- the same three fields added and nothing else changed. Each function's guard,
-- comment and grants are carried forward verbatim and re-asserted at the foot.
--
-- One thing is deliberately NOT changed while retyping them: two of the three
-- carry `SET search_path TO 'public'` with unqualified table references rather
-- than the current `SET search_path TO ''` default. Converting them is a
-- separate change with its own risk — a single missed reference fails at call
-- time rather than at apply time — and it does not belong in a migration whose
-- job is to add three fields. The new objects in this file all use `TO ''` with
-- fully-qualified names, and every reference this file ADDS to an old body is
-- fully qualified too, so nothing here depends on the looser setting.

-- ---------------------------------------------------------------------------
-- 1. The clock, and the one thing that winds it
-- ---------------------------------------------------------------------------

ALTER TABLE public.participations
  ADD COLUMN group_joined_at timestamptz;

COMMENT ON COLUMN public.participations.group_joined_at IS
  'When this seat entered its CURRENT group. NULL when the seat holds no group, '
  'and NULL for every row that predates the column — there was deliberately no '
  'backfill, because a group move leaves no trace and signed_up_at is not a '
  'join date for anyone who has ever been moved. A move between two groups of '
  'one product RESETS it: the member is new to THAT group, which is the whole '
  'claim the newcomer badge makes. Stamped only by '
  'trg_participations_stamp_group_joined_at, which is the column''s only '
  'writer — no RPC and no policy-driven UPDATE sets it, because group_id has at '
  'least five writers (including the ON DELETE SET NULL cascade from '
  'product_groups) and a trigger is the only point that sees all of them.';

COMMENT ON TABLE public.participations IS
  'One row per seat on a product: who holds it, who pays for it, which group '
  'they sit in and what state the seat is in. Some of its columns are settled '
  'by triggers rather than by any caller, and are therefore invisible at the '
  'call site: updated_at is touched on every write, product_id is reconciled '
  'against the group''s product by trg_validate_participations_group, and '
  'group_joined_at is stamped by trg_participations_stamp_group_joined_at '
  'whenever group_id is set, changed or cleared — group_id has at least five '
  'writers, including the ON DELETE SET NULL cascade from product_groups, which '
  'is why the stamp lives in a trigger and not in an RPC. Do not set '
  'group_joined_at by hand.';

CREATE FUNCTION public.stamp_participation_group_joined_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
BEGIN
  -- No group, no join. The ON DELETE SET NULL cascade from product_groups lands
  -- here too, which is the path no function would ever have covered: deleting a
  -- group rewrites group_id on every member row with nothing in between. A
  -- member with no group is not new to anything.
  IF NEW.group_id IS NULL THEN
    NEW.group_joined_at := NULL;

  -- IS DISTINCT FROM rather than <>, so a NULL on either side counts as a
  -- change: a seat moving from no group into one is exactly the case <> would
  -- miss. An UPDATE that does not NAME group_id never fires this trigger at
  -- all, so an unrelated write — a status change, the updated_at touch — cannot
  -- re-stamp; an UPDATE that names it with the value it already held does fire,
  -- and this comparison is what makes that a no-op.
  ELSIF TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    -- now(), not clock_timestamp(). This is a display timestamp with no
    -- cross-row ordering semantics — the same case as signed_up_at beside it.
    -- Two moves inside one transaction therefore stamp identically, which is
    -- correct: they are one decision.
    NEW.group_joined_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_participation_group_joined_at() IS
  'Trigger function: keep participations.group_joined_at in step with '
  'group_id. Sets it to now() when a seat enters a group or moves to a '
  'different one, clears it when the seat leaves a group (including via the ON '
  'DELETE SET NULL cascade from product_groups), and leaves it alone otherwise. '
  'The column has no other writer.';

-- BEFORE row triggers fire in name order, so this one runs ahead of
-- trg_validate_participations_group. They do not interact — the validator reads
-- group_id and product_id and never touches this column.
CREATE TRIGGER trg_participations_stamp_group_joined_at
  BEFORE INSERT OR UPDATE OF group_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_participation_group_joined_at();

-- A trigger function is never reached through the Data API — calling one
-- outside trigger context is an error whatever the grants say — so it takes no
-- EXECUTE grant and needs no authorization-spine entry. The REVOKE is still
-- load-bearing: a created function comes back PUBLIC-executable, and this file
-- does not leave one that way.
REVOKE EXECUTE ON FUNCTION public.stamp_participation_group_joined_at() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. The notes
-- ---------------------------------------------------------------------------

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

COMMENT ON TABLE public.gamer_group_notes IS
  'One row per (group, member): what the staff running that group need to know '
  'about that person before the session starts. Plain text, not markdown — a '
  'note is read in the box it was typed in, and offering headings would invite '
  'composing a document rather than jotting. Strictly keyed to the group, so a '
  'note does NOT follow a member who is moved: it is about how THIS group is '
  'going, and half of them would be stale or actively misleading in the next '
  'one. A member who leaves the group leaves their row behind, unreachable from '
  'every surface (all of them render the group''s active roster) and refused by '
  'the write RPC''s target check — an ACCEPTED leftover, not an oversight, and '
  'deliberately not cleaned up. Deleting the GROUP does delete the note, by FK. '
  'No Data API role holds a grant on this table and RLS is on with no policy at '
  'all: every read rides a roster document or get_group_staff_overlay, every '
  'write goes through set_gamer_group_note, and all of those are SECURITY '
  'DEFINER. Absence of a row is what "no note" means everywhere.';

COMMENT ON COLUMN public.gamer_group_notes.group_id IS
  'The group the note is filed under. ON DELETE CASCADE — a note belongs to the '
  'group, so deleting the group deletes it. This is the one orphan case that IS '
  'cleaned up, and the FK is what cleans it.';

COMMENT ON COLUMN public.gamer_group_notes.participant_id IS
  'The person the note is about — whoever holds the seat, adult or child, the '
  'same subject participations.participant_id names. References profiles rather '
  'than participations so a seat rewritten in place does not take the note with '
  'it; membership is asserted by the write RPC''s target check instead.';

COMMENT ON COLUMN public.gamer_group_notes.updated_by IS
  'Who last wrote it, surfaced to other staff as "Last edited by {first name}". '
  'ON DELETE SET NULL: a departed gedu''s account must not delete the note they '
  'wrote — the note stands and the read simply shows no editor line. There is '
  'no history here; only the last editor is stored.';

ALTER TABLE public.gamer_group_notes ENABLE ROW LEVEL SECURITY;

-- The updated_at touch is the same trigger participations uses, rather than a
-- hand-set column inside the RPC: one writer for one derived value.
CREATE TRIGGER gamer_group_notes_updated_at
  BEFORE UPDATE ON public.gamer_group_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- `service_role` and nothing else. Not a narrowing of some default — there is
-- no default; an ungranted table is unreachable, which is the whole access
-- story here. The DB suite asserts against this table through the admin client,
-- which is what the service_role grant is for. Nothing for `authenticated`,
-- nothing for `anon`: with no write grant the table is correctly absent from
-- the write-IDOR loop's completeness check, and the write-IDOR REQUIREMENT is
-- met one layer up, by set_gamer_group_note authorizing actor and target.
GRANT ALL ON TABLE public.gamer_group_notes TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The predicate
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
  -- One join, because gedu_group_assignments carries product_id alongside
  -- group_id: "any group of this group's product" is a single-table EXISTS
  -- rather than a walk back through products.
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) IS
  'Internal predicate: is the caller a gedu assigned to ANY group of this '
  'group''s product? The same question gedu_teaches_group asks, widened from '
  'one group to the whole product — which is the cross-group mobility the '
  'member-flair RPCs need, because a substitute standing in for another group '
  'is exactly the person who needs the note. Gedu-only and composed with '
  'is_admin() at each call site, the dominant pattern in this schema. NOT '
  'exposed to authenticated: it is called from inside SECURITY DEFINER RPCs and '
  'from nowhere else — in particular from no RLS policy, which is what lets it '
  'stay private, since a policy predicate is evaluated as the querying role and '
  'would have forced a grant. is_voice_group_moderator computes the same thing '
  'with is_admin() folded in; it is deliberately left alone rather than reused '
  'or renamed, because the voice_zones and voice_private_zone_occupants '
  'policies reference it and its name would make a note read look like a voice '
  'concern.';

REVOKE EXECUTE ON FUNCTION public.gedu_teaches_group_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_teaches_group_product(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The staff overlay read
-- ---------------------------------------------------------------------------
--
-- The voice room's route to both marks. Staff-only data must never ride the
-- Daily token or `user_name` — that channel is broadcast to every peer in the
-- room, children included — so the room asks for the overlay separately, with
-- the staff member's own session, once per room. Families and gamers never call
-- it and are refused 42501 if they do, which makes visibility a matter of DATA
-- ACCESS rather than a viewer prop a later refactor could drop.

CREATE FUNCTION public.get_group_staff_overlay(p_group_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright; a gedu has to teach some
  -- group of this group's product.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The product type travels because the voice room has NO other route to it:
  -- /voice/group/[id] is passed a group id and a back link, VoiceRoomContext
  -- carries groupId and isModerator, and the token deliberately puts nothing
  -- staff-shaped on itself. The newcomer badge is a clubs-only PRESENTATION
  -- rule and the join stamp is a FACT, so the fact is emitted unconditionally
  -- and the client applies the rule — one shared helper instead of the same
  -- decision baked into four RPCs.
  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- One entry per ACTIVE participation of the group, note or no note, stamp or
  -- no stamp — the same map shape get_gedu_group_feed already uses for
  -- attendance. So the map's own keys name exactly the people a note may be
  -- written about, which is the seat-holder set the room needs; a separate ids
  -- array would be a second list of the same people to keep true. A participant
  -- id absent from the map — a visiting admin, the gedu themselves, a stale
  -- peer — simply gets no flair.
  --
  -- Neither join can fan a row out: gamer_group_notes is keyed on exactly
  -- (group_id, participant_id) and profiles.id is a primary key.
  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at',            part.group_joined_at,
           'note',                       n.note,
           'note_updated_by_first_name', ed.first_name
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id       = part.group_id
          AND n.participant_id = part.participant_id
    LEFT JOIN public.profiles ed ON ed.id = n.updated_by
   WHERE part.group_id = p_group_id
     AND part.status   = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;

COMMENT ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) IS
  'The staff-only marks for one group''s active roster, in one document: '
  'product_type, and a map keyed by participant id whose entries carry '
  'group_joined_at, note and note_updated_by_first_name. Open to an ADMIN or to '
  'any gedu assigned to any group of the group''s product, guard-first on '
  'assert_role with the ownership question as a second 42501 — the same shape '
  'set_group_notes uses. Built for the voice room, which has no other route to '
  'either mark: staff-only data must never ride the Daily token or user_name, '
  'because that channel is broadcast to every peer including children. A '
  'refused caller means the flair is gated by data access rather than by a '
  'viewer prop. product_type is on the document because the room knows only a '
  'group id, and the clubs-only newcomer rule is applied client-side from it. '
  'Every active member appears whether or not they have a note, so the map''s '
  'keys are the seat-holder set. An unknown group id returns a null-shaped '
  'document to an admin rather than raising.';

-- authenticated only. No service_role grant: nothing server-side reads this,
-- and a document whose entire meaning is "what may THIS staff member see" has
-- no sensible service-role caller. The REVOKE closes the PUBLIC-executable
-- window a created function comes back with.
REVOKE EXECUTE ON FUNCTION public.get_group_staff_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_staff_overlay(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The note write
-- ---------------------------------------------------------------------------

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

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate — refusing a substitute
  -- standing in for another group would make the feature useless in the one
  -- situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: a note may only be written about somebody who sits in the
  -- group it is filed under. Without this an authorized gedu could file a note
  -- against any profile id on the platform. The table carries no write grant,
  -- so it is correctly outside the write-IDOR loop's completeness check — these
  -- two checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- ANY status counts, not just active: a note about somebody on the group's
  -- waitlist is a coherent thing to write, and narrowing it buys nothing. What
  -- it does exclude is a member who has LEFT the group, which is why an
  -- orphaned note cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- A trimmed-empty save DELETES the row. Clearing a note is how a gedu retires
  -- guidance that no longer applies, and the absence of a row is what "no note"
  -- means on every surface — so the empty save has to produce that absence
  -- rather than an empty string standing in for it. The returned document is
  -- the null shape, so a caller merges the same keys either way.
  IF v_note IS NULL THEN
    DELETE FROM public.gamer_group_notes
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',                   p_group_id,
      'participant_id',             p_participant_id,
      'note',                       NULL,
      'note_updated_by_first_name', NULL,
      'updated_at',                 NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history: only the last editor is stored.
  -- updated_at is left to the touch trigger. Length is NOT checked here — the
  -- CHECK refuses anything over 2000 with 23514, and since the dialog caps at
  -- 2000 a longer write can only come from a non-UI caller, which deserves a
  -- loud refusal rather than a silent truncation.
  INSERT INTO public.gamer_group_notes AS n
         (group_id, participant_id, note, updated_by)
  VALUES (p_group_id, p_participant_id, v_note, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET note       = EXCLUDED.note,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'note',           v_row.note,
    -- Resolved at read time on purpose, unlike the signed-name snapshot on a
    -- contract acceptance: this line answers "who should I ask about this
    -- note", so the name they go by today is the right answer. NULL when the
    -- editor's account is gone (updated_by is ON DELETE SET NULL), and the
    -- surface then shows the note with no editor line.
    'note_updated_by_first_name',
      (SELECT pr.first_name FROM public.profiles pr WHERE pr.id = v_row.updated_by),
    'updated_at',     v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) IS
  'Write, replace or clear the staff note about one member of one group, and '
  'return the resulting document (group_id, participant_id, note, '
  'note_updated_by_first_name, updated_at). Open to an ADMIN or to any gedu '
  'assigned to any group of the group''s product, with full read/write parity '
  'between the two; guard-first on assert_role, then two further 42501s — the '
  'ACTOR half (staff reach over the product) and the TARGET half (the '
  'participant actually holds a participation in that group, at ANY status). '
  'The target half is what stands in for a write-IDOR loop entry, since the '
  'table carries no write grant for any client role. A trimmed-empty note '
  'DELETES the row and returns the null-shaped document, because absence of a '
  'row is what "no note" means everywhere else. Over-long notes are refused by '
  'the table''s CHECK (23514) rather than truncated. Last-write-wins, and only '
  'the last editor is stored — there is no history. A note does not follow a '
  'member moved to another group: it stays where it was written.';

REVOKE EXECUTE ON FUNCTION public.set_gamer_group_note(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gamer_group_note(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. The three roster documents gain the same three fields
-- ---------------------------------------------------------------------------
--
-- Each body below is the current definition from `supabase/schema.sql` with one
-- change: every participation/roster object additionally carries
--
--   group_joined_at            <- participations.group_joined_at
--   note                       <- gamer_group_notes.note
--   note_updated_by_first_name <- profiles.first_name for that note's updated_by
--
-- via one LEFT JOIN on (group_id, participant_id) and a second to profiles.
-- Neither can fan a row out: the notes table is keyed on exactly that pair, and
-- profiles.id is a primary key. Everything else is verbatim, including each
-- function's guard, its search_path setting and its comment.

-- --- 6a. get_gedu_assigned_product -----------------------------------------
--
-- The roster rides on the caller's OWN group only, and that restriction stands:
-- a gedu still sees no sister group's roster from this document, and therefore
-- no sister group's notes. The shape stays in deliberate parity with
-- get_gedu_group_feed — both comments say so, and the page substitutes the
-- feed's fresher roster for this one, so a field added here and not there would
-- ship a page with no flair and no error.

CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        -- Every active seat on the group, whoever holds it. Spelled for a gamer
        -- until 00175, at which point counting an adult parent under that name
        -- became a lie the badge repeated on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check (00177) keeps
                         -- it in step with the feed: an id transposition yields
                         -- NULL rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair (00203). Emitted for every
                         -- roster row, note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) IS 'One round trip for a gedu opening a product they are assigned to: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id (00175) — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. Since 00195 the shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Since 00203 each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client.';

REVOKE EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO service_role;

-- --- 6b. get_gedu_group_feed ------------------------------------------------
--
-- The copy the gedu product page actually renders: the shell reads both RPCs
-- and substitutes this roster into the assignment document, because this is the
-- one a roster write invalidates. Widening only 6a would ship a page whose
-- flair sits on a roster that is thrown away.

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- v1 shows a gedu only their OWN group's feed. Peer-group feeds are not a
  -- schema restriction — relaxing this to "any group on a product the caller is
  -- assigned to" is a change to this predicate alone, and nothing downstream
  -- assumes the caller teaches the group they are reading.
  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel (00203): the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair (00203), in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  --
  -- Two reserved booleans were emitted here until 00151, purely so the document
  -- mirrored the table. 00151 dropped the columns; nothing replaces them. Their
  -- names are deliberately not repeated in this body — the end-state assertion
  -- at the foot of that migration greps this source for them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- 00194's field, carried through verbatim — see this migration's
        -- header. Nothing here reads it; it is the current definition of this
        -- function on the database this file is pushed to, and recreating a
        -- function preserves what it is not deliberately changing.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult), carries both game identities since 00195 (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Since 00203 each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each session row carries report_emailed_at since 00197 — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere.';

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

-- --- 6c. get_product_groups_with_details ------------------------------------
--
-- Three participation arms — grouped, unassigned, waitlist — emitting the same
-- shape on purpose. All three take the IDENTICAL LEFT JOIN expression: on a row
-- with group_id IS NULL it matches nothing and the three fields come back NULL,
-- which is the truth, and using one expression is what keeps the three shapes
-- one shape. The field names are unprefixed rather than participant_*, matching
-- status / signed_up_at / has_payment_marker beside them: these are facts about
-- the participation and the (group, member) pair, not about the person — and
-- they are then spelled the same on all three readers.
--
-- This is also the admin's route to a member note: the sessions panel's group
-- members card renders it. The newcomer badge is drawn on NO admin surface, so
-- group_joined_at rides here for shape parity rather than for a badge.

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_date_of_birth',      gprof.date_of_birth,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check (00177) makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
                     -- The staff-only flair (00203), identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — but the sessions panel's members card
                     -- renders the note from this same document.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS 'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. Since 00175 the person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Since 00195 each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row. Since 00203 all three branches also carry the staff-only flair — group_joined_at, note and note_updated_by_first_name — from one identical LEFT JOIN, which comes back NULL on the two group-less branches because that is the truth and because one expression is what keeps the three shapes one shape. The groups panel draws neither mark; the note is rendered by the group members card in the sessions panel on the same page.';

REVOKE EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op — an already-claimed version number, a grant that did not
-- take, a section lost while retyping a 200-line body — fails here rather than
-- three weeks later as an empty panel. Apply-time protection: it says what was
-- true when this migration ran, and nothing about later ones.

DO $assert$
DECLARE
  v_src  text;
  v_proc text;
  v_n    integer;
BEGIN
  -- --- (a) The clock column, and the backfill that deliberately did not happen.
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'participations'
       AND column_name  = 'group_joined_at'
       AND data_type    = 'timestamp with time zone'
       AND is_nullable  = 'YES'
  ) THEN
    RAISE EXCEPTION 'participations.group_joined_at is missing, is not timestamptz, or is NOT NULL — it must be nullable, because a seat in no group is new to nothing';
  END IF;

  -- The absence of a backfill is a DECISION (see the header), so it is asserted
  -- rather than merely left undone: there is no honest source for a historical
  -- join date, and inventing one would badge a large slice of the platform on
  -- launch day with a claim that is false.
  IF EXISTS (
    SELECT 1 FROM public.participations WHERE group_joined_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a participation already carries group_joined_at — this migration deliberately backfills nothing, so launch day is quiet';
  END IF;

  -- --- (b) The trigger: the column's only writer, and it sees every path. ---
  SELECT pg_get_triggerdef(t.oid)
    INTO v_src
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.participations'::regclass
     AND t.tgname  = 'trg_participations_stamp_group_joined_at';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'trg_participations_stamp_group_joined_at is not on participations';
  END IF;

  -- BEFORE, so the stamp lands on the row being written rather than needing a
  -- second UPDATE; INSERT OR UPDATE OF group_id, so an unrelated write cannot
  -- re-stamp and the ON DELETE SET NULL cascade still fires it.
  IF position('BEFORE INSERT OR UPDATE OF group_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'trg_participations_stamp_group_joined_at is not BEFORE INSERT OR UPDATE OF group_id — it reads: %', v_src;
  END IF;

  -- --- (c) The notes table: RLS on, no policy, and no client grant at all. --
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'gamer_group_notes'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'gamer_group_notes is missing or has RLS disabled';
  END IF;

  -- No policy at all is the intended posture, not an oversight: every read and
  -- write goes through a SECURITY DEFINER function, which bypasses RLS, so a
  -- policy would authorize a query nobody makes — and a SELECT policy naming
  -- gedu_teaches_group_product would have forced that predicate open to
  -- `authenticated`, contradicting assertion (e) below.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'gamer_group_notes';

  IF v_n <> 0 THEN
    RAISE EXCEPTION 'gamer_group_notes carries % policy/policies — it is meant to have none, which is what keeps gedu_teaches_group_product private', v_n;
  END IF;

  -- The whole access story for this table, asserted as an absence. The missing
  -- WRITE grant is also what correctly keeps it off the write-IDOR loop's
  -- completeness check, so this assertion is load-bearing in two places.
  IF has_table_privilege('authenticated', 'public.gamer_group_notes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.gamer_group_notes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.gamer_group_notes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.gamer_group_notes', 'DELETE')
  THEN
    RAISE EXCEPTION 'authenticated holds a grant on gamer_group_notes — no client role may touch this table directly';
  END IF;

  IF has_table_privilege('anon', 'public.gamer_group_notes', 'SELECT')
     OR has_table_privilege('anon', 'public.gamer_group_notes', 'INSERT')
     OR has_table_privilege('anon', 'public.gamer_group_notes', 'UPDATE')
     OR has_table_privilege('anon', 'public.gamer_group_notes', 'DELETE')
  THEN
    RAISE EXCEPTION 'anon holds a grant on gamer_group_notes — staff notes about children must be unreachable to a signed-out caller';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.gamer_group_notes', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot read gamer_group_notes — the DB suite asserts against it through the admin client';
  END IF;

  -- The length CHECK is the only thing standing between a non-UI caller and an
  -- unbounded note, since the RPC deliberately does not check length itself.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.gamer_group_notes'::regclass
       AND conname  = 'chk_gamer_group_notes_length'
       AND contype  = 'c'
  ) THEN
    RAISE EXCEPTION 'gamer_group_notes lost its length CHECK — the write RPC leaves 1..2000 entirely to it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.gamer_group_notes'::regclass
       AND c.contype  = 'p'
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname::text)
           FROM pg_attribute a
          WHERE a.attrelid = c.conrelid
            AND a.attnum   = ANY (c.conkey)
       ) = ARRAY['group_id', 'participant_id']
  ) THEN
    RAISE EXCEPTION 'gamer_group_notes is not keyed on (group_id, participant_id) — the upsert and every LEFT JOIN in this file depend on that pair being unique';
  END IF;

  -- Deleting the GROUP deletes the note; deleting the EDITOR does not. Both
  -- delete actions are decisions and both are asserted.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid   = 'public.gamer_group_notes'::regclass
       AND contype    = 'f'
       AND confrelid  = 'public.product_groups'::regclass
       AND confdeltype = 'c'  -- CASCADE
  ) THEN
    RAISE EXCEPTION 'gamer_group_notes has no ON DELETE CASCADE foreign key to product_groups — deleting a group must take its notes with it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid   = 'public.gamer_group_notes'::regclass
       AND c.contype    = 'f'
       AND c.confrelid  = 'public.profiles'::regclass
       AND c.confdeltype = 'n'  -- SET NULL
       AND (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) = 'updated_by'
  ) THEN
    RAISE EXCEPTION 'gamer_group_notes.updated_by is not ON DELETE SET NULL — a departed gedu''s account must not delete the note they wrote';
  END IF;

  -- --- (d) Both new RPCs: guard-first, and exposed to exactly one role. -----
  FOREACH v_proc IN ARRAY ARRAY['get_group_staff_overlay', 'set_gamer_group_note'] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_proc;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% was not created', v_proc;
    END IF;

    -- Role-gated in the shape the authorization spine reads: assert_role is the
    -- FIRST statement, and the ownership question comes after it.
    IF position('PERFORM public.assert_role(' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not guard on assert_role', v_proc;
    END IF;

    -- The ownership half has to be there at all — a guard that admits any gedu
    -- and then asks nothing further would let a gedu on another product read or
    -- write this group's notes.
    IF position('gedu_teaches_group_product' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not compose gedu_teaches_group_product — the role guard alone admits every gedu on the platform', v_proc;
    END IF;

    IF position('PERFORM public.assert_role(' IN v_src)
       > position('gedu_teaches_group_product' IN v_src) THEN
      RAISE EXCEPTION '% checks ownership before its role guard — the guard must be the first statement', v_proc;
    END IF;

    -- A STRICT function skips its body on NULL input, so its guard would never
    -- run. The spine forbids it outright; catching it here names the cause.
    IF EXISTS (
      SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_proc AND p.proisstrict
    ) THEN
      RAISE EXCEPTION '% is STRICT — its guard would be skipped on NULL input', v_proc;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.get_group_staff_overlay(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE get_group_staff_overlay — staff call it with their own session, and the guard is what makes that safe';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_gamer_group_note(uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE set_gamer_group_note';
  END IF;

  IF has_function_privilege('anon', 'public.get_group_staff_overlay(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_gamer_group_note(uuid, uuid, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'anon can EXECUTE a member-flair RPC — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (e) The predicate stays private. ------------------------------------
  --
  -- True now simply because nothing names it in a policy. Were a SELECT policy
  -- ever added to gamer_group_notes calling this, the policy would evaluate as
  -- the querying role and the grant would have to follow — so this assertion
  -- and the zero-policies assertion in (c) are two halves of one decision.
  IF to_regprocedure('public.gedu_teaches_group_product(uuid)') IS NULL THEN
    RAISE EXCEPTION 'gedu_teaches_group_product was not created';
  END IF;

  IF has_function_privilege('authenticated', 'public.gedu_teaches_group_product(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gedu_teaches_group_product(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'gedu_teaches_group_product is executable by a client role — it is an internal predicate called only from inside SECURITY DEFINER RPCs, and exposing it would demand an authorization-spine entry';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.gedu_teaches_group_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE gedu_teaches_group_product — it is granted exactly as gedu_teaches_group is';
  END IF;

  -- --- (f) The three readers kept their guards and took the new fields. -----
  --
  -- Each body above was retyped in full, and a lost guard or a lost section
  -- reads as an empty panel rather than as an error — which is the whole reason
  -- these assertions exist.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_assigned_product';

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product lost its assert_role(''gedu'') guard';
  END IF;

  IF position('group_joined_at' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product did not take the member-flair fields';
  END IF;

  IF position('my_group_id' IN v_src) = 0
     OR position('participant_count' IN v_src) = 0
     OR position('schedule_slots' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product lost a section while being retyped';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0
     OR position('gedu_teaches_group(p_group_id)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost its guard or its own-group check';
  END IF;

  IF position('group_joined_at' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed did not take the member-flair fields — this is the roster the gedu page actually renders';
  END IF;

  IF position('material_url' IN v_src) = 0
     OR position('attendance' IN v_src) = 0
     OR position('report_emailed_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost a section while being retyped';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_product_groups_with_details lost its assert_admin guard';
  END IF;

  IF position('group_joined_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_product_groups_with_details did not take the member-flair fields';
  END IF;

  -- Three arms, three identical joins. Counting them is the cheapest statement
  -- of "all three participation shapes stayed one shape" — a widened grouped
  -- arm beside two un-widened ones is exactly the drift the plan forbids, and
  -- it would read downstream as "this member has no note" rather than as an
  -- error.
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'gamer_group_notes', 'g');

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'get_product_groups_with_details joins gamer_group_notes % time(s) — it has three participation arms and all three must carry the identical join', v_n;
  END IF;

  IF position('unassigned' IN v_src) = 0
     OR position('waitlist' IN v_src) = 0
     OR position('has_live_subscription' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_product_groups_with_details lost a section while being retyped';
  END IF;

  -- --- (g) All three readers kept both grants and neither gained anon. ------
  FOREACH v_proc IN ARRAY ARRAY[
    'public.get_gedu_assigned_product(uuid)',
    'public.get_gedu_group_feed(uuid)',
    'public.get_product_groups_with_details(uuid)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE')
    THEN
      RAISE EXCEPTION '% lost an EXECUTE grant during recreation', v_proc;
    END IF;

    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon — the REVOKE FROM PUBLIC did not take', v_proc;
    END IF;
  END LOOP;
END
$assert$;
