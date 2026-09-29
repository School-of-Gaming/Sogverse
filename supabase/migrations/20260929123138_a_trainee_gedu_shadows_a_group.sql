-- A trainee gedu shadows a group.
--
-- WHAT THIS ADDS
--
-- A new gedu learns the job by shadowing a club before they are ready to run
-- one. Until now the only ways to put them in the room were to assign them
-- fully, which hands over every staff power, or to give them a gamer account.
-- A TRAINEE SEAT is the third way: an admin places a gedu on one group as a
-- trainee, and the trainee opens the same workspace an assigned gedu opens,
-- with what a gamer on that group could see and do.
--
-- 1. `gedu_group_trainees`, one row per trainee seat, shaped like
--    `gedu_group_assignments` — (group_id, gedu_id, product_id, created_at),
--    one seat per (gedu, product) — so a later feature can read it as a second
--    source of seats. A trigger holds three rules: the product matches the
--    group's, the seat-holder is a gedu, and nobody holds an assignment and a
--    trainee seat on one product (enforced from both tables).
-- 2. `gedu_trains_group(uuid)` — does the caller hold a trainee seat on this
--    group. Internal, like `gedu_teaches_group`.
-- 3. `apply_group_changes` takes trainee seats to add and to remove, so the
--    groups panel places, removes and PROMOTES a trainee (remove the trainee
--    seat, add an assignment) in its one transaction.
-- 4. Reads: the trainee's own workspace document (`get_trainee_group_feed`)
--    and product document (`get_trainee_assigned_product`), redacted twins of
--    the gedu ones; trainee seats on My SOG as a third kind of seat; the
--    group's trainees on the staff workspace and the admin groups panel.
-- 5. The voice room and its chat admit a trainee to their OWN group, never as
--    a moderator, and the chat roster tells a moderator who is a trainee.
--
-- WHY A TABLE OF ITS OWN
--
-- Every staff gate in the schema reads `gedu_group_assignments` and treats any
-- row there as full staff: the workspace, the notes, the register, the photos,
-- the report mail, voice moderation, invoicing, substitutions. A trainee seat
-- in that table would have to be excluded from each of them, and a gate that
-- forgot would open. In a table of its own it is closed to every one of them
-- by default, and admitted only where this migration says so.
--
-- WHAT A TRAINEE SEES
--
-- Certification decides nothing here: any gedu may be placed, certified or
-- not. The trainee's documents carry what the group's families are shown plus
-- the material link and the roster's first names, ages, genders and game
-- accounts. They never carry a staff note, a contact address, the register,
-- a note's text, a photo-consent answer or a substitution. Families are never
-- told a trainee is there, and invoicing does not see trainee seats.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.gedu_group_trainees (
    group_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gedu_group_trainees_pkey PRIMARY KEY (group_id, gedu_id),
    CONSTRAINT gedu_group_trainees_gedu_id_product_id_key UNIQUE (gedu_id, product_id),
    CONSTRAINT gedu_group_trainees_group_id_fkey FOREIGN KEY (group_id)
      REFERENCES public.product_groups(id) ON DELETE CASCADE,
    CONSTRAINT gedu_group_trainees_gedu_id_fkey FOREIGN KEY (gedu_id)
      REFERENCES public.profiles(id) ON DELETE RESTRICT,
    CONSTRAINT gedu_group_trainees_product_id_fkey FOREIGN KEY (product_id)
      REFERENCES public.products(id) ON DELETE CASCADE
);

CREATE INDEX idx_gedu_group_trainees_product
  ON public.gedu_group_trainees USING btree (product_id);

COMMENT ON TABLE public.gedu_group_trainees IS 'Trainee seats: a gedu placed on one group to shadow it before they are ready to run one. Shaped like gedu_group_assignments — (group_id, gedu_id, product_id, created_at), one seat per (gedu, product) — so a later reader can treat it as a second source of seats. Deliberately NOT a value of gedu_group_assignments.role: every staff gate reads that table and treats any row as full staff, so a trainee kept out of it is closed to all of them by default. A trainee is admitted only where a function asks gedu_trains_group: their own workspace and product documents, and their own group''s voice room and chat as a non-moderator. Independent of certification. A gedu holds an assignment or a trainee seat on a product, never both, which a trigger on each table enforces. Written only by apply_group_changes. An admin reads every row and a gedu their own; the group''s assigned gedus learn a trainee''s first name through their workspace document, and no family path reaches this table.';

-- The product-consistency trigger the assignments table runs, shared: its
-- message names whichever table it fired on.
CREATE OR REPLACE FUNCTION public.validate_gedu_assignment_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_group_product_id UUID;
BEGIN
  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_id IS NULL THEN
    NEW.product_id := v_group_product_id;
  ELSIF NEW.product_id <> v_group_product_id THEN
    RAISE EXCEPTION '%.product_id % does not match group %''s product_id %',
      TG_TABLE_NAME, NEW.product_id, NEW.group_id, v_group_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_gedu_trainee_product
  BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_trainees
  FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();

-- One seat per gedu per product, across both tables. Named to sort after the
-- product triggers, which fill in a missing product_id before this reads it.
CREATE FUNCTION public.validate_one_gedu_seat_per_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Two transactions writing one pair into the two tables would each find the
  -- other table empty. The lock is keyed on the pair, so they queue instead.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('gedu_seat:' || NEW.gedu_id::text || ':' || NEW.product_id::text, 0)
  );

  IF TG_TABLE_NAME = 'gedu_group_trainees' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
       WHERE pr.id = NEW.gedu_id
         AND pr.role = 'gedu'::public.user_role
    ) THEN
      RAISE EXCEPTION 'a trainee seat is held by a gedu, and profile % is not one', NEW.gedu_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
       WHERE a.gedu_id = NEW.gedu_id
         AND a.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'gedu % is assigned on product % and cannot also be a trainee there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.gedu_group_trainees t
       WHERE t.gedu_id = NEW.gedu_id
         AND t.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'gedu % is a trainee on product % and cannot also be assigned there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_one_gedu_seat_per_product() IS 'Trigger on gedu_group_assignments and gedu_group_trainees: a gedu holds an assignment or a trainee seat on a product, never both, refused from whichever side is written second with unique_violation — the SQLSTATE each table''s own (gedu_id, product_id) UNIQUE raises for the same kind of clash. On the trainee table it also refuses a seat-holder who is not a gedu. Takes a transaction-scoped advisory lock on the (gedu, product) pair, so two writes racing into the two tables queue rather than each finding the other empty. A promotion is a remove and an add in one apply_group_changes batch, which removes before it adds.';

REVOKE ALL ON FUNCTION public.validate_one_gedu_seat_per_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_one_gedu_seat_per_product() TO service_role;

CREATE TRIGGER trg_validate_one_gedu_seat_per_product
  BEFORE INSERT OR UPDATE OF gedu_id, product_id ON public.gedu_group_trainees
  FOR EACH ROW EXECUTE FUNCTION public.validate_one_gedu_seat_per_product();

