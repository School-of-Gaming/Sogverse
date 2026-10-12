--
-- Name: create_spotlight(jsonb, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the spotlight is in session report emails'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  -- The CHECK would refuse this too; saying it in a sentence is what lets the
  -- refusal reach an admin as something they can act on.
  IF p_enabled AND p_image_id IS NULL THEN
    RAISE EXCEPTION 'A spotlight needs a picture before it can be switched on'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.spotlights (image_id, enabled)
  VALUES (p_image_id, p_enabled)
  RETURNING id INTO v_id;

  PERFORM public.replace_spotlight_versions(v_id, p_versions);

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid) IS 'Admin-gated create of a spotlight; returns its id. p_versions is the whole version set, as replace_spotlight_versions takes it — at least one {locale, title, body}, each with both fields. p_enabled is whether it is appended to session report emails from the start; switching on with no picture raises check_violation, and a NULL p_enabled raises null_value_not_allowed. The picture is a catalogue entry id or NULL for none, and the image-path trigger refuses one that is gone or not a spotlight picture. SECURITY DEFINER because neither spotlight table carries a write grant.';


--
-- Name: FUNCTION create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_enabled boolean, p_image_id uuid) TO service_role;


