--
-- Name: cancel_participation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.end_participation(
    p_participation_id,
    CASE p_reason
      WHEN 'admin_cancelled' THEN 'admin_removed'
      ELSE p_reason
    END::public.participation_end_reason
  );
END;
$$;


--
-- Name: FUNCTION cancel_participation(p_participation_id uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) IS 'legacy-cancel-participation: kept for the deployment window, because the Stripe webhook from before seats ended calls it, and removed by the follow-up that moves the webhook onto end_participation. Delegates to end_participation, reading the old admin_cancelled reason as admin_removed. service_role only.';


--
-- Name: FUNCTION cancel_participation(p_participation_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) TO service_role;


