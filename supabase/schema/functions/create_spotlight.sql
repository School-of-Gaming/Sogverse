--
-- Name: create_spotlight(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.spotlights (image_id)
  VALUES (p_image_id)
  RETURNING id INTO v_id;

  PERFORM public.replace_spotlight_versions(v_id, p_versions);

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION create_spotlight(p_versions jsonb, p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) IS 'Admin-gated create of a spotlight; returns its id. It starts switched off: set_spotlight_enabled switches it on once it has a picture. p_versions is the whole version set, as replace_spotlight_versions takes it — at least one {locale, title, body}, each with both fields. The picture is a catalogue entry id or NULL for none, and the image-path trigger refuses one that is gone or not a spotlight picture. SECURITY DEFINER because neither spotlight table carries a write grant.';


--
-- Name: FUNCTION create_spotlight(p_versions jsonb, p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) TO service_role;


