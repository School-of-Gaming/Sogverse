--
-- Name: save_spotlight(uuid, jsonb, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the spotlight is in session report emails'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  PERFORM 1
    FROM public.spotlights
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The CHECK would refuse this too; saying it in a sentence is what lets the
  -- refusal reach an admin as something they can act on. It is judged on the
  -- state the save asks for, so switching off and removing the picture in one
  -- save is allowed, as is adding a picture and switching on.
  IF p_enabled AND p_image_id IS NULL THEN
    RAISE EXCEPTION 'A spotlight needs a picture before it can be switched on'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The picture and the switch are assigned on every call, in one statement,
  -- so an omitted picture clears it.
  UPDATE public.spotlights
     SET image_id = p_image_id,
         enabled  = p_enabled
   WHERE id = p_id;

  PERFORM public.replace_spotlight_versions(p_id, p_versions);

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid) IS 'Admin-gated whole save of a spotlight; returns its id. p_versions is the whole version set, as replace_spotlight_versions takes it, replacing what was stored: a locale it omits is removed. The picture and whether it is enabled are assigned on every call, in one statement — an omitted picture clears it — and judged together: enabled with no picture raises check_violation. A NULL p_enabled raises null_value_not_allowed; an id no spotlight has raises no_data_found. SECURITY DEFINER because neither spotlight table carries a write grant.';


--
-- Name: FUNCTION save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_enabled boolean, p_image_id uuid) TO service_role;


