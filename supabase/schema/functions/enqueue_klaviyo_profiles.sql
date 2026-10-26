--
-- Name: enqueue_klaviyo_profiles(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- Only customer rows. A gamer or a gedu is never in Klaviyo, so the role is
  -- read now rather than trusted from the caller. A customer who has not
  -- finished registering is filed all the same: the snapshot, which answers
  -- only for a registered parent, decides whether they reach Klaviyo. A row
  -- leaving customer, or deleted, is filed through file_klaviyo_profiles.
  SELECT public.file_klaviyo_profiles(ARRAY(
    SELECT p.id
      FROM public.profiles p
     WHERE p.id = ANY (p_customer_ids)
       AND p.role = 'customer'::public.user_role
  ));
$$;


--
-- Name: FUNCTION enqueue_klaviyo_profiles(p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) IS 'Files customer rows in the Klaviyo profile outbox through file_klaviyo_profiles: only ids whose profile exists with role customer, registered or not — get_klaviyo_parent_snapshots decides who reaches Klaviyo. Called by the triggers on every table the Klaviyo snapshot reads. Granted to nobody.';


--
-- Name: FUNCTION enqueue_klaviyo_profiles(p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) FROM PUBLIC;


