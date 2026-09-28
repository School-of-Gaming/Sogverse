--
-- Name: set_gedu_certified(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_certified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET certified    = p_certified,
      certified_at = CASE WHEN p_certified THEN now() ELSE NULL END,
      certified_by = CASE WHEN p_certified THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;


--
-- Name: FUNCTION set_gedu_certified(p_gedu_id uuid, p_certified boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) IS 'Certify or de-certify a game educator. Admin-only (guard-first on assert_admin), and it stamps certified_at / certified_by server-side so the audit trail cannot be forged — which is why gedu_profiles carries no write grant at all and this RPC is the only way in. Called from the admin user-detail page through the admin''s own session.';


--
-- Name: FUNCTION set_gedu_certified(p_gedu_id uuid, p_certified boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gedu_certified(p_gedu_id uuid, p_certified boolean) TO authenticated;


