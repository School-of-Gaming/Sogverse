--
-- Name: approve_session_substitution_offer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN public.approve_substitution_offer_as((SELECT auth.uid()), p_offer_id);
END;
$$;


--
-- Name: FUNCTION approve_session_substitution_offer(p_offer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) IS 'An admin approves one offer from the Substitutions page: admin-gated on its first statement, then approve_substitution_offer_as with the caller — the same refusals, codes and messages (P0002 for an offer that is not there or was declined; check_violation for a request already settled, an absent gedu who no longer holds the seat, and an offerer who can no longer substitute), and the same admin document.';


--
-- Name: FUNCTION approve_session_substitution_offer(p_offer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) TO service_role;


