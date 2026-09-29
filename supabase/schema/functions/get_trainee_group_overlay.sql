--
-- Name: get_trainee_group_overlay(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_trainee_group_overlay(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  -- Guard-first, in the shape get_group_staff_overlay uses: an admin or a gedu
  -- past the first statement, everyone else refused on it.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. A gedu reads this only for a group they hold a
  -- trainee seat on — an assigned gedu reads the staff overlay instead. An
  -- admin passes outright, so the trainee's view can be previewed.
  IF NOT public.is_admin()
     AND NOT public.gedu_trains_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- The staff overlay's map, one entry per active member, with the note's text
  -- and editor replaced by whether a note exists, and the creations empty: a
  -- gamer sees only their own.
  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at', part.group_joined_at,
           -- A note row exists only while it holds text (the table's CHECK).
           'has_note',        (n.participant_id IS NOT NULL),
           'creations',       '[]'::jsonb
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id       = part.group_id
          AND n.participant_id = part.participant_id
   WHERE part.group_id = p_group_id
     AND part.status   = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;


--
-- Name: FUNCTION get_trainee_group_overlay(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_trainee_group_overlay(p_group_id uuid) IS 'The trainee''s twin of get_group_staff_overlay, for the voice room of the group they shadow: product_type, and a map keyed by participant id with one entry per ACTIVE member carrying group_joined_at, `has_note` (whether a staff note exists, never its text or its editor) and `creations` always []. So the room draws a trainee the same note buttons, lit where a note exists, and the same newcomer badges an assigned gedu sees, and the dialog behind a button opens with the note withheld. Guard-first on assert_role (an admin or a gedu), then gedu_trains_group as a second 42501: a trainee reads their own group only, an assigned gedu reads the staff overlay instead. An admin passes outright, to preview the trainee''s view. Nothing on it is contact data.';


--
-- Name: FUNCTION get_trainee_group_overlay(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_trainee_group_overlay(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_trainee_group_overlay(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trainee_group_overlay(p_group_id uuid) TO service_role;