CREATE TRIGGER trg_validate_one_gedu_seat_per_product
  BEFORE INSERT OR UPDATE OF gedu_id, product_id ON public.gedu_group_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_one_gedu_seat_per_product();

ALTER TABLE public.gedu_group_trainees ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_gedu_group_trainees ON public.gedu_group_trainees
  FOR SELECT TO authenticated
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY gedus_read_own_trainee_seats ON public.gedu_group_trainees
  FOR SELECT TO authenticated
  USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role)
          AND (gedu_id = ( SELECT auth.uid() AS uid))));

GRANT SELECT ON TABLE public.gedu_group_trainees TO authenticated;
GRANT ALL ON TABLE public.gedu_group_trainees TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The predicate
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_trains_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_trainees t
     WHERE t.group_id = p_group_id
       AND t.gedu_id  = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.gedu_trains_group(p_group_id uuid) IS 'Internal predicate: does the CALLER hold a trainee seat on this group. The gate behind the trainee''s own workspace and product documents, and the trainee arm of is_voice_group_member. Deliberately NOT an arm of gedu_teaches_group or of any other staff predicate: a trainee sees the workspace with what a gamer on the group could see, and every staff gate stays closed to them. Group-scoped, where an assignment reaches the whole product''s voice rooms. Total: an unknown group is false. Not exposed to authenticated: it is called from inside SECURITY DEFINER functions.';

REVOKE ALL ON FUNCTION public.gedu_trains_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_trains_group(p_group_id uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 3. Placing, removing and promoting a trainee: the groups panel's batch
-- ---------------------------------------------------------------------------

DROP FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb);

