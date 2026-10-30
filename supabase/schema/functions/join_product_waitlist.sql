--
-- Name: join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the consent gate, the clock_timestamp() ordering stamp,
  -- the row's tag and answer — lives in the engine. This function's whole job
  -- is authorization plus pinning the actor to the session.
  RETURN public.join_waitlist(
    p_product_id, p_participant_id, (SELECT auth.uid()), p_consented_documents,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
  );
END;
$$;


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check and the required-consent gate both live in join_waitlist. The UTM tag and School of Gaming mailing answer are written onto the booking a fresh join inserts. The waitlist route passes the tag only under the request''s marketing cookie consent; a parent calling this function directly can label only their own place in line, with values they typed themselves rather than ones read off a tracked visit, and the label grants nothing.';


--
-- Name: FUNCTION join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) TO service_role;


