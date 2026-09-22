--
-- Name: delete_group_session_image(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_group_session_image(p_image_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way. Deliberate: the caller
  -- has no right to learn which of the two it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.group_session_images WHERE id = p_image_id;
END;
$$;


--
-- Name: FUNCTION delete_group_session_image(p_image_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_group_session_image(p_image_id uuid) IS 'Remove one photo''s ROW from a session''s report. Open to an ADMIN or to ANY gedu assigned to the group — there is no per-photo ownership, matching how the report itself is edited under the last-editor model. Guard-first on assert_role; the group is then resolved from the image''s own session row, and that resolution is the second half of the gate. A photo id that belongs to another group and one that belongs to nothing are refused identically with 42501, so this cannot be used as an oracle for real photo ids. The route calls this LAST: it authorizes with assert_can_delete_session_image, removes the OBJECT through the Storage API (never with SQL against storage.objects, which orphans the backing file), and only then deletes the row here — so that a removal which failed to remove the picture leaves the photo on the card, visible and retryable, instead of taking the tile away while the object stands in a public bucket. This function''s own guard is not replaced by that check; it runs again on the actual delete. A row that survives a failed delete after its object is gone renders as a broken thumbnail, and the ordinary remove control is its repair: the storage API answers a delete of an absent object as success, so the retry reaches here and clears the row.';


--
-- Name: FUNCTION delete_group_session_image(p_image_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO service_role;


