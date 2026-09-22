--
-- Name: apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
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


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) IS 'The admin groups panel''s whole batch, applied in one transaction: remove assignments, delete groups, rename groups, add groups (each with its educators inline), add assignments, and move participations between groups. Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two admins editing one product''s groups serialize rather than interleave. Removes run BEFORE adds so moving an educator from group A to group B is one batch — the (gedu_id, product_id) UNIQUE would otherwise refuse the add. Newly added groups are addressed by a client-minted `tempId` and the returned `tempMap` hands back the real ids, which is what lets one batch create a group and move members into it. Since 00272 an assignment carries a ROLE: an added assignment element is { groupId, geduId, role } and upserts ON CONFLICT (group_id, gedu_id) DO UPDATE SET role, so a role change is ONE add rather than a remove plus an add — which also means re-adding an existing pair is no longer a no-op, it restates the role. An added GROUP''s educators arrive as gedus: [{ geduId, role }]; the legacy geduIds array of bare ids is still read for the deploy window and lands every one of them as a primary. An omitted role is a primary, which is also the column''s default. This function is DELIBERATELY ASSIGNMENT-ONLY with respect to session substitutions, and is annotated as such in the completeness check: it is the writer of the permanent relationship, not a gate on it. Since 00276 removing an assignment also sweeps the substitution requests it orphans: for every date the removed gedu held a live request on, the same fixpoint every other unseating runs. It remains ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still writes no substitution row — but a writer that can unseat somebody has to leave the derivation consistent, or an admin could answer a request filed by a person who is no longer expected at the session.';


--
-- Name: FUNCTION apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO service_role;


