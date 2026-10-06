--
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN QUERY
  SELECT * FROM public.gedu_assigned_products((SELECT auth.uid()));
END;
$$;


--
-- Name: FUNCTION get_my_assigned_products(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every seat the calling gedu holds, exactly as gedu_assigned_products describes it for that gedu: gedu-gated on its first statement, then that function for auth.uid(). The rows, their three kinds and every fact on them are that function''s; this is the web''s way in, and get_assigned_products_for_discord_user is the Discord bot''s.';


--
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;


