--
-- Name: get_admin_gedu_invoicing(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_gedu_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN public.gedu_invoicing_document(p_month_start, NULL);
END;
$$;


--
-- Name: FUNCTION get_admin_gedu_invoicing(p_month_start date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_gedu_invoicing(p_month_start date) IS 'One calendar month of gedu invoicing for EVERY gedu with a seat in it, as the document gedu_invoicing_document builds. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input; the month check runs after the guard, so an unauthorized caller learns nothing about the argument shape. Crosses the boundary that assignments, substitution requests, stored sessions and cancellations of every gedu are not all readable by one policy, and hands back only the invoicing facts — never a substitution reason. Staffing is read from today''s assignments, which carry no history.';


--
-- Name: FUNCTION get_admin_gedu_invoicing(p_month_start date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_gedu_invoicing(p_month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_gedu_invoicing(p_month_start date) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_gedu_invoicing(p_month_start date) TO service_role;


