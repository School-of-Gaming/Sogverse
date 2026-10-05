--
-- Name: set_gedu_qualification(uuid, public.gedu_qualification, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_qualification: % is not a gedu', p_gedu_id;
  END IF;

  IF p_held THEN
    INSERT INTO public.gedu_qualifications (gedu_id, qualification, granted_at, granted_by)
    VALUES (p_gedu_id, p_qualification, now(), (SELECT auth.uid()))
    ON CONFLICT (gedu_id, qualification) DO NOTHING;
  ELSE
    DELETE FROM public.gedu_qualifications
     WHERE gedu_id = p_gedu_id AND qualification = p_qualification;
  END IF;
END;
$$;


--
-- Name: FUNCTION set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) IS 'Grant (p_held true) or revoke (p_held false) one qualification for one game educator. Admin-only, guard-first on assert_admin, and it refuses a target that is not a gedu. Granting stamps granted_at and granted_by server-side from the clock and the calling session; granting a qualification already held changes nothing, so the original moment and admin stand and a retry or double-click is harmless. Revoking deletes the row, and revoking a qualification not held is a no-op. SECURITY DEFINER because gedu_qualifications carries no write grant for any Data API role: this is its only writer. Called from the admin user-detail page through the admin''s own session, which is why authenticated is the only role granted EXECUTE.';


--
-- Name: FUNCTION set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_qualification(p_gedu_id uuid, p_qualification public.gedu_qualification, p_held boolean) TO authenticated;


