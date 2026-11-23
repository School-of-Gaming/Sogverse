--
-- Name: apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb, p_trainees_added jsonb DEFAULT '[]'::jsonb, p_trainees_removed jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_now             TIMESTAMPTZ;
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_temp_map        JSONB := '{}'::jsonb;
  v_inline_gedu     JSONB;
  v_adds            JSONB := '[]'::jsonb;
  v_role            public.gedu_assignment_role;
  v_current         RECORD;
  v_removed_group   UUID;
  v_removed_gedu    UUID;
  v_sweep_groups    UUID[] := '{}';
  v_sweep_dates     DATE[] := '{}';
  v_sweep           RECORD;
  v_trainee         JSONB;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The one instant every period this batch ends or starts is stamped with,
  -- read under the product's lock: two admins' transactions can start in one
  -- order and take the lock in the other, and now() would stamp them in the
  -- first. One instant also means a gedu moved between groups leaves one
  -- period exactly where the next begins.
  v_now := clock_timestamp();

  -- Removes first, so an admin can move a Gedu from group A to B in one batch:
  -- the period on A ends before the one on B starts.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    v_removed_group := (v_assignment->>'groupId')::UUID;
    v_removed_gedu  := (v_assignment->>'geduId')::UUID;

    UPDATE gedu_group_assignments
       SET ended_at = v_now
     WHERE group_id   = v_removed_group
       AND gedu_id    = v_removed_gedu
       AND product_id = p_product_id
       AND ended_at IS NULL;

    -- ENDING AN ASSIGNMENT IS AN UNSEATING for every session starting at or
    -- after this instant, and every other write that can unseat somebody
    -- sweeps the substitution requests it orphans. A gedu removed while they
    -- have a live request for next Tuesday leaves that request open, and an
    -- admin answering it would seat a sub to substitute for nobody.
    --
    -- Only the removed gedu's LIVE REQUESTS on sessions starting at or after
    -- the removal are collected: a session that started before it still
    -- belongs to the ended period, so its request, and any substitution on it,
    -- stands. A date they merely SUBSTITUTE on is not collected: a
    -- substitution is a seat of its own. The sweeps run at the END of the
    -- batch, after the adds, so a gedu removed and added again in one batch
    -- keeps the requests their new period still covers.
    SELECT v_sweep_groups || array_agg(r.group_id),
           v_sweep_dates  || array_agg(r.session_date)
      INTO v_sweep_groups, v_sweep_dates
      FROM (
        SELECT DISTINCT r.group_id, r.session_date
          FROM session_substitution_requests r
         WHERE r.group_id     = v_removed_group
           AND r.requested_by = v_removed_gedu
           AND r.status <> 'withdrawn'::public.substitution_request_status
           AND public.group_session_starts_at(r.group_id, r.session_date) >= v_now
      ) r;
  END LOOP;

  -- Trainee seats removed, with the assignments and for the same reason: the
  -- one-seat-per-product trigger refuses an add while a seat of the other
  -- kind is still there, so every remove runs before any add. A trainee holds
  -- no substitution request, so nothing is swept.
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

  -- An added group's educators arrive inline as `gedus: [{ geduId, role }]`.
  -- They join the batch's adds ahead of the explicit ones, addressed by the
  -- group's real id, so both go through the one add below.
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    IF jsonb_typeof(v_group->'gedus') = 'array' THEN
      FOR v_inline_gedu IN SELECT * FROM jsonb_array_elements(v_group->'gedus') LOOP
        v_adds := v_adds || jsonb_build_array(
          v_inline_gedu || jsonb_build_object('groupId', v_new_id::TEXT)
        );
      END LOOP;
    END IF;
  END LOOP;

  v_adds := v_adds || p_gedu_assignments_added;

  -- An add { groupId, geduId, role } (an omitted role is a primary):
  --   - a current period on that group in that role: nothing to do;
  --   - a current period there in another role: a role change, which ends that
  --     period and starts one in the new role, so past sessions keep the role
  --     they were taught in — unless the period began in this very batch, when
  --     its role is corrected in place, since ending it at the instant it
  --     began would leave a period of no length;
  --   - otherwise a new period from this instant. A gedu still current on
  --     another group of the product meets the one-live-period index, which is
  --     the error an admin assigning one gedu to two groups has always met.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(v_adds) LOOP
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

    SELECT a.id, a.role, a.started_at INTO v_current
      FROM gedu_group_assignments a
     WHERE a.group_id = v_resolved_group
       AND a.gedu_id  = v_gedu_id
       AND a.ended_at IS NULL
       FOR UPDATE;

    IF FOUND THEN
      CONTINUE WHEN v_current.role = v_role;

      IF v_current.started_at = v_now THEN
        UPDATE gedu_group_assignments
           SET role = v_role
         WHERE id = v_current.id;
        CONTINUE;
      END IF;

      UPDATE gedu_group_assignments
         SET ended_at = v_now
       WHERE id = v_current.id;
    END IF;

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role, started_at)
    VALUES (v_resolved_group, v_gedu_id, p_product_id, v_role, v_now);
  END LOOP;

  -- Trainee seats added, after every remove. A group added in this batch is
  -- addressed by its tempId. No ON CONFLICT: re-adding a seat that is
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

    -- Only a seat held now moves: an ended seat keeps the group it ended in,
    -- and a waitlisted row has none. A move naming either, from a panel that
    -- loaded before the seat ended, is skipped; the panel refetches after the
    -- batch and no longer shows it.
    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id
       AND status = 'active';
  END LOOP;

  -- The removals' sweeps, against the batch's end state. Each is the same
  -- fixpoint every other unseating runs, so a chain that starts here unwinds
  -- exactly as it does there.
  FOR v_sweep IN
    SELECT DISTINCT s.group_id, s.session_date
      FROM unnest(v_sweep_groups, v_sweep_dates) AS s(group_id, session_date)
  LOOP
    PERFORM public.cascade_withdraw_orphaned_substitution_requests(
              v_sweep.group_id, v_sweep.session_date
            );
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) IS 'The admin groups panel''s whole batch, applied in one transaction: end assignments, delete groups, rename groups, add groups (each with its educators inline), add assignments, and move participations between groups — only active seats move, so a move naming an ended or waitlisted row is skipped silently. Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two admins editing one product''s groups serialize rather than interleave; every period the batch ends or starts is stamped with ONE clock_timestamp() read under that lock. An assignment is a PERIOD: a removal { groupId, geduId } ends the current period at that instant (no current period is a silent no-op) and never deletes it; an add { groupId, geduId, role } is a no-op when the gedu is current on that group in that role, a ROLE CHANGE when current there in another role — the period ends and one in the new role starts at the same instant, so past sessions keep the role they were taught in, except that a period begun in this same batch has its role corrected in place rather than leave a period of no length — and otherwise starts a new period at that instant. Re-adding a gedu who was removed is a new row; the gap belongs to neither. Removes run BEFORE adds, so moving an educator from group A to group B is one batch: A''s period ends where B''s begins, and the one-live-period-per-product index would otherwise refuse the add, as it refuses assigning one gedu to two groups of a product. Newly added groups are addressed by a client-minted `tempId` and the returned `tempMap` hands back the real ids, which is what lets one batch create a group and move members into it. An added GROUP''s educators arrive as gedus: [{ geduId, role }] and are added exactly as explicit adds are, ahead of them. An omitted role is a primary, which is also the column''s default. This function is DELIBERATELY ASSIGNMENT-ONLY with respect to session substitutions, and is annotated as such in the completeness check: it is the writer of the permanent relationship, not a gate on it. Ending an assignment also sweeps the substitution requests it orphans: for every date the removed gedu held a live request on whose session starts at or after the removal, the same fixpoint every other unseating runs — a session that started before the removal still belongs to the ended period, so nothing in the past is withdrawn. The sweeps run at the end of the batch, after the adds, so a gedu removed and re-added in one batch keeps the requests their new period covers. It remains ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still writes no substitution row — but a writer that can unseat somebody has to leave the derivation consistent, or an admin could answer a request filed by a person who is no longer expected at the session. TRAINEE SEATS ride the same batch: p_trainees_removed and p_trainees_added, each element { groupId, geduId } (an added one may name a tempId), removed with the assignments and added after them, so the one-seat-per-product trigger, which refuses a gedu holding both a current assignment and a trainee seat on the product, judges the batch''s end state. An added trainee seat has no ON CONFLICT, so placing a gedu already seated on the product is refused.';


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) TO service_role;


