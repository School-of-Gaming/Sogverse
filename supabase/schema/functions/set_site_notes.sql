--
-- Name: set_site_notes(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- "You run something at this building" — the site-scoped analogue of the
  -- assignment check, and the half an admin is exempt from.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  )
  -- The substitution branch, shaped like the assignment one above rather than borrowed
  -- from a group predicate: the question this function asks is about a BUILDING,
  -- so the substitution arm is "I hold a live substitution on some group of an in-person
  -- product at this site". The owner's rule is that a sub sees everything the
  -- main gedu sees, and a site note is low-risk enough not to earn a special
  -- case of its own.
  AND NOT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.products p2 ON p2.id = g.product_id
     WHERE p2.location_id = p_location_id
       AND p2.is_remote   = false
       AND public.gedu_substitutes_group(g.id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;


--
-- Name: FUNCTION set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) IS 'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit through the location itself. Open to an ADMIN, or to a gedu who teaches on an in-person product at that site (00200). Last-write-wins on the notes, across products. Since 00272 a live SUBSTITUTION on any group of an in-person product at that site passes the site half too. The arm is location-shaped like the assignment one beside it rather than borrowed from a group predicate, because the question this function asks is about a BUILDING. It is the owner''s "a sub sees everything the main gedu sees" applied to the lowest-risk write on the surface, which is one fewer special case than carving it out would have been.';


--
-- Name: FUNCTION set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO authenticated;
GRANT ALL ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) TO service_role;


