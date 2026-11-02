--
-- Name: file_klaviyo_profiles(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.klaviyo_profile_outbox AS o (customer_id)
  SELECT DISTINCT ids.id
    FROM unnest(p_customer_ids) AS ids(id)
   WHERE ids.id IS NOT NULL
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
-- Name: FUNCTION file_klaviyo_profiles(p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) IS 'Files the given ids in the Klaviyo profile outbox whatever their role: a new row each, or seq bumped, the row due now and its attempts reset; then, once per transaction, the kick. The unfiltered half of enqueue_klaviyo_profiles, called directly only for a row that is no longer a parent — its delete, and its role leaving customer — so that the snapshot''s silence deletes its Klaviyo profile. Granted to nobody.';


--
-- Name: FUNCTION file_klaviyo_profiles(p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) FROM PUBLIC;