CREATE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb, p_trainees_added jsonb DEFAULT '[]'::jsonb, p_trainees_removed jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
  v_inline_gedu     JSONB;
  v_role            public.gedu_assignment_role;
  v_removed_group   UUID;
  v_removed_gedu    UUID;
  v_orphan_date     DATE;
  v_trainee         JSONB;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    v_removed_group := (v_assignment->>'groupId')::UUID;
    v_removed_gedu  := (v_assignment->>'geduId')::UUID;

    DELETE FROM gedu_group_assignments
     WHERE group_id = v_removed_group
       AND gedu_id  = v_removed_gedu;

    -- REMOVING AN ASSIGNMENT IS AN UNSEATING, and every other write that can
    -- unseat somebody already sweeps the substitution requests it orphans. This one
    -- is the odd case because it unseats WITHOUT touching a substitution row at all:
    -- a gedu removed from the group while they have a live request for Tuesday
    -- leaves that request open, and an admin answering it would seat a sub to
    -- substitute for nobody — and hand them the group's workspace for the date.
    --
    -- Only the dates the removed gedu has a LIVE REQUEST on are swept, because
    -- those are the only ones this removal can have orphaned; the sweep itself
    -- is the same fixpoint every other unseating runs, so a chain that starts
    -- here unwinds exactly as it does there. A date they merely SUBSTITUTE on is not
    -- swept and must not be: a substitution is a seat of its own, and it does not
    -- depend on the assignment this statement just deleted.
    FOR v_orphan_date IN
      SELECT DISTINCT r.session_date
        FROM session_substitution_requests r
       WHERE r.group_id     = v_removed_group
         AND r.requested_by = v_removed_gedu
         AND r.status <> 'withdrawn'::public.substitution_request_status
    LOOP
      PERFORM public.cascade_withdraw_orphaned_substitution_requests(
                v_removed_group, v_orphan_date
              );
    END LOOP;
  END LOOP;

  -- Trainee seats removed, with the assignments and for the same reason: a
  -- PROMOTION is this remove and an assignment add in one batch, and the
  -- one-seat-per-product trigger refuses the add while the trainee seat is
  -- still there. A trainee holds no substitution request, so nothing is swept.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_removed) LOOP
    DELETE FROM gedu_group_trainees
     WHERE group_id = (v_trainee->>'groupId')::UUID
       AND gedu_id  = (v_trainee->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    -- An added group's educators now arrive as objects carrying a ROLE:
    -- `gedus: [{ geduId, role }]`. Every assignment has a role as of this
    -- migration, and the column's DEFAULT is the backfill, so an element that
    -- omits `role` lands as a primary.
    IF jsonb_typeof(v_group->'gedus') = 'array' THEN
      FOR v_inline_gedu IN SELECT * FROM jsonb_array_elements(v_group->'gedus') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (
          v_new_id,
          (v_inline_gedu->>'geduId')::UUID,
          p_product_id,
          COALESCE((v_inline_gedu->>'role')::public.gedu_assignment_role, 'primary')
        );
      END LOOP;
    END IF;

    -- The legacy shape, still read for the deploy window: a bare array of ids,
    -- every one of them a primary. The old app posts this; the new one posts
    -- `gedus` above. Both are accepted, and a caller sending both gets both
    -- (the primary-key conflict on a repeated pair is silenced by the ON
    -- CONFLICT below, not here, so a duplicate inside ONE batch would still
    -- raise — which is the caller's bug rather than a state to absorb).
    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id, 'primary')
        ON CONFLICT (group_id, gedu_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  -- Explicit conflict target so the (gedu_id, product_id) UNIQUE violation
  -- propagates as an error (an admin trying to assign the same Gedu to two
  -- groups in one product should fail). Only the (group_id, gedu_id)
  -- primary-key conflict is handled here — and as of this migration it UPDATES
  -- the role rather than doing nothing, which is what makes a role change ONE
  -- add rather than a remove plus an add. Re-adding a pair that is already
  -- there is therefore no longer a no-op: it restates the role, which is
  -- exactly what the panel's role select posts.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;
    v_role    := COALESCE(
                   (v_assignment->>'role')::public.gedu_assignment_role,
                   'primary'
                 );

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
    VALUES (v_resolved_group, v_gedu_id, p_product_id, v_role)
    ON CONFLICT (group_id, gedu_id) DO UPDATE
      SET role = EXCLUDED.role;
  END LOOP;

  -- Trainee seats added, after the assignments so a DEMOTION (an assignment
  -- removed, a trainee seat added) is one batch too. A group added in this
  -- batch is addressed by its tempId. No ON CONFLICT: re-adding a seat that is
  -- there, or placing a gedu already seated on the product, is refused.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_added) LOOP
    IF v_temp_map ? (v_trainee->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_trainee->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_trainee->>'groupId')::UUID;
    END IF;

    INSERT INTO gedu_group_trainees (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, (v_trainee->>'geduId')::UUID, p_product_id);
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;

COMMENT ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) IS 'The admin groups panel''s whole batch, applied in one transaction: remove assignments, delete groups, rename groups, add groups (each with its educators inline), add assignments, and move participations between groups. Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two admins editing one product''s groups serialize rather than interleave. Removes run BEFORE adds so moving an educator from group A to group B is one batch — the (gedu_id, product_id) UNIQUE would otherwise refuse the add. Newly added groups are addressed by a client-minted `tempId` and the returned `tempMap` hands back the real ids, which is what lets one batch create a group and move members into it. An assignment carries a ROLE: an added assignment element is { groupId, geduId, role } and upserts ON CONFLICT (group_id, gedu_id) DO UPDATE SET role, so a role change is ONE add rather than a remove plus an add — which also means re-adding an existing pair is not a no-op, it restates the role. An added GROUP''s educators arrive as gedus: [{ geduId, role }]; the legacy geduIds array of bare ids is still read for the deploy window and lands every one of them as a primary. An omitted role is a primary, which is also the column''s default. This function is DELIBERATELY ASSIGNMENT-ONLY with respect to session substitutions, and is annotated as such in the completeness check: it is the writer of the permanent relationship, not a gate on it. Removing an assignment also sweeps the substitution requests it orphans: for every date the removed gedu held a live request on, the same fixpoint every other unseating runs. It remains ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still writes no substitution row — but a writer that can unseat somebody has to leave the derivation consistent, or an admin could answer a request filed by a person who is no longer expected at the session. TRAINEE SEATS ride the same batch: p_trainees_removed and p_trainees_added, each element { groupId, geduId } (an added one may name a tempId), removed with the assignments and added after them. That order is what makes a PROMOTION — the trainee seat removed and an assignment added, on the same group or another of the product — and a demotion one atomic batch each; the one-seat-per-product trigger refuses a gedu holding both. An added trainee seat has no ON CONFLICT, so placing a gedu already seated on the product is refused.';

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. The staff and admin reads name a group's trainees
-- ---------------------------------------------------------------------------

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
        -- The assignment ROLE rides each pill, which is what the groups panel's
        -- role select reads and writes back through apply_group_changes. This
        -- panel is the permanent-assignment editor; the session-card staffing
        -- editor is a different tool and deliberately does not link to it.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email,
                     'role',       ga.role
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        -- The group's trainee seats, which the panel places, removes and
        -- promotes through apply_group_changes. No role: a trainee is not paid.
        'trainees', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         tp.id,
                     'first_name', tp.first_name,
                     'email',      tp.email
                   )
                   ORDER BY t.created_at, tp.id
                 )
            FROM gedu_group_trainees t
            JOIN profiles tp ON tp.id = t.gedu_id
           WHERE t.group_id = pg.id
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
                     -- check makes "adult seat" the ROLE, not the id
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
                     -- The promote dialog's condition: money once arrived for
                     -- this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
                     -- The staff-only flair, identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps, identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
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
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
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
  -- has_live_subscription is a REAL READ here, not the constant FALSE that
  -- "demote_to_waitlist refuses a subscribed row, so this cannot exist" would
  -- allow. It can exist: the webhook inserts family_subscriptions after a
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
  --
  -- The two seat-offer stamps are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
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
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
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

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS 'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. The person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row. All three branches also carry the staff-only flair — group_joined_at, note and note_updated_by_first_name — from one identical LEFT JOIN, which comes back NULL on the two group-less branches because that is the truth and because one expression is what keeps the three shapes one shape. The groups panel draws neither mark, and no admin surface reads either of them from THIS document — the group details page renders both and reads them off get_gedu_group_feed, the copy a note write invalidates — so all three fields ride here for shape parity across the three roster readers rather than for a reader of this one. All three branches also carry seat_offer_sent_at and seat_offer_expiry_notified_at, on exactly the same terms: only the WAITLIST branch can hold a non-NULL value (a CHECK forbids an offer stamp on any other status) and only the waitlist card reads them, but the expression is identical in all three so the shape stays one shape. Whether an offer is LIVE is derived on the reader''s side from sent_at plus the five-day window. Each entry of a group''s `gedus` carries the assignment `role` — primary or assistant — which is what the panel''s per-pill role select reads and writes back through apply_group_changes. This panel is the PERMANENT assignment editor; the session card''s staffing editor is a different tool, and nothing links the two, deliberately. Each group also carries `trainees`, its trainee seats as {id, first_name, email} in placement order, which the panel places, removes and promotes through apply_group_changes.';


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
  v_gedus      jsonb;
  v_substitutions     jsonb;
  v_cancellations     jsonb;
  v_trainees          jsonb;
  v_viewer     uuid    := (SELECT auth.uid());
  v_is_admin   boolean;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  v_is_admin := public.is_admin();

  IF NOT v_is_admin
     AND NOT public.gedu_teaches_group(p_group_id) THEN
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
    -- Staff-facing only, and the one thing a client needs before it can
    -- decide that the final session owes creations: the condition is derived on
    -- the client from this flag, the schedule and the roster's creations, so no
    -- document carries an "owed" field of its own.
    'requires_gamer_creations', p.requires_gamer_creations,
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
  -- The identity key is `participant_id`. Every row on this roster is whoever
  -- holds the seat, and that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel, and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel: the first is when this seat was taken on the PRODUCT,
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
        -- email, so on a CHILD row this is non-null in practice. An ADULT row
        -- has no parent link at all, so it is NULL there and the wire contract
        -- allows it — the address for that row is the one below.
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
        -- check is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair, in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- The one field on this roster that is NOT staff-only: the
        -- member's own family reads the same list on their product page. It
        -- rides here because the roster is where the per-gamer dialog is opened
        -- from, and because the client derives the final session's fourth
        -- completeness condition by tallying it against this same roster.
        -- Always an array, never null.
        'creations',                  COALESCE(gc.creations, '[]'::jsonb)
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
        -- Same key, same guarantee.
        LEFT JOIN public.gamer_group_creations gc
               ON gc.group_id       = part.group_id
              AND gc.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
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
        -- NULL until it has been. The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
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
        -- The session's photos. `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
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

  -- The group's STAFF, with roles. The client's staffing derivation needs two
  -- inputs — who is assigned and in what role, and the non-withdrawn requests
  -- for the date — and this is the first of them. First name only, exactly as
  -- every other staff list on this surface: a workspace names colleagues, it
  -- does not carry their records.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- Every NON-WITHDRAWN substitution request on the group, unbounded — exactly as this
  -- document already returns every stored session row. A withdrawn request is
  -- history that changes nothing about who is expected, so it is the one status
  -- that does not travel. The client merges these onto its entries by date; a
  -- projected date with no session row carries its requests like any other.
  --
  -- `reason` and `reason_note` ride only for an ADMIN. This document is served
  -- to an admin too (the admin group details page renders the gedu workspace's
  -- body), so the flag is the CALLER's role rather than a property of the RPC —
  -- which is what keeps a `sick` category, which is health data about a
  -- contractor, off a colleague's screen while the one document stays one
  -- document.
  SELECT COALESCE(
           jsonb_agg(
             public.substitution_request_document(r, v_is_admin, v_viewer, true)
             ORDER BY r.session_date DESC, r.created_at, r.id
           ),
           '[]'::jsonb
         )
    INTO v_substitutions
    FROM public.session_substitution_requests r
   WHERE r.group_id = p_group_id
     AND r.status <> 'withdrawn'::public.substitution_request_status;

  -- Cancellation: the group's cancelled sessions in effect, newest first —
  -- including one over a kept record the schedule no longer projects, which
  -- the feed draws as cancelled in the record's place rather than as the
  -- record. The reason, who cancelled and when ride for an ADMIN caller
  -- only, keyed to the caller exactly as a substitution reason is: a gedu
  -- learns that the session is off and nothing about why.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, v_is_admin)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

  -- The group's trainees, by first name, for the staff line. A trainee is
  -- not staff, so they are not in `gedus` above and never in the staffing
  -- derivation.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_trainees
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_trainees t
        JOIN public.profiles pr ON pr.id = t.gedu_id
       WHERE t.group_id = p_group_id
    ) AS trainee_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions,
    'gedus',    v_gedus,
    'substitutions',   v_substitutions,
    'cancellations', v_cancellations,
    'trainees',      v_trainees
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map and its photos. Contains no schedule expansion — the client owns the calendar math. Open to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is shown only their OWN group''s feed, and a customer or a gamer is refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (whoever holds the seat, child or adult), carries both game identities (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. The key sits directly on the session rather than under a versioned name, because the gedu contracts schema is tolerant of unknown keys. The document carries two more members, both of them inputs to the client-side staffing derivation rather than answers from it: `gedus`, the group''s assignments as {id, first_name, role}; and `substitutions`, every NON-WITHDRAWN substitution request on the group, unbounded, in the one shape substitution_request_document defines and every substitution write returns. Withdrawn is the one status that does not travel, because it changes nothing about who is expected. The client merges substitutions onto its entries by date, and a projected date with no session row carries its requests like any other. `reason` and `reason_note` ride for an ADMIN caller only — this document is served to an admin too, so the flag is the CALLER''s role rather than a property of the RPC, which is what keeps a `sick` category off a colleague''s screen while the one document stays one document. `offer_count` rides for an admin and for the requester themselves. The GATE is gedu_teaches_group, which admits a live substitution on the group, so a sub opens the workspace they are substituting. It is the ONE caller that asks substitution_request_document to reveal the requester explicitly. The workspace is reached only by staff on the group and its session card''s staffing line names who is away; the REASON rides on the admin flag alone, so a colleague learns that somebody is absent and never that it was `sick`. `trainees` names the group''s trainee seats as {id, first_name}, for the staff line; a trainee is not in `gedus`, and a trainee cannot read this document — gedu_teaches_group has no trainee arm, and their own read is get_trainee_group_feed.';


-- ---------------------------------------------------------------------------
-- The trainee's own documents
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_trainee_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    uuid;
  v_timezone      text;
  v_today         date;
  v_product       jsonb;
  v_group         jsonb;
  v_site          jsonb;
  v_roster        jsonb;
  v_sessions      jsonb;
  v_gedus         jsonb;
  v_cancellations jsonb;
  v_trainees      jsonb;
BEGIN
  -- Guard-first, in the shape get_gedu_group_feed uses: an admin or a gedu
  -- past the first statement, everyone else refused on it.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. A gedu reads this only for a group they hold a
  -- trainee seat on — an assigned gedu reads the full document instead. An
  -- admin passes outright, so the trainee's view can be previewed.
  IF NOT public.is_admin()
     AND NOT public.gedu_trains_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id, p.timezone
    INTO v_product_id, v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- Ages are counted on the product's own calendar day.
  v_today := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;

  -- The shell, the material link included: a trainee prepares from the same
  -- material the session is run from.
  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'material_url',             psd.material_url,
    'requires_gamer_creations', p.requires_gamer_creations,
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

  -- The public note only. The staff note does not travel at all.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue on in-person products, without its staff note.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster, keyed by participant_id like the gedu document's.
  -- An age rather than a date of birth, no contact address of any kind, and
  -- whether a staff note exists rather than what it says. `creations` is
  -- always empty: a gamer sees only their own.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'group_joined_at',    part.group_joined_at,
        'age', CASE WHEN gprof.date_of_birth IS NOT NULL THEN
                 EXTRACT(YEAR FROM age(v_today::timestamp,
                                       gprof.date_of_birth::timestamp))::integer
               END,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- A note row exists only while it holds text (the table's CHECK).
        'has_note',           (gn.participant_id IS NOT NULL),
        'creations',          '[]'::jsonb
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored session the group's families are shown, newest first: the
  -- family-facing report, its photos, when it was mailed and who last touched
  -- the row. No staff note, and an empty register — a gamer sees only their
  -- own mark. A record kept under a cancellation does not travel, as on the
  -- family document; the cancellation below does.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',                s.id,
        'session_date',      s.session_date,
        'starts_at',         s.starts_at,
        'ends_at',           s.ends_at,
        'report',            s.report,
        'report_emailed_at', s.report_emailed_at,
        'updated_by',        s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', '{}'::jsonb
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
    ) AS session_rows;

  -- The group's assigned gedus, as the gedu document names them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- The cancelled sessions in effect, in the staff documents' shape with the
  -- detail left null: that a session is off, never why.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, false)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_trainees
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_trainees t
        JOIN public.profiles pr ON pr.id = t.gedu_id
       WHERE t.group_id = p_group_id
    ) AS trainee_rows;

  RETURN jsonb_build_object(
    'product',       v_product,
    'group',         v_group,
    'site',          v_site,
    'roster',        v_roster,
    'sessions',      v_sessions,
    'gedus',         v_gedus,
    -- A trainee is nobody's substitute and nobody's absence is theirs to know.
    'substitutions', '[]'::jsonb,
    'cancellations', v_cancellations,
    'trainees',      v_trainees
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) IS 'The trainee''s group workspace: the same document get_gedu_group_feed serves, with everything a trainee may not see ABSENT from the wire rather than blanked, so the same page body renders it. A trainee sees what a gamer on the group sees, plus the material link and the roster. Guard-first on assert_role (an admin or a gedu), then gedu_trains_group as a second 42501; an admin passes outright, to preview the trainee''s view. Carries: the product shell with material_url; the group''s public note (never gedu_note); the site''s name, address and public note (never gedu_note); a roster row per active seat with participant_id, first_name, signed_up_at, group_joined_at, an integer `age` (never date_of_birth), gender, both game identities, `has_note` (whether a staff note exists, never its text or editor) and `creations` always []; no parent_email or participant_email. Every stored session a family is shown — a record kept under a cancellation does not travel — with report, report_emailed_at, updated_by and updated_by_first_name, images, and `attendance` always {}; never gedu_note, created_at, created_by or updated_at. `gedus` as {id, first_name, role}; `substitutions` always []; `cancellations` in session_cancellation_document''s shape with the admin-only detail null; `trainees` as {id, first_name}. Photo-consent answers are not on it and the trainee cannot read them elsewhere: their read policy asks gedu_teaches_gamer, which has no trainee arm.';

