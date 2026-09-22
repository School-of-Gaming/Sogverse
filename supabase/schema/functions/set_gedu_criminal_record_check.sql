--
-- Name: set_gedu_criminal_record_check(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET criminal_record_check_passed = p_passed,
      criminal_record_check_at     = CASE WHEN p_passed THEN now() ELSE NULL END,
      criminal_record_check_by     = CASE WHEN p_passed THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;


--
-- Name: FUNCTION set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) IS 'Record — or withdraw — that an admin has seen an acceptable criminal record extract (rikostaustaote) for one game educator. The document itself is never stored: Finnish law 504/2002 has the educator obtain it themselves and lets us keep only the fact that it was presented and when. Admin-only, guard-first on assert_admin, and it refuses a target that is not a gedu. It stamps criminal_record_check_at / criminal_record_check_by server-side so the audit trail cannot be forged — which is why gedu_profiles carries no write grant at all and this RPC is the only way in — and nulls both when the check is withdrawn. Recording it GATES NOTHING: like contract acceptance it informs the certification decision, and admin certification remains the only blocking lever over an educator. Called from the admin user-detail page through the admin''s own session, which is why authenticated is the only role granted EXECUTE.';


--
-- Name: FUNCTION set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_criminal_record_check(p_gedu_id uuid, p_passed boolean) TO authenticated;


