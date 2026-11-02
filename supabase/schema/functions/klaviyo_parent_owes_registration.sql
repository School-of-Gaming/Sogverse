--
-- Name: klaviyo_parent_owes_registration(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'::public.user_role
       AND p.registration_completed_at IS NULL
  );
$$;


--
-- Name: FUNCTION klaviyo_parent_owes_registration(p_customer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) IS 'Whether this id is a customer row still owing its registration. Such a parent''s events wait unclaimed: the finish page records a Google parent''s terms — filing account_created — a moment before it stamps the registration, and a sync claiming the event in between would find no snapshot and drop it, and with it the one subscription Sogverse ever sends. A row that is gone or not a customer answers false, so its events are claimed and dropped. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_parent_owes_registration(p_customer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) FROM PUBLIC;