REVOKE ALL ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trainee_group_feed(p_group_id uuid) TO service_role;


CREATE FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_group_id uuid;
  v_timezone    text;
  v_today       date;
  v_product     jsonb;
  v_groups      jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The caller's trainee group on this product. There is at most one (the
  -- table is UNIQUE on gedu and product), so a named group only has to agree
  -- with it.
  SELECT t.group_id
    INTO v_my_group_id
    FROM public.gedu_group_trainees t
   WHERE t.product_id = p_product_id
     AND t.gedu_id    = (SELECT auth.uid())
     AND (p_group_id IS NULL OR t.group_id = p_group_id);

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'topic',                    p.topic,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ))
        FROM public.product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  ), p.timezone
  INTO v_product, v_timezone
  FROM public.products p
  WHERE p.id = p_product_id;

  v_today := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;

  -- Every group of the product, ordered as get_gedu_assigned_product orders
  -- them. A sibling group is shown by name only, so the trainee can see it
  -- exists (its voice room, locked): its size, its staff and its members are
  -- nothing a gamer on this group is shown. The caller's own group carries the
  -- rest, and its roster is the trainee workspace document's, row for row.
  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT CASE WHEN pg.id <> v_my_group_id THEN
        jsonb_build_object(
          'id',          pg.id,
          'name',        pg.name,
          'created_at',  pg.created_at,
          'is_my_group', false
        )
      ELSE jsonb_build_object(
        'id',          pg.id,
        'name',        pg.name,
        'created_at',  pg.created_at,
        'is_my_group', true,
        'participant_count', (
          SELECT COUNT(*)::integer
            FROM public.participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         gp.id,
                   'first_name', gp.first_name,
                   'role',       ga.role
                 ) ORDER BY gp.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id',     part.participant_id,
                   'first_name',         gmp.first_name,
                   'signed_up_at',       part.signed_up_at,
                   'group_joined_at',    part.group_joined_at,
                   'age', CASE WHEN gprof.date_of_birth IS NOT NULL THEN
                            EXTRACT(YEAR FROM age(v_today::timestamp,
                                                  gprof.date_of_birth::timestamp))::integer
                          END,
                   'gender',             gprof.gender,
                   'minecraft_username', mca.minecraft_username,
                   'minecraft_uuid',     mca.minecraft_uuid,
                   'roblox_username',    rba.roblox_username,
                   'roblox_user_id',     rba.roblox_user_id,
                   'has_note',           (gn.participant_id IS NOT NULL),
                   'creations',          '[]'::jsonb
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp                ON gmp.id        = part.participant_id
            LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
            LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
            LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = part.group_id
                  AND gn.participant_id = part.participant_id
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb)
      ) END AS g
        FROM public.product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) IS 'The trainee''s door to a product: get_gedu_assigned_product''s document for a gedu holding a TRAINEE seat on it, refused with 42501 otherwise (gedu-only on its first statement). p_group_id is optional and, when given, must be the caller''s trainee group. The shell is the gedu one''s (topic included). `groups` holds every group of the product, ordered by created_at then id. A sibling group carries {id, name, created_at, is_my_group: false} and nothing else — its name is shown so the trainee can see it exists, but its size, staff and members are nothing a gamer on this group is shown. The caller''s own group carries is_my_group true, participant_count, `gedus` as {id, first_name, role}, and the same redacted roster get_trainee_group_feed serves: an integer `age` instead of date_of_birth, `has_note` instead of the note, `creations` always [], and no contact address.';

