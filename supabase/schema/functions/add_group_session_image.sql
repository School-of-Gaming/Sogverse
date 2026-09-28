--
-- Name: add_group_session_image(uuid, date, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_count      integer;
  v_image_id   uuid;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it, exactly as every other session
  -- writer is.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Any gedu assigned to the group may attach and remove photos, matching how
  -- the report itself is edited: there is no per-photo ownership.
  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The HARD sanity ceiling on a cap the caller supplies. The product cap lives
  -- in one constant in the contracts module and is passed in from there; this is
  -- only here so a buggy caller cannot ask for something absurd.
  IF p_max_images IS NULL OR p_max_images < 1 OR p_max_images > 24 THEN
    RAISE EXCEPTION
      'A photo cap of % is outside the 1..24 a caller may ask for',
      COALESCE(p_max_images::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from the NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION
      'Image dimensions % x % are not a plausible session photo',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  -- Take the session row's lock BEFORE counting, so two tabs uploading at once
  -- serialize here and the second one sees the first one's row. Without it both
  -- would count four and both would insert a fifth.
  PERFORM 1 FROM public.group_sessions WHERE id = v_session_id FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM public.group_session_images
   WHERE session_id = v_session_id;

  IF v_count >= p_max_images THEN
    RAISE EXCEPTION
      'This session already holds % photos, which is the cap', v_count
      USING ERRCODE = 'P0023';
  END IF;

  INSERT INTO public.group_session_images (
    session_id, width, height, created_by
  )
  VALUES (v_session_id, p_width, p_height, v_uid)
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;


--
-- Name: FUNCTION add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) IS 'Attach one photo to a session''s report, materializing the session row if needed, and hand back the id the object will be named by. Open to an ADMIN or to the gedu assigned to the group, guard-first on assert_role with the assignment question as a second 42501 — the same shape set_group_session_notes carries, and the same half an admin is exempt from. Addressed by (group, session date) like every other session write. Takes the CAP as a parameter, because the product cap lives in one constant in the contracts module and raising it must not need a migration; SQL holds only a hard sanity ceiling of 24 so a buggy caller cannot pass something absurd. Counts and inserts while holding the session row''s lock, so concurrent tabs cannot overshoot the cap, and refuses with SQLSTATE P0023 when it is already met — a code of its own because the UI answers it differently from every other refusal ("remove one first", not "that did not work"). Implausible dimensions are refused with check_violation as one class, the table''s own CHECKs standing behind that. Called on the UPLOADER''S OWN client: the guard is the authorization, and the route uploads the object with the admin client afterwards — deleting this row again if that upload fails, because an object-less row is a broken image in the feed and in every mail sent later.';


--
-- Name: FUNCTION add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) TO authenticated;
GRANT ALL ON FUNCTION public.add_group_session_image(p_group_id uuid, p_session_date date, p_width integer, p_height integer, p_max_images integer) TO service_role;


