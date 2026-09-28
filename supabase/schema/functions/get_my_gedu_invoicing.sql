--
-- Name: get_my_gedu_invoicing(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gedu_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The guard already refuses a caller with no profile, so the uid is set
  -- here; the check stands because a NULL would ask the builder for every
  -- gedu, and that must never be one missed guard away.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.gedu_invoicing_document(p_month_start, v_uid);
END;
$$;


--
-- Name: FUNCTION get_my_gedu_invoicing(p_month_start date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_gedu_invoicing(p_month_start date) IS 'The calling gedu''s own month of invoicing, as the document gedu_invoicing_document builds, scoped to auth.uid(): its gedus array holds the caller alone, or is empty when they held no seat that month. Gedu-only, guard-first on assert_role(''gedu''), and deliberately not STRICT. Crosses the boundary that a gedu has no policy on substitution requests, stored sessions or cancellations, and narrows them to the caller''s own seats: the substitutions they ran, their own absences, and the groups and products those touch — never another gedu''s absence and never a reason. Staffing is read from today''s assignments, which carry no history.';


--
-- Name: FUNCTION get_my_gedu_invoicing(p_month_start date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gedu_invoicing(p_month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_invoicing(p_month_start date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_invoicing(p_month_start date) TO service_role;