REVOKE ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 5. My SOG shows trainee seats as a third kind of seat
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- Two arms, discriminated by `kind`, because a gedu's dashboard now has two
  -- kinds of thing on it: a standing ASSIGNMENT (one row per assignment, as
  -- before, `substitution_date` null) and an unexpired SUBSTITUTION (one row per substituted
  -- date, `substitution_date` set). They share every product-shell column, which is why
  -- they are one RPC rather than two — the card the dashboard draws differs in
  -- its chrome, not in the facts it needs.
  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
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
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'assignment'::text AS kind,
    NULL::date         AS substitution_date,
    public.group_upcoming_cancelled_dates(a.group_id) AS cancelled_dates,
    false              AS substitution_cancelled
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id

  UNION ALL

  -- The caller's UNEXPIRED substitutions: one row per substituted (group, date) the caller
  -- still holds. `gedu_holds_unexpired_substitution` carries the whole of that — it is
  -- keyed to auth.uid(), requires the holder to still be certified, and applies
  -- the window's END — so nothing here restates any of it. The status test
  -- beside it is not redundant either: it is what makes the join read as "a
  -- substituted request", and the predicate then decides whether it is still
  -- current.
  --
  -- Deliberately NOT gedu_substitutes_session, which would also require the session
  -- to be within 48 hours: this is the row the substitution card on My SOG is drawn
  -- from, and a sub has to see the afternoon they accepted from the moment it
  -- is theirs, not from the moment they can open the group. The workspace the
  -- card links to is the thing that stays shut, and it is gated on
  -- gedu_substitutes_session like every other access surface.
  SELECT
    p.id            AS product_id,
    r.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
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
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'substitution'::text   AS kind,
    r.session_date  AS substitution_date,
    public.group_upcoming_cancelled_dates(r.group_id) AS cancelled_dates,
    -- Asked of the substituted date itself rather than read out of
    -- `cancelled_dates`: that window starts the day before today, and the card
    -- stands for days after its date, so a cancelled substitution would
    -- otherwise read as running once its date fell out of the window.
    public.group_session_is_cancelled(r.group_id, r.session_date) AS substitution_cancelled
  FROM session_substitution_requests r
  JOIN product_groups g ON g.id = r.group_id
  JOIN products p       ON p.id = g.product_id
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date)

  UNION ALL

  -- The caller's TRAINEE seats, one row per seat, shaped like an assignment
  -- row. The card links to the trainee's own workspace.
  SELECT
    p.id            AS product_id,
    t.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
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
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'trainee'::text    AS kind,
    NULL::date         AS substitution_date,
    public.group_upcoming_cancelled_dates(t.group_id) AS cancelled_dates,
    false              AS substitution_cancelled
  FROM gedu_group_trainees t
  JOIN products p ON p.id = t.product_id
  WHERE t.gedu_id = v_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu has a seat on, one row per seat, with the product shell, its schedule slots, how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). Gedu-gated on its first statement. TWO KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; and a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides. That predicate rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: names, a type, a date, the schedule, two head counts, and `cancelled_dates` — the row''s group''s upcoming cancelled dates (group_upcoming_cancelled_dates), dates only, which the card skips when naming the next session and the absence picker never offers; and `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date rather than of that window because the substitution card stands for days after it, and false on an assignment row. One RPC rather than two because the two kinds share every product-shell column and the dashboard card differs in its chrome rather than in the facts it needs. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false).';


CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    -- The caller's SEATS on groups, of which there are now two kinds. The union
    -- is the whole of the change to this function: everything below it is
    -- written against a (product, group) pair and a possible substitution DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per gedu_group_assignments row, exactly as
    --     before, with `substitution_date` null.
    --   * `substitution`      — one row per UNEXPIRED substitution date.
    --     gedu_holds_unexpired_substitution carries the whole of that: keyed to
    --     auth.uid(), the holder still certified, and the window's END not yet
    --     passed. Deliberately not gedu_substitutes_session, which would also
    --     require the session to be within 48 hours — this arm feeds the substitution
    --     card a sub reads on My SOG, which exists from approval, where the
    --     workspace it links to opens at T-48h.
    --
    -- `gedu_id` is carried through rather than dropped so the closing
    -- `WHERE a.gedu_id = v_uid` still reads as the statement it always was.
    WITH seat AS (
      SELECT a0.product_id,
             a0.group_id,
             a0.gedu_id,
             'assignment'::text AS kind,
             NULL::date         AS substitution_date
        FROM public.gedu_group_assignments a0
       WHERE a0.gedu_id = v_uid
      UNION ALL
      SELECT g0.product_id,
             r0.group_id,
             r0.substitute_id AS gedu_id,
             'substitution'::text  AS kind,
             r0.session_date AS substitution_date
        FROM public.session_substitution_requests r0
        JOIN public.product_groups g0 ON g0.id = r0.group_id
       WHERE r0.substitute_id = v_uid
         AND r0.status     = 'substituted'::public.substitution_request_status
         AND public.gedu_holds_unexpired_substitution(r0.group_id, r0.session_date)
      UNION ALL
      --   * `trainee` — one row per gedu_group_trainees seat. It owes nothing
      --     (see the attention count below).
      SELECT t0.product_id,
             t0.group_id,
             t0.gedu_id,
             'trainee'::text AS kind,
             NULL::date      AS substitution_date
        FROM public.gedu_group_trainees t0
       WHERE t0.gedu_id = v_uid
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Which kind of seat this row is, and on which date when it is a
               -- substitution. The dashboard rollup keys on (product, group) and a
               -- substitution card's identity is (group, date) — one card per substituted
               -- date, standing from approval until the substitution expires.
               'kind',                    a.kind,
               'substitution_date',            a.substitution_date,
               -- The count is every active seat on the group, and one of those
               -- can be an adult — which is why it is named for the
               -- participant rather than for a gamer.
               --
               -- It is the WHOLE current roster and stays that way. "How many
               -- gamers are in my group" is a fact about the group today, not
               -- about any one occurrence — the per-occurrence expected size
               -- that condition (1) uses is derived separately below and must
               -- never be routed through this value.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name, a.kind, a.substitution_date
           )
      FROM seat a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      -- The run's FINAL computed occurrence, which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Cancellation: the final session is the last projected occurrence this
      -- GROUP has not had cancelled, so a cancelled last session hands the
      -- creations condition to the one before it rather than dropping it.
      -- The window is therefore a year ending at end_date, floored at
      -- start_date, rather than the week that sufficed before cancellations:
      -- slots are weekly, so any week inside it holds every weekday and the
      -- max over the window is the max over the run unless a whole year of
      -- the group's sessions is cancelled — a bounded cost either way.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 366),
                   p.end_date - 366
                 )::timestamp,
                 p.end_date::timestamp,
                 interval '1 day'
               ) AS d
         -- Explicit rather than relying on generate_series answering nothing for
         -- a NULL bound: "an open-ended product never owes" is a decision and it
         -- should be readable as one.
         WHERE p.end_date IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.schedule_slots s
              WHERE s.product_id = p.id
                AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
           )
           AND NOT public.group_session_is_cancelled(g.id, d::date)
      ) AS final_occurrence

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence

          -- The occurrence's END INSTANT — one value per occurrence, and the
          -- same value whichever arm of the union above produced it.
          --
          -- The union is deliberately left keyed on the date alone: carrying an
          -- end instant through it would let one date arrive twice with two
          -- different ends and count the occurrence twice. So it is resolved
          -- here instead — the stored row's own `ends_at` where the occurrence
          -- has a row, and otherwise the schedule's arithmetic.
          --
          -- MIN over the weekday's slots, not MAX, and that is not arbitrary:
          -- the projected arm admits a date when EXISTS a slot whose end has
          -- passed, and `EXISTS (end <= now)` is exactly `min(end) <= now`. The
          -- "has it finished" test and the "who did it expect" test therefore
          -- read the same instant by construction rather than by inspection.
          --
          -- Today the choice is moot, and it is worth naming WHY rather than
          -- leaving the guarantee incidental: `schedule_slots_product_id_weekday_key`
          -- is UNIQUE (product_id, weekday), so a weekday carries at most one
          -- slot and this MIN ranges over exactly one row. That is also what
          -- keeps the TypeScript twin in step, since its projection maps one
          -- slot per weekday and cannot pick a different one. **If that
          -- constraint is ever relaxed — the group_sessions unique key already
          -- flags multi-slot days as a revisit — the twins DIVERGE:** this side
          -- would take the minimum end, while the client's takes the
          -- earliest-STARTING slot's end, and those differ whenever the slot
          -- that starts earlier runs longer. Whoever relaxes it changes both
          -- halves in the same commit, or the badge and the card start
          -- disagreeing on multi-slot days only.
          CROSS JOIN LATERAL (
            SELECT COALESCE(
                     (SELECT gs5.ends_at
                        FROM public.group_sessions gs5
                       WHERE gs5.group_id     = g.id
                         AND gs5.session_date = occurrence.session_date),
                     (SELECT min(((occurrence.session_date + s2.start_time) AT TIME ZONE p.timezone)
                                 + make_interval(mins => s2.duration_minutes))
                        FROM public.schedule_slots s2
                       WHERE s2.product_id = p.id
                         AND s2.weekday = (EXTRACT(ISODOW FROM occurrence.session_date)::integer - 1))
                   ) AS ends_at
          ) AS occurrence_end

          -- How many the register was FOR — the members who had joined the
          -- group before this occurrence ended.
          --
          -- Separate from roster.roster_size on purpose: that one is the whole
          -- current roster and answers the dashboard card's headcount and the
          -- empty-group exemption, neither of which is a per-occurrence
          -- question.
          --
          -- The NULL branches are explicit rather than left to a comparison's
          -- behaviour on NULL, and both point the same way — expected. A seat
          -- with no stamp holds no group, so it cannot be here at all; an
          -- occurrence with no end instant cannot arise either. Where the
          -- unreachable happens anyway, the answer is the behaviour that
          -- predates this migration, which costs a mark nobody needed rather
          -- than producing a false "complete".
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS expected_size
              FROM public.participations part4
             WHERE part4.group_id = g.id
               AND part4.status   = 'active'::public.participation_status
               AND (part4.group_joined_at IS NULL
                    OR occurrence_end.ends_at IS NULL
                    OR part4.group_joined_at <= occurrence_end.ends_at)
          ) AS expected

         WHERE roster.roster_size > 0
           -- A TRAINEE seat owes nothing: the register, the report, the mail
           -- and the creations are the staff's work, not the trainee's, so its
           -- count is 0 without being computed.
           AND a.kind <> 'trainee'
           -- A SUBSTITUTION row owes ONE date: the one it substitutes for. The four conditions
           -- below are untouched and simply see a set of one occurrence, which
           -- is what "the same code path, restricted to that date" means — no
           -- second computation, and in particular the creations condition (4)
           -- fires for a substitution only when the substitution date really is the run's
           -- final occurrence. An ASSIGNMENT row sees every occurrence, as
           -- before.
           AND (a.substitution_date IS NULL OR occurrence.session_date = a.substitution_date)
           -- A date the caller holds a NON-WITHDRAWN request on is not their
           -- work, whichever kind of seat this row is: they have said they
           -- cannot be there. The badge must not count it, whether the request
           -- is still open, already substituted, or a sub-of-sub chain's second
           -- link. This has a TWIN IN TYPESCRIPT (see the comment below on the
           -- four conditions) and the twin learns the same rule.
           AND NOT EXISTS (
             SELECT 1
               FROM public.session_substitution_requests rq
              WHERE rq.group_id     = g.id
                AND rq.session_date = occurrence.session_date
                AND rq.requested_by = v_uid
                AND rq.status <> 'withdrawn'::public.substitution_request_status
           )
           -- Cancellation: a cancelled session owes nothing — nothing ran, so
           -- there is no register, report or mail to ask for, and a record
           -- kept under the cancellation is frozen rather than owed — and
           -- stays so when the stored-row arm reaches it on a date the
           -- schedule no longer projects, because a cancellation over a
           -- record stays in effect. This has the same TypeScript twin as the
           -- rule above, and it learns it too.
           AND NOT public.group_session_is_cancelled(g.id, occurrence.session_date)
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That includes the
           -- CREATIONS condition (4) below — which is scoped by the same
           -- join-date test (1) is — and which members a session is
           -- FOR at all: the TS side asks the same question of the same
           -- instant, with the same inclusive boundary, in both conditions.
           AND (
             -- (1) Some of the members this session EXPECTED have no answer
             -- yet. Both sides of the comparison are scoped the same way: marks
             -- are counted only for members who had joined before the
             -- occurrence ended, and they are compared against how many such
             -- members there are.
             --
             -- Comparing every mark against the whole current roster instead
             -- would mean that placing a member into a group reopens every
             -- session in its history, with no way to clear the alert but to
             -- record an absence that never happened: nobody had yet said
             -- whether that child was there, because they were not in the
             -- group.
             --
             -- Still measured against the CURRENT roster rather than the stored
             -- map's keys, which is a different rule and unchanged: a member
             -- who has LEFT stops being asked about.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                  AND (part2.group_joined_at IS NULL
                       OR occurrence_end.ends_at IS NULL
                       OR part2.group_joined_at <= occurrence_end.ends_at)
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < expected.expected_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             --
             -- Unscoped by who had joined, and that is right: a session owes the
             -- families a write-up whoever was in the room.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
             -- (3) The families have not been told it is there.
             -- Writing the report is half the job; a report nobody was mailed
             -- about is a report nobody reads, so a session stays owed until
             -- the send has been claimed.
             --
             -- NOT EXISTS again, for the same reason as (2): a date with no
             -- materialized row is the same answer as a row that was never
             -- mailed, and neither is a LEFT JOIN's three-valued NULL test.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs4
                WHERE gs4.group_id     = g.id
                  AND gs4.session_date = occurrence.session_date
                  AND gs4.report_emailed_at IS NOT NULL
             )
             -- (4) The FINAL session of a product that requires creations, with
             -- somebody on the current roster who has none. Creations
             -- are part of the last session's work, so this fires on exactly one
             -- occurrence per run and only once that occurrence has finished —
             -- which is free, because every member of this set has finished.
             --
             -- Measured over the CURRENT roster, scoped exactly as (1) is: only
             -- the members who had joined the group before the FINAL occurrence
             -- ended. The owner's principle is that if a gamer was in the group
             -- at the time of the last session, then the gedu owes that gamer a
             -- creation — so a seat placed into the group after that session
             -- had already finished owes nothing and cannot reopen a run that
             -- was square.
             --
             -- This shipped one revision unscoped, and the gap is the argument
             -- for closing it: the same member could be absent from the final
             -- session's register — not asked about, not counted, not drawn —
             -- while still being counted here as owing a creation FOR that
             -- session. One occurrence, two answers to one question about who
             -- it was for. Both conditions now ask it once.
             --
             -- The other half of "was in the group at the time" is not
             -- expressible here and is not attempted: a member who WAS in the
             -- group at the final session and has since left owes nothing,
             -- because this EXISTS ranges over active seats and a departure
             -- leaves nothing behind to measure. Leaving clears the debt, in
             -- both twins, as a limit of the data.
             --
             -- An empty roster is already excluded by the roster_size guard
             -- above, so nothing here has to restate it. A group whose every
             -- seat postdates the final session is NOT excluded by that guard —
             -- it has a roster — and falls out of this condition instead: no
             -- seat passes the join-date predicate, so the EXISTS is false and
             -- nothing is owed, which is the same answer for the same reason.
             --
             -- The array-length test is defensive: the CHECK on the table
             -- refuses an empty array and the write RPC deletes the row instead
             -- of storing one, so "no row" is the only reachable empty. It costs
             -- nothing and it states what "has a creation" means.
             OR (
               p.requires_gamer_creations
               AND occurrence.session_date = final_occurrence.session_date
               AND EXISTS (
                 SELECT 1
                   FROM public.participations part3
                  WHERE part3.group_id = g.id
                    AND part3.status   = 'active'::public.participation_status
                    -- The same three-branch shape (1) and the expected-size
                    -- lateral use, against the same per-occurrence end instant,
                    -- and NULL points the same way in both: expected, which is
                    -- the behaviour that predates this file and can only ever
                    -- ask for a creation nobody needed rather than declare a
                    -- run finished that is not.
                    AND (part3.group_joined_at IS NULL
                         OR occurrence_end.ends_at IS NULL
                         OR part3.group_joined_at <= occurrence_end.ends_at)
                    AND NOT EXISTS (
                      SELECT 1
                        FROM public.gamer_group_creations c
                       WHERE c.group_id       = g.id
                         AND c.participant_id = part3.participant_id
                         AND jsonb_array_length(c.creations) > 0
                    )
               )
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the min slot end for that weekday, which is the same instant the "has it finished" test already used). group_participant_count and the empty-roster guard deliberately keep measuring the WHOLE current roster — a card''s headcount and the empty-group exemption are not per-occurrence questions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is the last occurrence the schedule projects on or before end_date that the group has not cancelled, derived here rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions and on who a session is for, which scopes two of them. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended. A THIRD KIND, `trainee`: a row per gedu_group_trainees seat with substitution_date null, the group name, participant count and venue name like an assignment row, and an attention_count that is always 0 — what a session owes is the staff''s work, so no staff-only aggregate is computed for a trainee seat.';


-- ---------------------------------------------------------------------------
-- 6. The voice room and its chat
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.participant_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    )
    -- The substitution branch, and the one place on this surface where it is DATE-
    -- SCOPED: a sub reaches the room on the dates they are substituting and on no
    -- other date of the group. It ADDS to the assignment arm above rather than
    -- narrowing it — a gedu assigned to the product keeps the product-wide
    -- mobility they already had.
    --
    -- "The session in question" is TODAY OR YESTERDAY in the PRODUCT's
    -- timezone, evaluated at call time because the predicate is handed a group
    -- and nothing else. Yesterday is not slack, it is the calendar: a session
    -- dated Monday that runs to 00:30 is still Monday's session at 00:10 on
    -- Tuesday, and asking only about today ejected its substitute from the room and
    -- from the chat at local midnight — while a session starting at 00:10
    -- refused them for its whole pre-window, which falls on the day before.
    -- The cost is a few hours in which a substitute could rejoin the PREVIOUS day's
    -- room, and the voice window itself is only open around a session, so there
    -- is nothing there to rejoin. gedu_substitutes_session still applies the access
    -- window and the certification test to whichever date matches.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and (
          public.gedu_substitutes_session(
            p_group_id, (now() at time zone p2.timezone)::date
          )
          or public.gedu_substitutes_session(
               p_group_id, ((now() at time zone p2.timezone)::date - 1)
             )
        )
    )
    -- The trainee branch: a trainee is in THEIR OWN group's room, and in no
    -- other group of the product. Never a moderator — is_voice_group_moderator
    -- has no trainee arm — so in the chat a trainee reads inside the family
    -- time bound, like a gamer.
    or public.gedu_trains_group(p_group_id);
$$;

COMMENT ON FUNCTION public.is_voice_group_member(p_group_id uuid) IS 'Who may be in this group''s voice room, and therefore — through is_chat_channel_member — in its in-call chat: an admin, an active seat-holder of the group, a gedu assigned to ANY group of the group''s product, or a live substitution dated TODAY OR YESTERDAY in the product''s timezone. The substitution arm is the one thing on this surface that is date-scoped rather than group-wide, and it is the narrower of the two deliberate exceptions to "a sub sees everything the main gedu sees": a sub belongs in the room on the date they are substituting and on no other date of the group. "The session in question" is evaluated at CALL TIME because the predicate is handed a group and nothing else. The substitution arm ADDS to the assignment arm and narrows nothing — a gedu assigned to the product keeps the product-wide mobility they already had. Total boolean; consumed by the voice_zones and chat policies, which is why it is granted to `authenticated` despite being a predicate. YESTERDAY counts beside today because a session dated Monday that runs past local midnight is still Monday''s session at 00:30 on Tuesday, and a session starting at 00:10 has its whole pre-window on the day before; asking about today alone ejects the substitute from the room and the chat at midnight, and refuses them before a small-hours start. The access window inside gedu_substitutes_session applies to whichever date matches. A TRAINEE (gedu_trains_group) is a member of their own group''s room only — group-scoped where an assignment is product-wide — and never a moderator, so the chat''s family time bound applies to them.';


CREATE OR REPLACE FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT part.participant_id
    FROM public.chat_channels c
    JOIN public.participations part ON part.group_id = c.group_id
   WHERE c.id = p_channel_id
     AND part.status = 'active'::public.participation_status
  UNION
  SELECT ga.gedu_id
    FROM public.chat_channels c
    JOIN public.product_groups g ON g.id = c.group_id
    JOIN public.gedu_group_assignments ga ON ga.product_id = g.product_id
   WHERE c.id = p_channel_id
  UNION
  -- The channel's own group's trainees, who are in its room.
  SELECT t.gedu_id
    FROM public.chat_channels c
    JOIN public.gedu_group_trainees t ON t.group_id = c.group_id
   WHERE c.id = p_channel_id
  UNION
  SELECT m.sender_id
    FROM public.chat_messages m
   WHERE m.channel_id = p_channel_id;
$$;

COMMENT ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) IS 'Internal: the account ids a channel''s roster names — the group''s active seat-holders, the product''s assigned gedus, and everyone who has a message in the channel. The single definition behind both get_chat_channel_roster and the send/edit mention validation, so the picker can never offer a name the send would refuse. Not exposed to `authenticated`: it is called from inside the SECURITY DEFINER chat RPCs. The channel''s own group''s trainees are on it too, being members of its room.';


DROP FUNCTION public.get_chat_channel_roster(p_channel_id uuid);

CREATE FUNCTION public.get_chat_channel_roster(p_channel_id uuid) RETURNS TABLE(id uuid, first_name text, role public.user_role, is_trainee boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moderator boolean;
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Whether somebody is a trainee is for the room's staff to know. Everyone
  -- else is told false for everyone, so a trainee reads as the gedu their
  -- role says they are.
  v_moderator := public.is_chat_channel_moderator(p_channel_id);

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.role,
         (v_moderator AND EXISTS (
           SELECT 1
             FROM public.chat_channels c
             JOIN public.gedu_group_trainees t ON t.group_id = c.group_id
            WHERE c.id = p_channel_id
              AND t.gedu_id = pr.id
         )) AS is_trainee
    FROM public.profiles pr
   WHERE pr.id IN (
     SELECT roster.account_id
       FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
   )
   ORDER BY pr.id;
END;
$$;

COMMENT ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) IS 'The accounts a channel can name: the group''s active seat-holders, the product''s assigned gedus, and everyone who has a message in the channel — that last clause is what keeps a departed member''s name on the words they left behind, and how a covering gedu or an admin becomes mentionable the moment they send. First name, role and is_trainee only; nothing else about anybody. is_trainee is true for a trainee of the channel''s group when the CALLER moderates the channel, and false for everyone when they do not: a trainee''s role is gedu, and only staff are told the difference. Membership-scoped on is_chat_channel_member. Exists because `profiles` RLS correctly refuses cross-participant reads and persisted history cannot resolve names from a live call the way the old ephemeral chat did. ORDERED BY PROFILE ID and that is a contract: mention resolution settles two accounts sharing a name by list position, and the composer and the in-place editor must be handed the same array in the same order or one typed name would mean two different people.';

REVOKE ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO service_role;
