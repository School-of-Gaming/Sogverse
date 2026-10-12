--
-- Name: set_spotlight_enabled(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_image_id uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the spotlight is enabled'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  SELECT image_id INTO v_image_id
    FROM public.spotlights
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The CHECK would refuse this too; the sentence is for the admin.
  IF p_enabled AND v_image_id IS NULL THEN
    RAISE EXCEPTION 'A spotlight needs a picture before it can be switched on'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.spotlights
     SET enabled = p_enabled
   WHERE id = p_id;

  RETURN p_id;
END;
$$;


--
-- Name: FUNCTION set_spotlight_enabled(p_id uuid, p_enabled boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) IS 'Admin-gated switch of whether a spotlight is appended to session report emails; returns its id. Switching on a spotlight with no picture raises check_violation; a NULL p_enabled raises null_value_not_allowed; an id no spotlight has raises no_data_found. SECURITY DEFINER because spotlights carries no write grant.';


--
-- Name: FUNCTION set_spotlight_enabled(p_id uuid, p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) TO service_role;


