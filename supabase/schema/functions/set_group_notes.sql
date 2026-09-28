--
-- Name: set_group_notes(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.product_groups;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.product_groups
     SET public_note = NULLIF(btrim(COALESCE(p_public_note, '')), ''),
         gedu_note   = NULLIF(btrim(COALESCE(p_gedu_note, '')), '')
   WHERE id = p_group_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'public_note', v_row.public_note,
    'gedu_note',   v_row.gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) IS 'Write a group''s standing family-facing and gedu notes. Open to an ADMIN or to the gedu assigned to the group — the guard admits either role and only the assignment half of the gate is skipped for an admin. Last-write-wins.';


--
-- Name: FUNCTION set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_notes(p_group_id uuid, p_public_note text, p_gedu_note text) TO service_role;


