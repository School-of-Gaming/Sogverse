--
-- Name: enqueue_klaviyo_profiles(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Only parents. A gamer or a gedu is never in Klaviyo, and every account
  -- starts life as a customer row the new-user trigger made, so the role is
  -- read now rather than trusted from the caller. A parent deleted in this
  -- transaction is filed by the profile delete trigger itself, not here.
  INSERT INTO public.klaviyo_profile_outbox AS o (customer_id)
  SELECT DISTINCT p.id
    FROM public.profiles p
   WHERE p.id = ANY (p_customer_ids)
     AND p.role = 'customer'::public.user_role
  ON CONFLICT (customer_id) DO UPDATE
     SET seq             = o.seq + 1,
         next_attempt_at = now(),
         attempts        = 0;

  IF FOUND THEN
    PERFORM public.kick_klaviyo_sync_once();
  END IF;
END;
$$;


--
-- Name: FUNCTION enqueue_klaviyo_profiles(p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) IS 'Files parents in the Klaviyo profile outbox: a new row each, or seq bumped, the row due now and its attempts reset. Only ids whose profile exists with role customer are filed. Then, once per transaction, the kick. Called by the triggers on every table the Klaviyo snapshot reads. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_profiles(p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) FROM PUBLIC;


