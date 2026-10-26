--
-- Name: klaviyo_parent_profile_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_parent_profile_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.id]);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_parent_profile_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_parent_profile_changed() IS 'Trigger on profiles, after an update of a parent row that changes a column the Klaviyo snapshot reads: files the parent in the Klaviyo profile outbox. A profile''s insert files nothing — every gamer and gedu account is a customer row for a moment before its promotion — and a parent is filed instead when they first accept the terms (klaviyo_account_consent_accepted). Granted to nobody.';


--
-- Name: FUNCTION klaviyo_parent_profile_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_parent_profile_changed() FROM PUBLIC;


