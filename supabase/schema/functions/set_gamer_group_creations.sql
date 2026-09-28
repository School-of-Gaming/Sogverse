--
-- Name: set_gamer_group_creations(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_creations jsonb := COALESCE(p_creations, '[]'::jsonb);
  v_row       public.gamer_group_creations;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate and is the note's rule
  -- unchanged — refusing a substitute standing in for another group would make
  -- the feature useless in the one situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: creations may only be filed against somebody who sits in
  -- the group they are filed under. Without this an authorized gedu could write
  -- against any profile id on the platform. The table carries no write grant, so
  -- it is correctly outside the write-IDOR loop's completeness check — these two
  -- checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- ANY status counts, not just active, exactly as the note's target check does:
  -- what it excludes is a member who has LEFT the group, which is why an
  -- orphaned list cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Refused here rather than by the CHECK only because the CHECK's message for a
  -- non-array is about jsonpath, which names nothing a caller can act on.
  IF jsonb_typeof(v_creations) <> 'array' THEN
    RAISE EXCEPTION 'p_creations must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- An empty list DELETES the row. Absence of a row is what "no creations" means
  -- on every surface, so the empty save has to produce that absence rather than
  -- an empty array standing in for it — and the CHECK refuses an empty array, so
  -- the two states genuinely cannot both exist. The returned document is the
  -- empty shape, so a caller merges the same keys either way.
  IF jsonb_array_length(v_creations) = 0 THEN
    DELETE FROM public.gamer_group_creations
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',       p_group_id,
      'participant_id', p_participant_id,
      'creations',      '[]'::jsonb,
      'updated_at',     NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history. updated_at is left to the touch
  -- trigger. The list is stored EXACTLY as supplied: no trimming and no
  -- rebuilding of each element, because rebuilding would quietly drop the extra
  -- keys the CHECK exists to refuse, and trimming would make the CHECK's
  -- non-blank clause unreachable. Shape, caps and blankness are all the table's
  -- (23514), which the dialog is built never to hit.
  INSERT INTO public.gamer_group_creations AS c
         (group_id, participant_id, creations, updated_by)
  VALUES (p_group_id, p_participant_id, v_creations, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET creations  = EXCLUDED.creations,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'creations',      v_row.creations,
    'updated_at',     v_row.updated_at
  );
END;
$$;


--
-- Name: FUNCTION set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) IS 'Replace the whole list of creations for one member of one group, and return the resulting document (group_id, participant_id, creations, updated_at). Set-shaped rather than per-row add/update/delete: nothing reads or references a single creation, and a small list edited in a dialog is replaced whole. Open to an ADMIN or to any gedu assigned to any group of the group''s product, with full read/write parity between the two; guard-first on assert_role, then two further 42501s — the ACTOR half (staff reach over the product) and the TARGET half (the participant actually holds a participation in that group, at ANY status). The target half is what stands in for a write-IDOR loop entry, since the table carries no write grant for any client role. An EMPTY list deletes the row and returns the empty-shaped document, because absence of a row is what "no creations" means everywhere else. The value is stored verbatim — no trimming, no key filtering — so the table''s CHECK is the single authority on shape, caps and blankness (23514); normalising here would discard the extra keys that CHECK exists to refuse. Idempotent: the same list written twice is the same row, which is what makes a partial failure in the two-write dialog safe to retry. Last-write-wins, and only the last writer is stored — there is no history, and nothing in v1 displays the provenance it does keep.';


--
-- Name: FUNCTION set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) TO authenticated;


