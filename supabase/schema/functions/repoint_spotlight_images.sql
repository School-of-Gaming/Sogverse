--
-- Name: repoint_spotlight_images(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving pictures to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  UPDATE public.spotlights
     SET image_id = p_to
   WHERE image_id = p_from;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;


--
-- Name: FUNCTION repoint_spotlight_images(p_from uuid, p_to uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) IS 'Admin-gated half of the image catalogue''s replace: points every spotlight that uses entry p_from at entry p_to, in one statement, and returns how many moved. An enabled spotlight stays enabled and shows the new picture in the next mail. The image-path trigger re-derives each path and refuses a p_to that is gone or not a spotlight picture. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because spotlights carries no write grant.';


--
-- Name: FUNCTION repoint_spotlight_images(p_from uuid, p_to uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) TO authenticated;
GRANT ALL ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) TO service_role;


