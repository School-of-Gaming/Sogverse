--
-- Name: assert_can_delete_session_image(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_can_delete_session_image(p_image_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- An admin, or a gedu. Guard-first on the first statement, in the shape the
  -- authorization spine reads and every other session RPC carries.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way, exactly as they do in
  -- delete_group_session_image. The caller has no right to learn which it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The id it validated, so a caller has a positive answer rather than the
  -- absence of an error. Returning it discloses nothing: it is the id the caller
  -- just sent, and it comes back only on the path where they were allowed.
  RETURN p_image_id;
END;
$$;


--
-- Name: FUNCTION assert_can_delete_session_image(p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) IS 'May this caller remove this photo? A CHECK-ONLY function: it mutates nothing, and it exists because the route deletes the storage object BEFORE the row, on the service-role client, and an admin client must never act for a caller whose authorization has not been proved. Object-first is what makes a failed removal visible and retryable — the row is what every surface reads, so deleting it first would take the tile away and leave the object standing in a public bucket with nothing left to retry against. The gate is byte for byte delete_group_session_image''s: guard-first on assert_role for an ADMIN or a gedu, then the group resolved from the image''s own session row, with a photo id belonging to another group and one belonging to nothing refused IDENTICALLY with 42501 — never distinguish them, or this becomes an oracle for real photo ids, which name objects whose unguessable names are the access control. Returns the id it validated. It does not replace the delete RPC''s own guard, which still runs on the actual delete afterwards; the window between the two is cosmetic, because nothing inside it can widen what a caller may do.';


--
-- Name: FUNCTION assert_can_delete_session_image(p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO service_role;


