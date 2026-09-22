--
-- Name: join_product_waitlist(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the consent gate, the clock_timestamp() ordering stamp —
  -- is unchanged and lives in the engine. This function's whole job is
  -- authorization plus pinning the actor to the session.
  RETURN public.join_waitlist(
    p_product_id, p_participant_id, (SELECT auth.uid()), p_consented_documents
  );
END;
$$;


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check and, since 00210, the required-consent gate both live in join_waitlist.';


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) TO service_role;


